/**
 * Colour maths for the design pipeline.
 *
 * Every palette decision Apollo makes is checked here rather than eyeballed by
 * the model: contrast is measured (WCAG relative luminance), scrims are derived
 * from the colour they sit on, and text colour is chosen against the surface it
 * actually lands on. Pure and dependency-free.
 */

const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i;

/** Parse #rgb, #rrggbb or #rrggbbaa. Returns null for anything else. */
export function parseHex(value) {
  if (typeof value !== 'string') return null;
  const short = HEX3.exec(value.trim());
  if (short) {
    const [, r, g, b] = short;
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: 1 };
  }
  const long = HEX6.exec(value.trim());
  if (!long) return null;
  const hex = long[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: long[2] ? parseInt(long[2], 16) / 255 : 1,
  };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const byte = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');

export function toHex({ r, g, b }) {
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/** Append an alpha channel, which the canvas and the exporter both understand. */
export function withAlpha(value, alpha) {
  const rgb = parseHex(value);
  if (!rgb) return value;
  return `${toHex(rgb)}${byte(clamp(alpha, 0, 1) * 255)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

export function hslToRgb({ h, s, l }) {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return { r: channel(hn + 1 / 3) * 255, g: channel(hn) * 255, b: channel(hn - 1 / 3) * 255 };
}

const channelLuminance = (c) => {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(value) {
  const rgb = parseHex(value);
  if (!rgb) return 0;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black/white). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const isDark = (value) => luminance(value) < 0.4;

/** Blend two colours in linear-ish sRGB space. `t` = how much of `b`. */
export function mix(a, b, t) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const k = clamp(t, 0, 1);
  return toHex({ r: ca.r + (cb.r - ca.r) * k, g: ca.g + (cb.g - ca.g) * k, b: ca.b + (cb.b - ca.b) * k });
}

export const lighten = (value, amount) => mix(value, '#FFFFFF', amount);
export const darken = (value, amount) => mix(value, '#000000', amount);

/** Shift hue/saturation/lightness while keeping the colour recognisable. */
export function adjust(value, { hue = 0, sat = 0, light = 0 } = {}) {
  const rgb = parseHex(value);
  if (!rgb) return value;
  const hsl = rgbToHsl(rgb);
  return toHex(
    hslToRgb({
      h: hsl.h + hue,
      s: clamp(hsl.s + sat, 0, 1),
      l: clamp(hsl.l + light, 0, 1),
    })
  );
}

/**
 * The best text colour for a given surface, chosen from candidates by measured
 * contrast rather than a lightness guess. Falls back to pure black/white when
 * nothing in the palette clears the threshold.
 */
export function readableOn(surface, candidates = [], minimum = 4.5) {
  const pool = [...candidates, '#FFFFFF', '#0A0A0A'];
  let best = pool[0];
  let bestScore = 0;
  for (const candidate of pool) {
    const score = contrastRatio(surface, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
    if (score >= minimum && candidates.includes(candidate)) return candidate;
  }
  return best;
}

/**
 * Nudge a colour until it clears a contrast threshold against a surface,
 * keeping its hue. Used by the critic to repair weak text rather than flipping
 * it to plain white and losing the art direction.
 */
export function ensureContrast(value, surface, minimum = 4.5) {
  if (contrastRatio(value, surface) >= minimum) return value;
  const towardsLight = luminance(surface) < 0.45;
  let out = value;
  for (let step = 1; step <= 12; step += 1) {
    out = towardsLight ? lighten(value, step * 0.08) : darken(value, step * 0.08);
    if (contrastRatio(out, surface) >= minimum) return out;
  }
  return towardsLight ? '#FFFFFF' : '#0A0A0A';
}

/** Perceived colour distance — cheap, good enough for "are these too alike". */
export function distance(a, b) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 0;
  const rMean = (ca.r + cb.r) / 2;
  const dr = ca.r - cb.r;
  const dg = ca.g - cb.g;
  const db = ca.b - cb.b;
  return Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
}

export const rotate = (value, degrees) => adjust(value, { hue: degrees });

/** Complement, triad and analogous partners for an accent. */
export function harmonies(accent) {
  return {
    complement: rotate(accent, 180),
    analogousWarm: rotate(accent, 30),
    analogousCool: rotate(accent, -30),
    triadA: rotate(accent, 120),
    triadB: rotate(accent, 240),
    split: rotate(accent, 150),
  };
}

/**
 * A scrim that guarantees legibility over a photograph. Returns the colour and
 * the opacity needed for text of `textColor` to clear `minimum` even over the
 * brightest plausible pixel — so overlays are as light as they can be rather
 * than a blanket 70% black.
 */
export function scrimFor(textColor, { base = '#0A0A0A', minimum = 4.5, worstCase = '#E8E8E8' } = {}) {
  for (let opacity = 0.2; opacity <= 0.96; opacity += 0.04) {
    const composited = mix(worstCase, base, opacity);
    if (contrastRatio(textColor, composited) >= minimum) {
      return { color: base, opacity: Number(opacity.toFixed(2)) };
    }
  }
  return { color: base, opacity: 0.92 };
}

/**
 * Approximate the colour you actually see where a translucent layer sits on a
 * backdrop — the critic uses this to judge text against real composited pixels
 * instead of the layer's nominal fill.
 */
export function composite(top, topOpacity, backdrop) {
  return mix(backdrop, top, clamp(topOpacity, 0, 1));
}

/** Hue count of a palette, used to flag "too many colours" in critique. */
export function hueCount(colors) {
  const hues = new Set();
  for (const value of colors) {
    const rgb = parseHex(value);
    if (!rgb) continue;
    const { h, s } = rgbToHsl(rgb);
    if (s < 0.12) continue; // neutrals do not count as a hue
    hues.add(Math.round(h / 30));
  }
  return hues.size;
}
