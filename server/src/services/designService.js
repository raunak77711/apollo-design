import { getAIProvider } from './ai/index.js';
import { curateImages, generateBespokeImage } from './images/curator.js';
import { getGeminiProvider } from './images/GeminiProvider.js';
import { compose } from '../design/layout.js';
import { critique, needsRework, summarize } from '../design/critique.js';
import { detectFormat, findLayout, normalizeBrief, VARIATIONS } from '../design/artDirection.js';
import { applyPreferences, describePreferences } from '../design/preferences.js';
import { applyScribble, describeScribble } from '../design/scribble.js';
import { readScribble } from './scribbleReader.js';

/**
 * The generation pipeline.
 *
 *   prompt (+ an optional scribble)
 *     → reading              (the drawing, if there is one: ink, then meaning)
 *     → art direction        (DeepSeek, or the heuristic planner)
 *     → photography          (Pexels + Unsplash, judged on composition)
 *     → composition          (grid, type scale, layout archetype)
 *     → critique             (measured, then repaired)
 *     → operations
 *
 * A scribble does not add a stage so much as constrain every later one: it
 * fixes the structure, the subject and where the type lives, and the rest of
 * the pipeline then does its ordinary job to that specification. See
 * `design/scribble.js`.
 *
 * Each stage does the thing it is actually good at. The model is never asked
 * for coordinates and the code is never asked for taste.
 *
 * `onStage` is called as each of those boundaries is crossed, which is what the
 * generation screen narrates. It reports what the pipeline is *actually* doing
 * — there is deliberately no progress fraction, because the two slow stages
 * (the model call and image sourcing) have no measurable progress to report.
 */

const MAX_ATTEMPTS = 2;

/**
 * How slow the first pass is allowed to have been before the rework is
 * abandoned. A rework repeats every upstream call the pipeline makes, so when
 * the first pass was already dragging — a degraded photo library, a sluggish
 * model — a second one doubles the wait for a design that is only *maybe*
 * better. Past this point, the best of what we already have wins.
 */
const REWORK_BUDGET_MS = 45_000;

/**
 * Image slot proportions per layout, so a photograph can be judged against the
 * box it will fill *before* the composition is built. Fractions of the canvas.
 */
const SLOTS = {
  'full-bleed-hero': [[1, 1]],
  'split-vertical': [[0.5, 1]],
  'editorial-asymmetric': [[0.46, 0.86]],
  'type-poster': [],
  'minimal-frame': [[0.42, 0.52]],
  'overlap-collage': [[0.56, 0.52]],
  'band-stack': [[1, 0.42]],
  'corner-hero': [[0.62, 0.62]],
  'grid-editorial': [[0.3, 0.3], [0.3, 0.3], [0.3, 0.3]],
  'banner-lockup': [[0.42, 1]],
  'stat-grid': [],
  'labeled-diagram': [[0.5, 1]],
};

function slotsFor(brief) {
  const spec = SLOTS[brief.layout] || SLOTS['split-vertical'];
  const { width, height } = brief.canvas;
  const slots = spec.map(([w, h]) => ({ width: Math.round(width * w), height: Math.round(height * h) }));
  // A portrait canvas splits horizontally rather than vertically — true for
  // 'labeled-diagram' too, since it renders through the same archetype.
  if ((brief.layout === 'split-vertical' || brief.layout === 'labeled-diagram') && width / height < 0.95) {
    return [{ width, height: Math.round(height * 0.54) }];
  }
  return slots.length ? slots : [{ width, height }];
}

/** The canvas to design on: an explicit format in the prompt wins, else keep the project's. */
export function resolveCanvas(message, document) {
  const format = detectFormat(message);
  const current = document?.canvas || { width: 1080, height: 1080 };
  if (format && (format.width !== current.width || format.height !== current.height)) {
    return { width: format.width, height: format.height, background: current.background };
  }
  return { ...current };
}

/**
 * Build one complete design. Returns the operations, the brief that produced
 * them and the critique — the caller decides what to do with each.
 */
