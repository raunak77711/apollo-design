/** Picks readable ink for a canvas background, so new layers land visible. */
export function isLightColor(value) {
  const hex = String(value || '').trim();
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!match) return false;
  let raw = match[1];
  if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  // Rec. 709 luma is close enough for a light/dark decision.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.58;
}

export const inkFor = (background) => (isLightColor(background) ? '#111110' : '#F5F4F1');

/* --------------------------- colour + alpha ---------------------------- */

/**
 * Shadows carry their alpha in the colour itself (#RRGGBBAA) so one value
 * survives the document, CSS and the SVG export. These two split and rejoin it
 * for controls that edit hue and strength separately.
 */
export function splitAlpha(value) {
  const raw = String(value || '').trim();
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(raw);
  if (!match) return { hex: '#000000', alpha: 1 };
  return { hex: `#${match[1]}`, alpha: match[2] ? parseInt(match[2], 16) / 255 : 1 };
}

export function joinAlpha(hex, alpha) {
  const base = splitAlpha(hex).hex;
  const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${base}${value}`;
}
