/**
 * The scribble as a design constraint.
 *
 * A drawing is not a picture Apollo copies — it is a *blueprint*. The user has
 * already made the decisions a layout engine is worst at guessing: what the
 * subject is, where it sits, how big it is relative to everything else, where
 * the words go, and what the whole thing is for. Throwing that away and
 * generating "a poster about the same topic" would be the single most obvious
 * way to get this feature wrong.
 *
 * So a scribble enters the pipeline the same way creative preferences do
 * (`preferences.js`): as a constraint applied to the *raw plan*, before
 * `normalizeBrief`, so the user's structure and the model's taste go through
 * exactly the same validation, aspect filtering and palette repair. The model
 * is told what was drawn (`describeScribble`) but never trusted to have obeyed
 * it — this module is the enforcement.
 *
 * What a scribble decides:  structure (which layout archetype), focal balance
 *                           (type-led or image-led), where the photograph must
 *                           be quiet, what the subject is, and roughly what
 *                           each piece of text is for.
 * What it never decides:    coordinates. The composer still builds every
 *                           design on a real grid, which is the whole reason
 *                           the output looks art-directed instead of traced.
 *
 * Pure data plus normalisation — no I/O, no model calls. Reading the pixels is
 * `services/scribbleReader.js`; this file only interprets the reading.
 */

import { findLayout, layoutsForAspect } from './artDirection.js';

/* ------------------------------- vocabulary ------------------------------ */

/**
 * What a mark on the canvas turns out to be. Kept deliberately small: these
 * are the only things the pipeline can act on differently, and a role it
 * cannot act on is a role that has no business existing.
 */
export const REGION_ROLES = ['subject', 'headline', 'body', 'cta', 'mark', 'frame', 'decoration'];

/** Roles that become live text layers rather than photography. */
const TEXT_ROLES = new Set(['headline', 'body', 'cta']);

/* -------------------------------- geometry ------------------------------- */

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** A normalised 0..1 box, clipped to the canvas and never zero-sized. */
function normalizeBox(box = {}) {
  const x = clamp01(num(box.x));
  const y = clamp01(num(box.y));
  const width = clamp01(num(box.width, 0.2));
  const height = clamp01(num(box.height, 0.2));
  return {
    x,
    y,
    width: Math.max(0.02, Math.min(width, 1 - x)),
    height: Math.max(0.02, Math.min(height, 1 - y)),
  };
}

const area = (box) => box.width * box.height;
const centerX = (box) => box.x + box.width / 2;
const centerY = (box) => box.y + box.height / 2;

/** Do two boxes genuinely overlap, or merely touch? */
function overlaps(a, b, threshold = 0.12) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = x * y;
  if (!intersection) return false;
  return intersection / Math.min(area(a), area(b)) > threshold;
}

/* ------------------------------ normalisation ---------------------------- */

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '');

/**
 * Everything the reader produced, reduced to what the pipeline can use.
 * Returns null when there is nothing usable — an empty canvas and a failed
 * read are the same thing downstream, and both mean "just design normally".
 */
export function normalizeScribble(input) {
  if (!input || typeof input !== 'object') return null;

  const regions = (Array.isArray(input.regions) ? input.regions : [])
    .slice(0, 14)
    .map((region) => ({
      role: REGION_ROLES.includes(region?.role) ? region.role : 'subject',
      label: text(region?.label, 60),
      // The words the user actually wrote, when they wrote any. Rough
      // handwriting read by a vision model is unreliable enough that this is
      // treated as a strong hint for the copywriter, never as final copy.
      words: text(region?.words, 90),
      box: normalizeBox(region?.box),
      weight: clamp01(num(region?.weight, 0.5)),
    }))
    // A region with no discernible extent is noise, not a decision.
    .filter((region) => area(region.box) > 0.0008);

  const scribble = {
    regions,
    subject: text(input.subject, 120),
    designType: text(input.designType, 40),
    mood: (Array.isArray(input.mood) ? input.mood : [])
      .filter((m) => typeof m === 'string' && m.trim())
      .slice(0, 4)
      .map((m) => m.trim().slice(0, 24)),
    // Free prose from the vision pass — what the drawing looks like it is.
    reading: text(input.reading, 600),
    // How much of the canvas carries ink. A dense scribble wants a dense
    // layout; four marks on an empty sheet wants air.
    coverage: clamp01(num(input.coverage, 0)),
    // Purely geometric, always available even with no vision model at all.
    structure: normalizeStructure(input.structure),
    source: input.source === 'vision' ? 'vision' : 'geometry',
  };

  if (!scribble.regions.length && !scribble.subject && !scribble.structure) return null;
  return scribble;
}

