/**
 * Single source of truth for turning an image element's adjustment properties
 * into live visuals. Used by the canvas renderer AND the photo editor so the
 * preview and the final render always match.
 *
 * Honesty note: brightness / contrast / saturation / hue / grayscale / blur map
 * exactly onto CSS filter functions (and onto Sharp on the server — see
 * exportService.js). vibrance / temperature / tint / exposure / black / white /
 * highlights / shadowsTone / clarity / dehaze / sharpen / smooth are folded into
 * those same filter functions as reasonable APPROXIMATIONS — CSS's `filter`
 * property has no native "shift white balance" or "raise shadows" primitive.
 * grain / vignette / bloom / glamour render as separate overlay layers (see
 * ImageEffectOverlays.jsx) because they cannot be expressed as a filter() term
 * at all — a filter darkens/shifts existing pixels, it cannot paint a gradient
 * or a noise texture on top.
 */
export function cssImageFilter(p = {}) {
  // Fold the "no CSS primitive" controls into the ones that exist.
  const brightness = (p.brightness ?? 100)
    + (p.exposure ?? 0) * 0.8
    + (p.white ?? 0) * 0.15
    - (p.black ?? 0) * 0.15
    + (p.highlights ?? 0) * 0.1;
  const contrast = (p.contrast ?? 100)
    + (p.white ?? 0) * 0.25
    + (p.black ?? 0) * 0.25
    + (p.clarity ?? 0) * 0.3
    + (p.sharpen ?? 0) * 0.15
    - (p.shadowsTone ?? 0) * 0.1;
  const saturation = (p.saturation ?? 100)
    + (p.vibrance ?? 0) * 0.6
    + (p.dehaze ?? 0) * 0.2
    + Math.abs(p.temperature ?? 0) * 0.1;

  const parts = [
    `brightness(${clampPct(brightness)}%)`,
    `contrast(${clampPct(contrast)}%)`,
    `saturate(${clampPct(saturation)}%)`,
  ];

  // Temperature/tint are white-balance shifts; a small hue-rotate is the
  // closest a CSS filter chain can get. Warmth also gets a touch of sepia.
  const hue = (p.hue ?? 0) + (p.temperature ?? 0) * -0.4 + (p.tint ?? 0) * 0.3;
  if (hue) parts.push(`hue-rotate(${hue}deg)`);
  if ((p.temperature ?? 0) > 0) parts.push(`sepia(${Math.min(60, p.temperature * 0.35)}%)`);

  if (p.dehaze > 0) parts.push(`contrast(${100 + p.dehaze * 0.2}%)`); // extra punch, dehaze reads as "de-flatten"
  if (p.grayscale) parts.push(`grayscale(${p.grayscale}%)`);

  const blur = (p.blur ?? 0) + (p.smooth ?? 0) * 0.06; // "smooth" softens like a light blur
  if (blur) parts.push(`blur(${blur}px)`);

  return parts.join(' ');
}

const clampPct = (n) => Math.max(0, Math.round(n));

// Adjustment presets used by the editor's quick preset buttons.
export const ADJUST_PRESETS = {
  auto: { brightness: 105, contrast: 108, saturation: 108, hue: 0, grayscale: 0, blur: 0 },
  bw: { brightness: 100, contrast: 110, saturation: 100, hue: 0, grayscale: 100, blur: 0 },
  pop: { brightness: 102, contrast: 118, saturation: 150, hue: 0, grayscale: 0, blur: 0 },
};
