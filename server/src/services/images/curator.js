import sharp from 'sharp';
import { searchImages } from './index.js';
import { contrastRatio, distance, isDark, luminance, parseHex, rgbToHsl, toHex } from '../../design/color.js';

/**
 * The photo curator.
 *
 * Picking `results[0]` is the single biggest reason generated designs look
 * cheap: the top result for "gym" is a stock photo of a dumbbell on white, and
 * it lands in whatever box the layout left for it.
 *
 * Instead, this module gathers candidates from every library, then *looks at
 * them*: each shortlisted photograph is fetched at thumbnail size and analysed
 * with Sharp for tone, detail distribution and flat areas. That yields three
 * things the composer genuinely needs — where the subject is (focal point),
 * where the picture is quiet enough to carry type (negative space), and how
 * dark it is (how strong a scrim has to be).
 *
 * A photograph is chosen because it fits the composition, and the composition
 * then adapts to the photograph.
 */

const ANALYSIS_TIMEOUT_MS = 4000;
const SHORTLIST = 8;
const GRID = 3; // analysed as a 3×3 field: thirds, which is how the layouts think

const analysisCache = new Map();

/* ------------------------------- analysis ------------------------------- */

async function fetchBuffer(url, timeout = ANALYSIS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reduce a photograph to the handful of numbers a layout decision needs.
 *
 * Detail (local variance) is the useful signal: busy cells hold the subject,
 * flat cells are where type can live. Both are measured on a 48px thumbnail,
 * so the whole shortlist costs a few hundred kilobytes.
 */
async function analyze(candidate) {
  const url = candidate.tiny || candidate.thumbnail;
  if (!url) return null;
  if (analysisCache.has(url)) return analysisCache.get(url);

  const buffer = await fetchBuffer(url);
  if (!buffer) return null;

  const result = await analyzeBuffer(buffer);
  analysisCache.set(url, result);
  // Keep the cache from growing without bound across a long-lived server.
  if (analysisCache.size > 400) analysisCache.delete(analysisCache.keys().next().value);
  return result;
}

/**
 * The same tone/detail/negative-space analysis as `analyze`, but for a buffer
 * already in hand — a picture that arrived as bytes rather than as a URL, so
 * there is nothing to cache it against.
 */
export async function analyzeBuffer(buffer) {
  let result = null;
  try {
    const size = 48;
    const { data } = await sharp(buffer)
      .resize(size, size, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const cells = [];
    const step = size / GRID;
    let total = { r: 0, g: 0, b: 0 };

    for (let gy = 0; gy < GRID; gy += 1) {
      for (let gx = 0; gx < GRID; gx += 1) {
        let sum = 0;
        let sumSquares = 0;
        let count = 0;
        const rgb = { r: 0, g: 0, b: 0 };
        for (let y = Math.floor(gy * step); y < Math.floor((gy + 1) * step); y += 1) {
          for (let x = Math.floor(gx * step); x < Math.floor((gx + 1) * step); x += 1) {
            const i = (y * size + x) * 3;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            sum += l;
            sumSquares += l * l;
            rgb.r += r;
            rgb.g += g;
            rgb.b += b;
            count += 1;
          }
        }
        const mean = sum / count;
        cells.push({
          gx,
          gy,
          luminance: mean / 255,
          // Standard deviation of luminance: how busy this third is.
          detail: Math.sqrt(Math.max(0, sumSquares / count - mean * mean)) / 128,
          color: toHex({ r: rgb.r / count, g: rgb.g / count, b: rgb.b / count }),
        });
        total.r += rgb.r / count;
        total.g += rgb.g / count;
        total.b += rgb.b / count;
      }
    }

    const averageColor = toHex({ r: total.r / cells.length, g: total.g / cells.length, b: total.b / cells.length });
    result = {
      cells,
      averageColor,
      luminance: cells.reduce((sum, c) => sum + c.luminance, 0) / cells.length,
      contrastRange: Math.max(...cells.map((c) => c.luminance)) - Math.min(...cells.map((c) => c.luminance)),
      detail: cells.reduce((sum, c) => sum + c.detail, 0) / cells.length,
      ...regionSummary(cells),
    };
  } catch {
    result = null;
  }

  return result;
}

/** Per-side quietness plus the subject's centre of mass. */
function regionSummary(cells) {
  const pick = (predicate) => cells.filter(predicate);
  const quiet = (group) => 1 - group.reduce((sum, c) => sum + c.detail, 0) / Math.max(1, group.length);

  const space = {
    left: quiet(pick((c) => c.gx === 0)),
    right: quiet(pick((c) => c.gx === GRID - 1)),
    top: quiet(pick((c) => c.gy === 0)),
    bottom: quiet(pick((c) => c.gy === GRID - 1)),
    center: quiet(pick((c) => c.gx === 1 && c.gy === 1)),
  };

  // Detail-weighted centroid — where a viewer's eye goes, in percent.
  let weight = 0;
  let fx = 0;
  let fy = 0;
  for (const cell of cells) {
    const w = cell.detail ** 2 + 0.001;
    weight += w;
    fx += w * ((cell.gx + 0.5) / GRID);
    fy += w * ((cell.gy + 0.5) / GRID);
  }

  const quietest = Object.entries(space)
    .filter(([key]) => key !== 'center')
    .sort((a, b) => b[1] - a[1])[0][0];

  return {
    space,
    negativeSpace: quietest,
    focalX: Math.round(Math.min(85, Math.max(15, (fx / weight) * 100))),
    focalY: Math.round(Math.min(85, Math.max(15, (fy / weight) * 100))),
  };
}

/* -------------------------------- scoring ------------------------------- */

const STOP_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'for', 'with', 'in', 'on', 'at', 'to', 'photo', 'image', 'picture']);