/** The geometric read: ink distribution, with no idea what any of it means. */
function normalizeStructure(input) {
  if (!input || typeof input !== 'object') return null;
  const bands = Array.isArray(input.bands) ? input.bands.slice(0, 3).map((b) => clamp01(num(b))) : [];
  const columns = Array.isArray(input.columns) ? input.columns.slice(0, 3).map((c) => clamp01(num(c))) : [];
  return {
    // Ink weight in the top / middle / bottom third and the left / centre /
    // right third. Between them they describe every composition the layout
    // engine can build.
    bands: bands.length === 3 ? bands : [0.33, 0.34, 0.33],
    columns: columns.length === 3 ? columns : [0.33, 0.34, 0.33],
    ink: clamp01(num(input.ink, 0)),
    bounds: input.bounds ? normalizeBox(input.bounds) : { x: 0, y: 0, width: 1, height: 1 },
    clusters: Math.max(0, Math.min(24, Math.round(num(input.clusters, 0)))),
  };
}

/* ---------------------------- reading the shape --------------------------- */

/**
 * Which layout archetype the drawing actually describes.
 *
 * This is the heart of the feature. Every branch below is a claim about what
 * someone meant by where they put their marks, and each one is checked against
 * the *drawn structure* rather than against the words the user typed — a
 * scribble that says "picture on the left, words on the right" has to come out
 * as a split composition even if the prompt says nothing at all.
 *
 * Returns a layout id, or null to leave the choice to the art director.
 */
