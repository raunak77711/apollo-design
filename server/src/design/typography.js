/**
 * Typographic engine.
 *
 * The server has no font rasteriser, but it still has to know how wide a line
 * of Bebas Neue will be before it commits to a headline size — otherwise text
 * overflows its frame, which is the single loudest "a machine made this" tell.
 *
 * So: per-face advance-width metrics, real word wrapping, and a fitter that
 * chooses the largest size at which the copy still sits inside its box. Sizes
 * come from a modular scale keyed to the canvas, so hierarchy is proportional
 * on a business card and on a poster alike.
 */

/** Average lowercase advance, in ems, measured per face. */
const ADVANCE = {
  Inter: 0.545,
  'Instrument Sans': 0.525,
  'Instrument Serif': 0.462,
  'Playfair Display': 0.508,
  'Bebas Neue': 0.399,
  'JetBrains Mono': 0.6,
  Georgia: 0.508,
  Arial: 0.52,
};

const MONOSPACE = new Set(['JetBrains Mono']);

const NARROW = new Set([...'ilj tfrI\'"!.,:;|()[]{}/\\`-']);
const WIDE = new Set([...'mwMW@%&']);
const CAPS = /[A-Z]/;

/** Relative advance of one character against the face's average. */
function charFactor(ch) {
  if (ch === ' ') return 0.42;
  if (NARROW.has(ch)) return 0.44;
  if (WIDE.has(ch)) return 1.48;
  if (CAPS.test(ch)) return 1.14;
  if (/[0-9]/.test(ch)) return 1.02;
  return 1;
}

export function applyCase(text, textCase) {
  const value = String(text ?? '');
  if (textCase === 'uppercase') return value.toUpperCase();
  if (textCase === 'lowercase') return value.toLowerCase();
  if (textCase === 'capitalize') return value.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return value;
}

/**
 * Estimated rendered width of a single line, in pixels. Deliberately biased
 * ~2% wide: under-estimating causes overflow, over-estimating only costs a
 * fraction of a point of size.
 */
export function measureLine(text, { font = 'Inter', size = 32, letterSpacing = 0, textCase = 'none', weight = 400 } = {}) {
  const value = applyCase(text, textCase);
  const base = ADVANCE[font] ?? 0.54;
  // Heavier weights carry slightly more width; light faces slightly less.
  const weightFactor = 1 + (Math.min(900, Math.max(100, weight)) - 400) * 0.00016;

  let ems = 0;
  if (MONOSPACE.has(font)) {
    ems = value.length * base;
  } else {
    for (const ch of value) ems += base * charFactor(ch);
  }
  return ems * size * weightFactor * 1.02 + letterSpacing * Math.max(0, value.length - 1);
}

/** Greedy word wrap that honours explicit newlines in the copy. */
export function wrapText(text, { maxWidth, ...metrics }) {
  const out = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${line} ${words[i]}`;
      if (measureLine(candidate, metrics) <= maxWidth) line = candidate;
      else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Largest size at which `text` fits `maxWidth × maxHeight` within `maxLines`.
 *
 * Returns the chosen size, the wrapped lines and the block's measured box, so
 * the composer can lay out around real text rather than a guessed rectangle.
 */
export function fitText(
  text,
  {
    font = 'Inter',
    weight = 400,
    maxWidth,
    maxHeight = Infinity,
    maxSize = 120,
    minSize = 11,
    lineHeight = 1.15,
    letterSpacing = 0,
    textCase = 'none',
    maxLines = 5,
  } = {}
) {
  let size = Math.max(minSize, Math.round(maxSize));

  while (size > minSize) {
    const tracking = letterSpacing * size;
    const lines = wrapText(text, { maxWidth, font, size, letterSpacing: tracking, textCase, weight });
    const height = lines.length * size * lineHeight;
    const widest = Math.max(...lines.map((l) => measureLine(l, { font, size, letterSpacing: tracking, textCase, weight })), 0);
    if (lines.length <= maxLines && height <= maxHeight && widest <= maxWidth) {
      return { size, lines, height: Math.ceil(height), width: Math.ceil(widest), letterSpacing: Number(tracking.toFixed(2)) };
    }
    // Bigger type overshoots faster, so step proportionally rather than by 1px.
    size -= Math.max(1, Math.round(size * 0.045));
  }

  const tracking = letterSpacing * size;
  const lines = wrapText(text, { maxWidth, font, size, letterSpacing: tracking, textCase, weight }).slice(0, maxLines);
  return {
    size,
    lines,
    height: Math.ceil(lines.length * size * lineHeight),
    width: Math.ceil(Math.max(...lines.map((l) => measureLine(l, { font, size, letterSpacing: tracking, textCase, weight })), 0)),
    letterSpacing: Number(tracking.toFixed(2)),
  };
}

/**
 * Display type wants tighter leading as it grows; small copy wants more air.
 * One rule, applied everywhere, is a large part of why a layout reads as
 * typeset rather than assembled.
 */
export function leadingFor(size, { display = false } = {}) {
  if (display) {
    if (size >= 120) return 0.9;
    if (size >= 72) return 0.95;
    if (size >= 48) return 1.02;
    return 1.1;
  }
  if (size <= 14) return 1.55;
  if (size <= 20) return 1.48;
  if (size <= 28) return 1.38;
  return 1.28;
}

/**
 * Optical tracking: large display type needs negative tracking to stop looking
 * loose, and small uppercase labels need a lot of positive tracking to read as
 * deliberate. Expressed in ems so `fitText` can scale it with the size.
 */
export function trackingFor(role, pairing, size) {
  if (role === 'eyebrow' || role === 'meta') return pairing.id === 'poster' ? 0.36 : 0.3;
  if (role === 'headline') {
    const base = pairing.displayTracking ?? 0;
    if (size >= 110) return base - 0.012;
    if (size >= 64) return base - 0.006;
    return base;
  }
  if (role === 'cta') return 0.06;
  return 0;
}

/**
 * The type scale for a canvas. Everything downstream sizes itself from these
 * ceilings, so a story and a business card share one set of proportions.
 *
 * `energy` lets a bold direction push display type up and a minimal one pull it
 * back without breaking the relationships between steps.
 */
export function typeScale({ width, height }, { energy = 1, layout = '' } = {}) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  // Wide canvases get their scale from the short edge (height is the constraint);
  // square and tall ones can afford to key off a blend of both.
  const reference = width / height >= 1.5 ? short * 1.16 : short * 0.62 + long * 0.28;

  const display = layout === 'type-poster' ? 0.24 : layout === 'minimal-frame' ? 0.115 : 0.155;

  return {
    headline: Math.round(reference * display * energy),
    subhead: Math.round(reference * 0.036 * Math.min(energy, 1.06)),
    body: Math.round(reference * 0.03),
    eyebrow: Math.round(reference * 0.0205),
    cta: Math.round(reference * 0.0265),
    meta: Math.round(reference * 0.0185),
    detail: Math.round(reference * 0.0235),
  };
}

/**
 * A headline is only powerful if it is short. Long copy is trimmed to a
 * sensible line count rather than shrunk into illegibility.
 */
export function headlineLines(text, layout) {
  const words = String(text).split(/\s+/).filter(Boolean).length;
  if (layout === 'type-poster') return words <= 3 ? 2 : 3;
  if (layout === 'minimal-frame') return 2;
  if (layout === 'banner-lockup') return 2;
  return words <= 4 ? 2 : 3;
}
