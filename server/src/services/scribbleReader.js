import sharp from 'sharp';
import { getGeminiProvider } from './images/GeminiProvider.js';
import { normalizeScribble } from '../design/scribble.js';

/**
 * Reading a scribble.
 *
 * Two passes, and the cheap one is the one that always runs:
 *
 * 1. **Geometry** (Sharp, no key, never fails) — where the ink is. Coverage,
 *    its distribution across thirds, the bounding box of everything drawn, and
 *    connected clusters of marks. This alone is enough to tell a split
 *    composition from a stacked one from a lone mark in a lot of space, which
 *    is most of what a layout decision needs.
 *
 * 2. **Vision** (Gemini, optional) — what the ink *means*. Which cluster is the
 *    moon and which is the headline; what words were written; what the whole
 *    thing is for.
 *
 * The two are merged rather than chosen between: the vision pass supplies
 * labels, the geometry pass supplies (and sanity-checks) the shape. A model
 * that hallucinates a region in the corner of an empty canvas gets overruled
 * by the pixels, and a keyless install still gets a real structural read
 * instead of a shrug.
 */

/**
 * Vision is optional and sits on the critical path — the design cannot be
 * planned until the drawing has been read — so its deadline is deliberately
 * tight. Past this, the measured shapes are a good enough brief on their own,
 * and they cost nothing.
 */
const READ_TIMEOUT_MS = 15_000;

/** A failure faster than this was an upstream saying no, not a model thinking. */
const CHEAP_FAILURE_MS = 5_000;

/** Ink is measured on a small raster; the scribble's own resolution is irrelevant here. */
const RASTER = 96;

/** Below this, the canvas is empty enough that "they drew nothing" is the honest read. */
const MIN_INK = 0.0015;

/**
 * Read a scribble into the structure `design/scribble.js` interprets.
 * Returns a normalised scribble, or null if the canvas was effectively blank
 * or could not be read at all — both of which mean "design from the words".
 */
export async function readScribble(dataUrl, { prompt = '' } = {}) {
  const buffer = decodeDataUrl(dataUrl);
  if (!buffer) return null;

  const structure = await readGeometry(buffer);
  if (!structure || structure.ink < MIN_INK) return null;

  const vision = await readMeaning(dataUrl, { prompt });

  return normalizeScribble({
    ...(vision || {}),
    // Geometry is measured, so it always wins over the model's account of it.
    structure,
    coverage: structure.ink,
    regions: reconcileRegions(vision?.regions, structure),
    source: vision ? 'vision' : 'geometry',
  });
}

/* -------------------------------- geometry ------------------------------- */

/**
 * Where the ink is.
 *
 * The scribble arrives as a transparent PNG (the canvas is drawn on nothing),
 * so "ink" is alpha — which is far more reliable than luminance, since it does
 * not care what colour the user drew in or what theme they drew it under. A
 * flattened upload with no alpha falls back to "anything darker than the
 * corner pixel", which is the same question asked of an opaque sheet.
 */