export function layoutFromScribble(scribble, { canvas } = {}) {
  if (!scribble) return null;

  const ratio = (canvas?.width || 1080) / (canvas?.height || 1080);
  const allowed = layoutsForAspect(ratio);
  const pick = (...ids) => ids.find((id) => allowed.includes(id)) || null;

  const subjects = scribble.regions.filter((r) => r.role === 'subject');
  const texts = scribble.regions.filter((r) => TEXT_ROLES.has(r.role));
  const structure = scribble.structure;

  /* ---- several subjects of a similar size is a grid, whatever else ------ */

  if (subjects.length >= 3) {
    const sizes = subjects.map(area).sort((a, b) => a - b);
    const even = sizes[sizes.length - 1] / Math.max(sizes[0], 0.0001) < 3.2;
    if (even) return pick('grid-editorial', 'band-stack');
  }

  /* ---- nothing drawn but words: typography is the design ---------------- */

  if (!subjects.length && texts.length) return pick('type-poster', 'minimal-frame');

  /* ---- several subjects filling the sheet are one scene, not a list ----- */

  // A moon above a mountain above a figure is not three subjects competing
  // for the frame — it is one landscape, and it wants one photograph. Judging
  // them separately would hand the biggest of them a panel and drop the rest,
  // which is the surest way to lose the picture the user actually drew.
  const scene = sceneBox(subjects);
  const hero = scene
    ? { box: scene }
    : subjects.slice().sort((a, b) => area(b) - area(a))[0];

  if (hero) {
    const heroArea = area(hero.box);
    const overlapping = texts.some((t) => overlaps(t.box, hero.box));

    /* ---- the subject fills the sheet: everything sits on top of it ------ */

    if (heroArea > 0.55 || (heroArea > 0.4 && overlapping)) {
      return pick('full-bleed-hero', 'band-stack');
    }

    /* ---- type crossing the subject's edge is a collage ------------------ */

    if (overlapping && heroArea > 0.18) return pick('overlap-collage', 'full-bleed-hero');

    /* ---- a clean vertical division: picture one side, words the other --- */

    const heroSide = centerX(hero.box) < 0.45 ? 'left' : centerX(hero.box) > 0.55 ? 'right' : null;
    if (heroSide && texts.length) {
      const textsOpposite = texts.every((t) =>
        heroSide === 'left' ? centerX(t.box) > 0.48 : centerX(t.box) < 0.52
      );
      if (textsOpposite) {
        return ratio >= 1.5 ? pick('banner-lockup', 'split-vertical') : pick('split-vertical', 'banner-lockup');
      }
    }

    /* ---- the subject tucked into a corner ------------------------------- */

    const cx = centerX(hero.box);
    const cy = centerY(hero.box);
    const cornered = (cx < 0.38 || cx > 0.62) && (cy < 0.38 || cy > 0.62);
    if (cornered && heroArea < 0.34) return pick('corner-hero', 'editorial-asymmetric');

    /* ---- a small subject alone in a lot of space ------------------------ */

    if (heroArea < 0.16 && (scribble.coverage < 0.12 || (structure?.ink ?? 1) < 0.1)) {
      return pick('minimal-frame', 'editorial-asymmetric');
    }

    /* ---- stacked: subject in one horizontal band, words in another ------ */

    const heroBand = centerY(hero.box) < 0.42 ? 'top' : centerY(hero.box) > 0.58 ? 'bottom' : null;
    if (heroBand && texts.length) {
      const textsBelow = heroBand === 'top' && texts.every((t) => centerY(t.box) > 0.45);
      const textsAbove = heroBand === 'bottom' && texts.every((t) => centerY(t.box) < 0.55);
      if (textsBelow || textsAbove) return pick('band-stack', 'full-bleed-hero', 'split-vertical');
    }

    return pick('editorial-asymmetric', 'full-bleed-hero');
  }

  /* ---- no labelled regions at all: fall back to raw ink distribution ---- */

  if (structure) {
    const [top, middle, bottom] = structure.bands;
    const [left, , right] = structure.columns;

    if (structure.ink < 0.035) return null; // barely drawn — don't over-read it
    if (Math.abs(left - right) > 0.22) {
      return ratio >= 1.5 ? pick('banner-lockup', 'split-vertical') : pick('split-vertical');
    }
    if (top > 0.45 || bottom > 0.45) return pick('band-stack', 'full-bleed-hero');
    if (middle > 0.5 && structure.ink < 0.12) return pick('minimal-frame');
  }

  return null;
}

/**
 * The combined frame of several drawn objects, when together they read as one
 * scene rather than as separate elements — they cover a real part of the
 * canvas, and none of them is off on its own in a corner.
 */
function sceneBox(subjects) {
  if (subjects.length < 2) return null;

  const x0 = Math.min(...subjects.map((s) => s.box.x));
  const y0 = Math.min(...subjects.map((s) => s.box.y));
  const x1 = Math.max(...subjects.map((s) => s.box.x + s.box.width));
  const y1 = Math.max(...subjects.map((s) => s.box.y + s.box.height));
  const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };

  // A scene has to actually fill something. Two small marks at opposite
  // corners span a large box while covering almost none of it, so the drawn
  // area has to be a real fraction of what the box claims.
  const drawn = subjects.reduce((sum, s) => sum + area(s.box), 0);
  if (area(box) < 0.3 || drawn / area(box) < 0.28) return null;
  return box;
}

/**
 * Where the photograph has to be quiet: wherever the user put their words.
 *
 * This is the quietly valuable half of reading a scribble. The curator already
 * scores candidates on where a frame has usable negative space — pointing it
 * at the region the user reserved for type is what makes the finished design
 * hold the same shape as the drawing.
 */
