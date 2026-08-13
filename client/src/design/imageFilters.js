/**
 * Single source of truth for turning an image element's adjustment properties
 * into a CSS `filter` string. Used by the canvas renderer AND the photo editor
 * so the live preview and the final render always match. The server export
 * pipeline (Sharp) mirrors these same numbers.
 */
export function cssImageFilter(p = {}) {
  const parts = [
    `brightness(${p.brightness ?? 100}%)`,
    `contrast(${p.contrast ?? 100}%)`,
    `saturate(${p.saturation ?? 100}%)`,
  ];
  if (p.hue) parts.push(`hue-rotate(${p.hue}deg)`);
  if (p.grayscale) parts.push(`grayscale(${p.grayscale}%)`);
  if (p.blur) parts.push(`blur(${p.blur}px)`);
  return parts.join(' ');
}

// Adjustment presets used by the editor's quick buttons.
export const ADJUST_PRESETS = {
  auto: { brightness: 105, contrast: 108, saturation: 108, hue: 0, grayscale: 0, blur: 0 },
  bw: { brightness: 100, contrast: 110, saturation: 100, hue: 0, grayscale: 100, blur: 0 },
  pop: { brightness: 102, contrast: 118, saturation: 150, hue: 0, grayscale: 0, blur: 0 },
};