async function readGeometry(buffer) {
  try {
    // Forced to RGBA so the sampling below can assume four channels whatever
    // arrived — a greyscale PNG is otherwise two, and "green" becomes alpha.
    const { data } = await sharp(buffer)
      .resize(RASTER, RASTER, { fit: 'fill' })
      .toColorspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = 4;

    // If the whole sheet is opaque the drawing was flattened onto a ground;
    // measure darkness against that ground instead of alpha.
    let opaque = true;
    for (let i = 3; i < data.length; i += channels) {
      if (data[i] < 250) {
        opaque = false;
        break;
      }
    }
    const groundLuma = opaque ? luminanceAt(data, 0) : 0;

    const mask = new Uint8Array(RASTER * RASTER);
    let inked = 0;

    for (let y = 0; y < RASTER; y += 1) {
      for (let x = 0; x < RASTER; x += 1) {
        const i = (y * RASTER + x) * channels;
        const on = opaque
          ? Math.abs(luminanceAt(data, i) - groundLuma) > 26
          : data[i + 3] > 40;
        if (on) {
          mask[y * RASTER + x] = 1;
          inked += 1;
        }
      }
    }

    const ink = inked / (RASTER * RASTER);
    if (!inked) return { bands: [0.33, 0.34, 0.33], columns: [0.33, 0.34, 0.33], ink: 0, bounds: null, clusters: 0 };

    const marks = findMarks(mask);

    /* ---- thirds: the only spatial vocabulary the layouts actually use ---- */

    const bands = [0, 0, 0];
    const columns = [0, 0, 0];
    let minX = RASTER;
    let minY = RASTER;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < RASTER; y += 1) {
      for (let x = 0; x < RASTER; x += 1) {
        if (!mask[y * RASTER + x]) continue;
        bands[Math.min(2, Math.floor((y / RASTER) * 3))] += 1;
        columns[Math.min(2, Math.floor((x / RASTER) * 3))] += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    return {
      bands: bands.map((n) => n / inked),
      columns: columns.map((n) => n / inked),
      ink,
      bounds: {
        x: minX / RASTER,
        y: minY / RASTER,
        width: (maxX - minX + 1) / RASTER,
        height: (maxY - minY + 1) / RASTER,
      },
      clusters: marks.length,
      // Kept for reconciliation and for the keyless read, not exported to
      // the brief — `normalizeStructure` drops both.
      _mask: mask,
      _marks: marks,
    };
  } catch (err) {
    console.warn(`[scribble] geometry read failed (${err.message})`);
    return null;
  }
}

const luminanceAt = (data, i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];

/**
 * Find the separate marks on the sheet.
 *
 * A connected-component pass over the ink mask, dilated by one cell first so a
 * sketchy outline drawn in several passes counts as one object rather than
 * nine. Each mark comes back with its own bounding box, which is what turns
 * "there is ink" into "there is a big round thing up here and a row of small
 * things along the bottom" — the difference between a useless keyless read and
 * a usable one.
 */
function findMarks(mask) {
  const grid = dilate(mask);
  const seen = new Uint8Array(grid.length);
  const stack = [];
  const marks = [];

  for (let start = 0; start < grid.length; start += 1) {
    if (!grid[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;

    let size = 0;
    let minX = RASTER;
    let minY = RASTER;
    let maxX = 0;
    let maxY = 0;

    while (stack.length) {
      const index = stack.pop();
      const x = index % RASTER;
      const y = (index / RASTER) | 0;
      size += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= RASTER || ny >= RASTER) continue;
          const n = ny * RASTER + nx;
          if (grid[n] && !seen[n]) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }

    // A speck is a slip of the hand, not a mark.
    if (size < 6) continue;
    marks.push({
      box: {
        x: minX / RASTER,
        y: minY / RASTER,
        width: (maxX - minX + 1) / RASTER,
        height: (maxY - minY + 1) / RASTER,
      },
      size: size / (RASTER * RASTER),
    });
  }

  return absorbContained(mergeRuns(marks));
}

/**
 * A small mark drawn inside a much larger one is part of it.
 *
 * Craters inside a moon, windows in a building, a face inside a head: people
 * draw detail *on* an object, and counting that detail as separate objects
 * inflates the sheet into a dozen competing subjects. The size ratio is what
 * keeps this safe — a word inside a drawn button is most of that button's
 * area, so a call-to-action survives as its own mark.
 */
function absorbContained(marks) {
  const byArea = marks.slice().sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  const dropped = new Set();

  for (let i = 0; i < byArea.length; i += 1) {
    const outer = byArea[i];
    const outerArea = outer.box.width * outer.box.height;
    for (let j = i + 1; j < byArea.length; j += 1) {
      const inner = byArea[j];
      if (dropped.has(inner)) continue;
      const innerArea = inner.box.width * inner.box.height;
      if (innerArea > outerArea * 0.25) continue;
      if (!contains(outer.box, inner.box)) continue;
      dropped.add(inner);
      outer.size += inner.size;
      outer.parts += inner.parts;
    }
  }

  return marks.filter((mark) => !dropped.has(mark));
}

const contains = (outer, inner) =>
  inner.x >= outer.x - 0.01 &&
  inner.y >= outer.y - 0.01 &&
  inner.x + inner.width <= outer.x + outer.width + 0.01 &&
  inner.y + inner.height <= outer.y + outer.height + 0.01;

/**
 * Join marks that sit in a row into one run.
 *
 * Handwriting is the reason this exists: someone printing "EXPLORE" draws
 * eight separate marks, and reading those as eight objects would be a
 * catastrophic misreading of a composition that contains one word. Marks whose
 * vertical extents largely coincide and which are close together horizontally
 * are the same line of lettering, so they merge.
 *
 * Drawn objects rarely qualify — a moon and a mountain differ in height and
 * sit far apart — and the merge is deliberately conservative about size, so a
 * figure standing next to a tree stays two things.
 */
function mergeRuns(marks) {
  const sorted = marks.slice().sort((a, b) => a.box.x - b.box.x);
  const out = [];

  for (const mark of sorted) {
    const run = out.find((candidate) => sameRun(candidate, mark));
    if (!run) {
      out.push({ ...mark, parts: 1 });
      continue;
    }
    const x = Math.min(run.box.x, mark.box.x);
    const y = Math.min(run.box.y, mark.box.y);
    run.box = {
      x,
      y,
      width: Math.max(run.box.x + run.box.width, mark.box.x + mark.box.width) - x,
      height: Math.max(run.box.y + run.box.height, mark.box.y + mark.box.height) - y,
    };
    run.size += mark.size;
    run.parts += 1;
  }

  return out;
}

function sameRun(a, b) {
  const heightA = a.box.height;
  const heightB = b.box.height;
  // Letters of one word are close to the same height.
  const ratio = Math.max(heightA, heightB) / Math.max(0.001, Math.min(heightA, heightB));
  if (ratio > 1.9) return false;
  // Lettering is small; two large shapes side by side are two shapes.
  if (Math.max(heightA, heightB) > 0.3) return false;

  // They must share most of a baseline.
  const overlap =
    Math.min(a.box.y + heightA, b.box.y + heightB) - Math.max(a.box.y, b.box.y);
  if (overlap < Math.min(heightA, heightB) * 0.55) return false;

  // And be no further apart than a wide letter-space.
  const gap = Math.max(a.box.x, b.box.x) - Math.min(a.box.x + a.box.width, b.box.x + b.box.width);
  return gap < Math.max(heightA, heightB) * 0.9;
}

function dilate(mask) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < RASTER; y += 1) {
    for (let x = 0; x < RASTER; x += 1) {
      if (!mask[y * RASTER + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= RASTER || ny >= RASTER) continue;
          out[ny * RASTER + nx] = 1;
        }
      }
    }
  }
  return out;
}