export function negativeSpaceFromScribble(scribble) {
  if (!scribble) return null;
  const texts = scribble.regions.filter((r) => TEXT_ROLES.has(r.role));
  if (!texts.length) return null;

  // Weight each text region by how much of the sheet it claims, so a headline
  // decides this and a small caption only nudges it.
  let x = 0;
  let y = 0;
  let total = 0;
  for (const region of texts) {
    const w = Math.max(area(region.box), 0.001);
    x += centerX(region.box) * w;
    y += centerY(region.box) * w;
    total += w;
  }
  x /= total;
  y /= total;

  // Whichever axis the type is more decisively off-centre on wins; a block
  // sitting dead centre is reported as such rather than rounded to an edge.
  const dx = x - 0.5;
  const dy = y - 0.5;
  if (Math.abs(dx) < 0.12 && Math.abs(dy) < 0.12) return 'center';
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

/* --------------------------- applying to the plan ------------------------- */

/**
 * Fold the drawing into the planner's raw output.
 *
 * Returns `{ plan, forceLayout }`. `forceLayout` is set whenever the scribble
 * genuinely described a structure, because at that point the user has drawn
 * their answer and the aspect-ratio filter has already had its say (the
 * candidate came out of `layoutsForAspect`). Ignoring it would mean asking
 * someone to draw their idea and then designing something else.
 */
export function applyScribble(plan, scribble, { canvas } = {}) {
  if (!scribble) return { plan, forceLayout: null };

  const next = { ...plan };
  const layout = layoutFromScribble(scribble, { canvas });
  let forceLayout = null;

  if (layout) {
    next.layout = layout;
    forceLayout = layout;
  }

  /* -------------------------------- focus -------------------------------- */

  const subjects = scribble.regions.filter((r) => r.role === 'subject');
  const texts = scribble.regions.filter((r) => TEXT_ROLES.has(r.role));
  const subjectInk = subjects.reduce((sum, r) => sum + area(r.box), 0);
  const textInk = texts.reduce((sum, r) => sum + area(r.box), 0);
  if (subjects.length || texts.length) {
    next.focal = subjectInk >= textInk ? 'image' : 'type';
  }
  if (!subjects.length && texts.length) next.images = [];

  /* ------------------------------- imagery ------------------------------- */

  // The subject the user drew is the subject of the photograph. It is added to
  // the query rather than replacing it, because the model's version carries
  // the lighting and framing direction that makes a stock search return
  // art-directed frames instead of catalogue shots.
  const drawnSubject = scribble.subject || subjects.map((r) => r.label).filter(Boolean).join(', ');
  const quiet = negativeSpaceFromScribble(scribble);

  if (Array.isArray(next.images) && next.images.length) {
    next.images = next.images.map((image, index) => {
      if (index > 0) return image;
      const query = drawnSubject
        ? [drawnSubject, image?.query].filter(Boolean).join(', ').slice(0, 160)
        : image?.query;
      return {
        ...image,
        ...(query ? { query } : {}),
        ...(drawnSubject ? { subject: drawnSubject.slice(0, 60) } : {}),
        ...(quiet ? { negativeSpace: quiet } : {}),
      };
    });
  } else if (drawnSubject && findLayout(next.layout)?.images) {
    // The planner returned no imagery for a layout that wants some — the
    // drawing is enough to brief one on its own.
    next.images = [
      {
        role: 'hero',
        query: drawnSubject.slice(0, 160),
        subject: drawnSubject.slice(0, 60),
        ...(quiet ? { negativeSpace: quiet } : {}),
      },
    ];
  }

  /* -------------------------------- voice -------------------------------- */

  if (scribble.mood.length && !Array.isArray(plan?.mood)) next.mood = scribble.mood;

  // Words the user actually wrote on the canvas outrank invented copy. The
  // planner is asked for them too, but handwriting is exactly the kind of
  // thing a model paraphrases helpfully when it should not.
  const copy = { ...(next.copy || {}) };
  const headline = texts.find((r) => r.role === 'headline' && r.words);
  const cta = texts.find((r) => r.role === 'cta' && r.words);
  if (headline) copy.headline = headline.words.slice(0, 90);
  if (cta) copy.cta = cta.words.slice(0, 28);
  next.copy = copy;

  return { plan: next, forceLayout };
}

/**
 * The drawing written out for the creative-director prompt.
 *
 * The art director cannot see the canvas, so this is the whole of what it
 * knows about the user's composition. Positions are described in plain words
 * ("upper left", "across the bottom") rather than numbers, because that is
 * what a language model reasons about well — and because the model is not
 * being asked for geometry in the first place.
 */
export function describeScribble(scribble) {
  if (!scribble) return null;
  const lines = [];

  if (scribble.reading) lines.push(`Overall, the sketch reads as: ${scribble.reading}`);
  else if (scribble.subject) lines.push(`The sketch shows: ${scribble.subject}.`);

  for (const region of scribble.regions.slice(0, 10)) {
    const where = describePosition(region.box);
    const size = describeSize(area(region.box));
    switch (region.role) {
      case 'subject':
        lines.push(`A ${size} drawing of ${region.label || 'the subject'}, ${where}.`);
        break;
      case 'headline':
        lines.push(
          region.words
            ? `A headline ${where}, written as "${region.words}" — use these words.`
            : `Space reserved for the headline ${where}.`
        );
        break;
      case 'body':
        lines.push(region.words ? `Supporting copy ${where}: "${region.words}".` : `A block of smaller copy ${where}.`);
        break;
      case 'cta':
        lines.push(region.words ? `A button ${where} reading "${region.words}".` : `A button ${where}.`);
        break;
      case 'mark':
        lines.push(`A small logo or icon ${where}.`);
        break;
      case 'frame':
        lines.push(`A circle or frame drawn around the content ${where} — the user is pointing at what matters.`);
        break;
      default:
        lines.push(`A decorative mark ${where}.`);
        break;
    }
  }

  if (scribble.mood.length) lines.push(`The drawing feels: ${scribble.mood.join(', ')}.`);
  if (scribble.designType) lines.push(`It looks like a ${scribble.designType}.`);

  if (!lines.length) return null;

  return `The user drew their idea rather than only describing it. This sketch is the composition
brief — it is what they want the design to LOOK like, and their arrangement outranks your instincts
about where things belong:

${lines.map((l) => `- ${l}`).join('\n')}

Design the strongest possible professional version of THIS composition. Keep what they placed where
they placed it, keep the same subject and the same relative sizes, and keep any words they wrote.
Raise everything else — the palette, the typography, the photography, the finish — to the standard
of a studio poster. Do not reproduce the sketch's crudeness, and do not quietly redesign it into a
different arrangement.`;
}

/** "in the upper left", "across the bottom", "in the centre". */
function describePosition(box) {
  const x = centerX(box);
  const y = centerY(box);
  const wide = box.width > 0.66;
  const tall = box.height > 0.66;

  if (wide && tall) return 'filling the whole canvas';

  const vertical = y < 0.36 ? 'top' : y > 0.64 ? 'bottom' : 'middle';
  const horizontal = x < 0.36 ? 'left' : x > 0.64 ? 'right' : 'centre';

  if (wide) return `across the ${vertical} of the canvas`;
  if (tall) return `down the ${horizontal} side`;
  if (vertical === 'middle' && horizontal === 'centre') return 'in the centre';
  if (vertical === 'middle') return `on the ${horizontal}`;
  if (horizontal === 'centre') return `at the ${vertical}`;
  return `in the ${vertical} ${horizontal}`;
}

function describeSize(value) {
  if (value > 0.4) return 'dominant';
  if (value > 0.16) return 'large';
  if (value > 0.05) return 'medium-sized';
  return 'small';
}
