/**
 * Loads a source image onto a working `<canvas>` and exports it back out.
 * Shared by Liquify, Retouch and Draw — anywhere a tool needs real pixels to
 * paint on rather than a CSS filter. Working resolution is capped so a pointer
 * -driven brush stays responsive even on a large photo; the element still
 * renders the full-resolution result once exported, since the canvas itself
 * becomes the new source image.
 */
const MAX_DIMENSION = 1600;

export async function loadImageToCanvas(src) {
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export function canvasToDataUrl(canvas, type = 'image/png') {
  return canvas.toDataURL(type);
}