function relevance(candidate, query) {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  if (!words.length) return 0.5;
  const haystack = `${candidate.description || ''}`.toLowerCase();
  const hits = words.filter((w) => haystack.includes(w)).length;
  // Search rank is itself a relevance signal; blend it with description matches
  // so a well-ranked photo with no alt text is not unfairly punished.
  const rankScore = 1 - Math.min(1, (candidate.rank ?? 8) / 14);
  return 0.55 * (hits / words.length) + 0.45 * rankScore;
}

/** How well the photograph's own shape suits the box it has to fill. */
function orientationFit(candidate, slotRatio) {
  if (!candidate.width || !candidate.height) return 0.5;
  const ratio = candidate.width / candidate.height;
  // Cropping to a very different aspect throws away most of the frame.
  const penalty = Math.abs(Math.log(ratio / slotRatio));
  return Math.max(0, 1 - penalty * 0.8);
}

function resolutionFit(candidate, slot) {
  if (!candidate.width || !candidate.height) return 0.5;
  const needed = Math.max(slot.width, slot.height);
  const have = Math.max(candidate.width, candidate.height);
  if (have >= needed * 1.5) return 1;
  if (have >= needed) return 0.85;
  if (have >= needed * 0.7) return 0.5;
  return 0.15;
}

/**
 * Does the photograph leave room where the type has to go, and is that room
 * calm enough to carry it?
 */
function negativeSpaceFit(analysis, wanted) {
  if (!analysis) return 0.5;
  if (!wanted || wanted === 'any') return 0.4 + analysis.space[analysis.negativeSpace] * 0.6;
  const value = analysis.space[wanted];
  if (value == null) return 0.5;
  return Math.min(1, value * 1.15);
}

/**
 * Tonal compatibility with the palette. A dark composition needs photographs
 * that can carry light type; a light one needs the opposite. Photos that fight
 * the palette are the reason "AI designs" so often look muddy.
 */
function toneFit(candidate, analysis, palette) {
  const average = analysis?.averageColor || candidate.averageColor;
  if (!average || !parseHex(average)) return 0.5;
  const wantDark = palette.dark;
  const l = analysis?.luminance ?? luminance(average);
  const tonal = wantDark ? 1 - Math.min(1, Math.abs(l - 0.32) * 2.4) : 1 - Math.min(1, Math.abs(l - 0.62) * 2.4);

  // Hue agreement with the accent: near-complementary or near-analogous both
  // work; a muddy in-between does not.
  const a = parseHex(average);
  const b = parseHex(palette.accent);
  let harmony = 0.5;
  if (a && b) {
    const ha = rgbToHsl(a);
    const hb = rgbToHsl(b);
    if (ha.s < 0.16) harmony = 0.8; // a neutral photograph always sits well
    else {
      const delta = Math.abs(((ha.h - hb.h + 540) % 360) - 180);
      harmony = delta > 130 || delta < 40 ? 0.85 : 0.45;
    }
  }
  return tonal * 0.62 + harmony * 0.38;
}

/** Flat, evenly-lit frames read as stock; range and detail read as photography. */
function qualityFit(candidate, analysis) {
  const likes = Math.min(1, (candidate.likes || 0) / 400);
  if (!analysis) return 0.4 + likes * 0.2;
  const range = Math.min(1, analysis.contrastRange * 2.2);
  const detail = Math.min(1, analysis.detail * 2.6);
  return range * 0.45 + detail * 0.35 + likes * 0.2;
}

/* -------------------------------- curation ------------------------------ */

const WEIGHTS = {
  relevance: 1.35,
  orientation: 0.95,
  resolution: 0.8,
  negativeSpace: 1.15,
  tone: 1.05,
  quality: 0.7,
};

/**
 * Choose the best photograph for one slot.
 *
 * `plan` carries the art direction (what to search for, where the type will
 * sit); `slot` is the box it has to fill; `palette` is what it has to live
 * alongside. Returns the picture plus the composition data the layout engine
 * needs — or null if nothing could be sourced.
 */
