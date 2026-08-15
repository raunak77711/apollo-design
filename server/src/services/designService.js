import { getAIProvider } from './ai/index.js';
import { curateImages } from './images/curator.js';
import { compose } from '../design/layout.js';
import { critique, needsRework, summarize } from '../design/critique.js';
import { detectFormat, findLayout, normalizeBrief, VARIATIONS } from '../design/artDirection.js';

/**
 * The generation pipeline.
 *
 *   prompt
 *     → art direction        (DeepSeek, or the heuristic planner)
 *     → photography          (Pexels + Unsplash, judged on composition)
 *     → composition          (grid, type scale, layout archetype)
 *     → critique             (measured, then repaired)
 *     → operations
 *
 * Each stage does the thing it is actually good at. The model is never asked
 * for coordinates and the code is never asked for taste.
 */

const MAX_ATTEMPTS = 2;

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
};

function slotsFor(brief) {
  const spec = SLOTS[brief.layout] || SLOTS['split-vertical'];
  const { width, height } = brief.canvas;
  const slots = spec.map(([w, h]) => ({ width: Math.round(width * w), height: Math.round(height * h) }));
  // A portrait canvas splits horizontally rather than vertically.
  if (brief.layout === 'split-vertical' && width / height < 0.95) {
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
export async function buildDesign({ message, document, variation = null, provider = getAIProvider() }) {
  const canvas = resolveCanvas(message, document);
  let best = null;
  let plan = null;
  let notes = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await safePlan(provider, {
      message,
      canvas,
      variation,
      critique: attempt > 0 ? notes : null,
      previous: attempt > 0 ? plan : null,
    });
    plan = raw;

    const brief = normalizeBrief(raw, { canvas, prompt: message });
    const images = brief.images.length
      ? await curateImages(brief.images, { slots: slotsFor(brief), palette: brief.palette })
      : [];

    const composed = compose(adaptToImagery(brief, images), images, { seed: `${message}:${variation?.id || ''}:${attempt}` });
    const review = critique(composed.elements, { canvas: brief.canvas, brief, grid: composed.grid });

    const candidate = { brief, images, composed, review };
    if (!best || review.score > best.review.score) best = candidate;

    // A second pass is only worth the latency when the first one genuinely
    // failed — and only when there is a model that can reconsider.
    if (!needsRework(review) || typeof provider.planDesign !== 'function') break;
    notes = review.outstanding.map((issue) => issue.message);
  }

  const { brief, images, review } = best;
  const operations = [
    ...clearOperations(document),
    { type: 'SET_CANVAS', changes: { width: brief.canvas.width, height: brief.canvas.height, background: brief.palette.background } },
    ...review.elements.map((element) => ({ type: 'CREATE_ELEMENT', element })),
  ];

  return { operations, brief, images, review, message: describe(brief, images, review) };
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
function describe(brief, images, review) {
  const layout = findLayout(brief.layout);
  const parts = [`${brief.styleRef.label} direction — ${(layout?.label || brief.layout).toLowerCase()}.`];

  if (brief.rationale) parts.push(brief.rationale);

  const hero = images.find((i) => i.url);
  if (hero) {
    const where = hero.negativeSpace && hero.negativeSpace !== 'any' ? ` with quiet space ${hero.negativeSpace}` : '';
    parts.push(`Photography from ${hero.provider}${where}, cropped to its focal point.`);
  }

  const notes = summarize(review);
  if (notes) parts.push(`Apollo ${notes}.`);
  parts.push('Every layer is editable — select one to adjust it.');
  return parts.join(' ');
}