/* --------------------------------- vision -------------------------------- */

/**
 * What the marks mean, or null with no key / on any failure.
 *
 * Retried once on a busy upstream, which is the one failure genuinely worth
 * waiting for: reading the drawing is the whole feature, and "high demand,
 * try again" is a temporary condition the geometry fallback would otherwise
 * turn into a permanently worse design.
 */
async function readMeaning(dataUrl, { prompt }) {
  const gemini = getGeminiProvider();
  if (!gemini.configured) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const startedAt = Date.now();
    try {
      return await gemini.readScribble(dataUrl, { prompt, timeoutMs: READ_TIMEOUT_MS });
    } catch (err) {
      // Retry only a failure that was *cheap*. "High demand, try again" comes
      // back in milliseconds and is worth another go; a model that took the
      // whole deadline to not answer will take it again, and the user would
      // pay twice over for a design the shapes can already brief.
      const cheap = Date.now() - startedAt < CHEAP_FAILURE_MS;
      if (cheap && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 900));
        continue;
      }
      console.warn(`[scribble] vision read failed (${err.message}) — reading the shapes instead`);
      return null;
    }
  }
  return null;
}

/* ----------------------------- reconciliation ---------------------------- */

/**
 * Keep the model's labels, but only where there is ink to label.
 *
 * A vision model asked to locate things in a rough drawing will occasionally
 * report a region that is not there, and a phantom "headline across the
 * bottom" would drag the whole composition to a structure the user never drew.
 * So every proposed region is checked against the measured mask: if the box it
 * claims is essentially empty, it is dropped.
 *
 * With no vision pass at all, the geometry is turned into a single subject
 * region covering what was drawn — enough for `layoutFromScribble` to work
 * with, and honest about knowing nothing more.
 */