export async function buildDesign({
  message,
  document,
  variation = null,
  provider = getAIProvider(),
  referenceImages = [],
  preferences = null,
  scribble = null,
  onStage = null,
}) {
  const canvas = resolveCanvas(message, document);
  const stage = (name, detail) => {
    try {
      onStage?.(name, detail);
    } catch {
      /* narration must never be able to fail a generation */
    }
  };

  const startedAt = Date.now();
  let best = null;
  let plan = null;
  let notes = [];

  // The user's own words describe what a reference photo is; DeepSeek can't
  // see the file itself, so Gemini captions it once up front and that caption
  // rides along in the brief prompt as `referenceNote` — otherwise an attached
  // reference is silently dropped and has zero effect on the direction.
  const referenceNote = await describeFirstReference(referenceImages);

  // The drawing is read once, before the first attempt — it is the same
  // drawing on a rework, and re-reading it would cost a second vision call to
  // learn nothing. A blank canvas, an unreadable image or no drawing at all
  // all come back null, and the pipeline simply designs from the words.
  let reading = null;
  if (scribble) {
    stage('reading');
    reading = await safeRead(scribble, message);
  }
  const scribbleNote = describeScribble(reading);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    stage(attempt === 0 ? 'directing' : 'reconsidering');
    const raw = await safePlan(provider, {
      message,
      canvas,
      variation,
      critique: attempt > 0 ? notes : null,
      previous: attempt > 0 ? plan : null,
      referenceNote,
      preferenceNote: describePreferences(preferences),
      scribbleNote,
    });
    plan = raw;

    // The model was told about the preferences and the drawing, but never
    // trusted to have followed either — this is where they are enforced.
    // Order matters: preferences are what the user asked for in words, the
    // scribble is what they drew, and a drawing is the more specific
    // instruction, so it gets the last word on structure.
    const { plan: preferred, forceLayout: preferenceLayout } = applyPreferences(raw, preferences, { canvas });
    const { plan: directed, forceLayout: scribbleLayout, imageBox } = applyScribble(preferred, reading, { canvas });
    const brief = normalizeBrief(directed, {
      canvas,
      prompt: message,
      forceLayout: scribbleLayout || preferenceLayout,
    });
    // Not part of the model's brief — a measurement taken directly off the
    // drawing. Only `full-bleed-hero` and `split-vertical` (in layout.js)
    // read it; every other archetype places the image with its own grid.
    brief.imageBox = imageBox;

    let images = [];
    if (brief.images.length) {
      const slots = slotsFor(brief);
      // The drawn box is also the truest slot to generate against, when
      // there is one — it is what decides the aspect ratio Flux renders at.
      const heroSlot = imageBox || slots[0];
      // A scribble is the one signal specific enough to justify bespoke art
      // over a stock search: the user drew an actual scene, so generating it
      // beats hoping a photo library has something close. Run alongside the
      // stock curator rather than after it, so a scribble-driven generation
      // costs no extra latency over an ordinary one.
      const bespokeHero = reading
        ? generateBespokeImage(brief.images[0], { slot: heroSlot, palette: brief.palette, sceneNote: reading.reading })
        : Promise.resolve(null);
      // The stage is announced by the curator's own first callback, which
      // fires as it starts on slot one — announcing it here as well would
      // just send the same event twice.
      const [bespoke, curated] = await Promise.all([
        bespokeHero,
        curateImages(brief.images, {
          slots,
          palette: brief.palette,
          onProgress: (index, total) => stage('curating', { index, count: total }),
        }),
      ]);
      images = curated;
      if (bespoke) images[0] = bespoke;
    }

    stage('composing');
    const composed = compose(adaptToImagery(brief, images), images, { seed: `${message}:${variation?.id || ''}:${attempt}` });
    stage('refining');
    const review = critique(composed.elements, { canvas: brief.canvas, brief, grid: composed.grid });

    const candidate = { brief, images, composed, review };
    if (!best || review.score > best.review.score) best = candidate;

    // A second pass is only worth the latency when the first one genuinely
    // failed — and only when there is a model that can reconsider.
    if (!needsRework(review) || typeof provider.planDesign !== 'function') break;
    const elapsed = Date.now() - startedAt;
    if (elapsed > REWORK_BUDGET_MS) {
      console.warn(`[design] first pass took ${Math.round(elapsed / 1000)}s — shipping it rather than reworking`);
      break;
    }
    notes = review.outstanding.map((issue) => issue.message);
  }

  const { brief, images, review } = best;
  const operations = [
    ...clearOperations(document),
    { type: 'SET_CANVAS', changes: { width: brief.canvas.width, height: brief.canvas.height, background: brief.palette.background } },
    ...review.elements.map((element) => ({ type: 'CREATE_ELEMENT', element })),
  ];

  return { operations, brief, images, review, scribble: reading, message: describe(brief, images, review, reading) };
}