export async function curateImage(plan, { slot, palette, exclude = new Set(), analysisBudget = SHORTLIST }) {
  const slotRatio = slot.width / Math.max(1, slot.height);
  const orientation = slotRatio > 1.25 ? 'landscape' : slotRatio < 0.8 ? 'portrait' : 'square';

  const queries = [plan.query, plan.subject, plan.keywords].filter(Boolean);
  let pool = [];
  for (const query of queries) {
    if (pool.length >= 14) break;
    try {
      const results = await searchImages(query, { perPage: 12, orientation });
      pool.push(...results.map((r) => ({ ...r, matchedQuery: query })));
    } catch (err) {
      console.warn(`[curator] search failed for "${query}": ${err.message}`);
    }
  }

  // A photograph already used elsewhere in the same design is never the right
  // answer, however well it scores.
  pool = dedupe(pool).filter((c) => c.url && !exclude.has(c.url));
  if (!pool.length) return null;

  // Cheap pass first, so only a shortlist is downloaded and analysed.
  const preScored = pool
    .map((candidate) => ({
      candidate,
      pre:
        relevance(candidate, plan.query) * WEIGHTS.relevance +
        orientationFit(candidate, slotRatio) * WEIGHTS.orientation +
        resolutionFit(candidate, slot) * WEIGHTS.resolution +
        toneFit(candidate, null, palette) * WEIGHTS.tone * 0.5,
    }))
    .sort((a, b) => b.pre - a.pre);

  const shortlist = preScored.slice(0, analysisBudget);
  const analyses = await Promise.all(shortlist.map(({ candidate }) => analyze(candidate).catch(() => null)));

  let best = null;
  shortlist.forEach(({ candidate }, i) => {
    const analysis = analyses[i];
    const score =
      relevance(candidate, plan.query) * WEIGHTS.relevance +
      orientationFit(candidate, slotRatio) * WEIGHTS.orientation +
      resolutionFit(candidate, slot) * WEIGHTS.resolution +
      negativeSpaceFit(analysis, plan.negativeSpace) * WEIGHTS.negativeSpace +
      toneFit(candidate, analysis, palette) * WEIGHTS.tone +
      qualityFit(candidate, analysis) * WEIGHTS.quality;
    if (!best || score > best.score) best = { candidate, analysis, score };
  });

  if (!best) return null;
  const { candidate, analysis } = best;

  return {
    ...plan,
    url: candidate.url,
    thumbnail: candidate.thumbnail,
    alt: candidate.description || plan.query,
    provider: candidate.provider,
    photographer: candidate.photographer,
    sourceUrl: candidate.sourceUrl,
    width: candidate.width,
    height: candidate.height,
    score: Number(best.score.toFixed(2)),
    // Composition data — this is what makes the layout respond to the picture.
    focalX: analysis?.focalX ?? 50,
    focalY: analysis?.focalY ?? 50,
    averageColor: analysis?.averageColor || candidate.averageColor || '#6E6E6E',
    luminance: analysis?.luminance ?? (candidate.averageColor ? luminance(candidate.averageColor) : 0.45),
    negativeSpace: analysis?.negativeSpace || plan.negativeSpace,
    space: analysis?.space || null,
  };
}

/**
 * Curate every slot in a brief, keeping the set visually distinct.
 *
 * A slot that nothing could be sourced for still gets an entry — the plan with
 * an empty `url` — so the composer's slots stay aligned with the brief's.
 */
export async function curateImages(plans, { slots, palette, onProgress = null }) {
  const used = new Set();
  const out = [];

  for (let i = 0; i < plans.length; i += 1) {
    onProgress?.(i, plans.length);
    const slot = slots[i] || slots[slots.length - 1] || { width: 1080, height: 1080 };

    // Only the hero is worth a full analysis pass; supporting frames get a
    // smaller shortlist so a grid layout does not cost a dozen downloads.
    const image = await curateImage(plans[i], {
      slot,
      palette,
      exclude: used,
      analysisBudget: i === 0 ? SHORTLIST : 4,
    });
    if (image) {
      used.add(image.url);
      out.push(image);
    } else {
      out.push({ ...plans[i], url: '' });
    }
  }
  return out;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

/**
 * How dark a scrim has to be for type to read over this photograph, given the
 * text colour that the art direction wants to use.
 */
export function scrimStrengthFor(image, textColor) {
  if (!image?.averageColor) return 0.72;
  const ratio = contrastRatio(textColor, image.averageColor);
  if (ratio >= 7) return 0.42;
  if (ratio >= 4.5) return 0.58;
  if (ratio >= 3) return 0.72;
  return 0.86;
}

/** True when a photograph is bright enough that light type will struggle. */
export const isBrightImage = (image) => (image?.luminance ?? 0.5) > 0.58;

export { analyze as analyzeImage, distance as colorDistance, isDark };