function reconcileRegions(regions, structure) {
  const mask = structure?._mask;

  if (!Array.isArray(regions) || !regions.length) return regionsFromMarks(structure);
  if (!mask) return regions;

  const kept = regions.filter((region) => inkWithin(mask, region?.box) > 0.012);
  // Everything was rejected — trust the pixels over the account of them.
  if (!kept.length) return regionsFromMarks(structure);
  return kept;
}

/**
 * The keyless read: roles inferred from shape alone.
 *
 * With no vision model there is no way to know that the big circle is a moon.
 * But the *shape* of a mark still says a great deal about its job, and getting
 * this right is the difference between a keyless install producing a real
 * composition and producing one undifferentiated blob:
 *
 *   - a long, low run of small marks is lettering, and lettering low on the
 *     page is a headline where it is large and a caption where it is not;
 *   - a big mark is the subject;
 *   - a scattering of tiny marks is decoration (stars, sparkles, ticks);
 *   - a mark that contains most of the others is a frame drawn around them.
 *
 * These are claims about handwriting and sketching habits rather than about
 * semantics, which is exactly why they survive not knowing what anything is.
 */
function regionsFromMarks(structure) {
  const marks = structure?._marks;
  if (!marks?.length) {
    return structure?.bounds ? [{ role: 'subject', label: '', box: structure.bounds, weight: 1 }] : [];
  }

  const largest = marks.reduce((max, m) => Math.max(max, m.box.width * m.box.height), 0);
  const regions = marks.map((mark) => {
    const { width, height } = mark.box;
    const area = width * height;
    const aspect = width / Math.max(0.001, height);
    const centreY = mark.box.y + height / 2;

    let role = 'subject';

    // Lettering is wide, short, and made of repeated strokes. Whether those
    // strokes came back as one component or eight depends only on how close
    // together the letters were drawn, so the test deliberately does not
    // depend on that — a scrawled word and a printed one read the same.
    const lettering = aspect > 2.4 && height < 0.16 && (mark.parts > 2 || aspect > 3.6);

    if (area < 0.0045 && Math.max(width, height) < 0.09) {
      // Stars, ticks, sparkles: too small to be either a subject or a word.
      role = 'decoration';
    } else if (lettering) {
      if (height < 0.03) role = 'decoration'; // a drawn rule or an underline
      else role = height > 0.055 ? 'headline' : 'body';
    } else if (area > 0.4 && width > 0.75 && height > 0.55) {
      role = 'frame';
    }

    return {
      role,
      label: '',
      words: '',
      box: mark.box,
      weight: Math.min(1, area / Math.max(0.0001, largest)),
    };
  });

  // Only one line of lettering can be the headline; the rest are supporting
  // copy, tallest wins, because that is how someone signals importance when
  // they are writing by hand.
  const headlines = regions.filter((r) => r.role === 'headline');
  if (headlines.length > 1) {
    headlines
      .slice()
      .sort((a, b) => b.box.height - a.box.height)
      .slice(1)
      .forEach((region) => {
        region.role = 'body';
      });
  }

  return regions;
}

/** The fraction of a normalised box that carries ink. */
function inkWithin(mask, box) {
  if (!box) return 0;
  const x0 = Math.max(0, Math.floor(Number(box.x) * RASTER));
  const y0 = Math.max(0, Math.floor(Number(box.y) * RASTER));
  const x1 = Math.min(RASTER, Math.ceil((Number(box.x) + Number(box.width)) * RASTER));
  const y1 = Math.min(RASTER, Math.ceil((Number(box.y) + Number(box.height)) * RASTER));
  if (x1 <= x0 || y1 <= y0) return 0;

  let on = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) if (mask[y * RASTER + x]) on += 1;
  }
  return on / ((x1 - x0) * (y1 - y0));
}

/* --------------------------------- utils --------------------------------- */

function decodeDataUrl(value) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/s.exec(String(value || ''));
  if (!match) return null;
  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
}
