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