/** Generate the three directions side by side. */
export async function buildVariations({ message, document }) {
  const provider = getAIProvider();
  const results = await Promise.allSettled(
    VARIATIONS.map((variation) => buildDesign({ message, document, variation, provider }))
  );

  return results
    .map((result, i) =>
      result.status === 'fulfilled'
        ? {
            id: VARIATIONS[i].id,
            label: VARIATIONS[i].label,
            operations: result.value.operations,
            score: result.value.review.score,
            layout: findLayout(result.value.brief.layout)?.label || result.value.brief.layout,
            style: result.value.brief.styleRef.label,
            message: result.value.message,
          }
        : null
    )
    .filter(Boolean);
}

/* ------------------------------- internals ------------------------------- */

/** Caption the first reference image for the brief prompt, or '' if there is none/no key/it fails. */
async function describeFirstReference(referenceImages) {
  const first = referenceImages?.[0];
  if (!first) return '';
  const gemini = getGeminiProvider();
  if (!gemini.configured) return '';
  try {
    return await gemini.describeReference(first);
  } catch (err) {
    console.warn(`[design] reference captioning failed (${err.message})`);
    return '';
  }
}

/** Read the drawing, or null — a failed read must never fail a generation. */
async function safeRead(scribble, message) {
  try {
    return await readScribble(scribble, { prompt: message });
  } catch (err) {
    console.warn(`[design] scribble read failed (${err.message}) — designing from the prompt alone`);
    return null;
  }
}

async function safePlan(provider, args) {
  if (typeof provider.planDesign !== 'function') return {};
  try {
    return await provider.planDesign(args);
  } catch (err) {
    console.warn(`[design] planning failed (${err.message}) — falling back to heuristics`);
    // A failed model call must never mean a failed design: the heuristic
    // planner produces the same brief shape.
    const { MockProvider } = await import('./ai/MockProvider.js');
    return new MockProvider().planDesign(args);
  }
}

/**
 * Let the photograph inform the composition.
 *
 * The curator reports where each frame is quiet and how bright it is; that
 * feeds back into the brief so the type goes where the picture has room, and
 * so a layout that depends on imagery is swapped out when none was found.
 */
function adaptToImagery(brief, images) {
  const hero = images[0];
  if (!hero) return brief;

  const next = { ...brief, images: brief.images.map((plan, i) => ({ ...plan, ...(images[i] || {}) })) };

  if (!hero.url) {
    // Nothing could be sourced — a typographic layout is far better than an
    // empty photo box.
    if (brief.layout !== 'type-poster') next.layout = 'type-poster';
    return next;
  }

  // Trust the measured quiet side over the requested one.
  if (hero.negativeSpace && hero.negativeSpace !== 'any') {
    next.images = next.images.map((plan, i) => (i === 0 ? { ...plan, negativeSpace: hero.negativeSpace } : plan));
  }
  return next;
}

/** Regenerating replaces the design; deleting a root takes its subtree with it. */
function clearOperations(document) {
  return (document?.elements || [])
    .filter((el) => !el.parentId)
    .map((el) => ({ type: 'DELETE_ELEMENT', targetId: el.id }));
}

/** What Apollo says about the design it just made. */
function describe(brief, images, review, reading) {
  const layout = findLayout(brief.layout);
  const parts = [`${brief.styleRef.label} direction — ${(layout?.label || brief.layout).toLowerCase()}.`];

  // When there was a drawing, say what was taken from it. The user spent
  // effort on that composition and deserves to see it was actually read.
  if (reading) {
    const drawn = reading.subject || reading.regions.find((r) => r.label)?.label;
    parts.push(
      drawn
        ? `Built on your sketch — ${drawn}, kept where you placed it.`
        : 'Built on your sketch, keeping your composition.'
    );
  }

  if (brief.rationale) parts.push(brief.rationale);

  const hero = images.find((i) => i.url);
  if (hero) {
    const where = hero.negativeSpace && hero.negativeSpace !== 'any' ? ` with quiet space ${hero.negativeSpace}` : '';
    parts.push(
      hero.provider === 'openrouter'
        ? `Bespoke artwork generated for this sketch${where}.`
        : `Photography from ${hero.provider}${where}, cropped to its focal point.`
    );
  }

  const notes = summarize(review);
  if (notes) parts.push(`Apollo ${notes}.`);
  parts.push('Every layer is editable — select one to adjust it.');
  return parts.join(' ');
}
