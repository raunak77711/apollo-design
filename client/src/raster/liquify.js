/**
 * Real pixel-warping liquify. For every destination pixel under the brush, we
 * work out where its content actually came from (backward mapping) and
 * bilinear-sample the source canvas there — the same technique Photoshop's
 * Liquify and most warp tools use, just without the mesh-caching they do for
 * speed. Only the brush's own bounding box is read/written per stamp, so a
 * stroke stays responsive even though it runs on the main thread.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Cosine falloff — soft in the middle of the brush, feathering to zero at the edge. */
function falloff(dist, radius) {
  if (dist >= radius) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * dist) / radius));
}

/**
 * Apply one liquify stamp to `ctx` (the live working canvas).
 * @param tool 'push' | 'enlarge' | 'shrink' | 'swirl-right' | 'swirl-left' | 'restore'
 * @param center {x,y} brush centre in canvas pixels
 * @param radius brush radius in canvas pixels
 * @param strength 0-100
 * @param drag {dx,dy} pointer movement since the last stamp (used by 'push')
 * @param originalCanvas the untouched source, used only by 'restore'
 */
export function liquifyStamp(ctx, { tool, center, radius, strength, drag, originalCanvas }) {
  const canvas = ctx.canvas;
  const r = Math.max(2, Math.round(radius));
  const x0 = clamp(Math.floor(center.x - r), 0, canvas.width - 1);
  const y0 = clamp(Math.floor(center.y - r), 0, canvas.height - 1);
  const x1 = clamp(Math.ceil(center.x + r), 0, canvas.width);
  const y1 = clamp(Math.ceil(center.y + r), 0, canvas.height);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  const amount = clamp(strength, 0, 100) / 100;
  const src = tool === 'restore' ? originalCanvas.getContext('2d') : ctx;
  const srcData = src.getImageData(x0, y0, w, h);
  const destData = ctx.getImageData(x0, y0, w, h);
  // The source region for a warp needs padding around the brush box, since a
  // pixel just inside the box can pull from just outside it.
  const pad = Math.ceil(r * 0.6);
  const sx0 = clamp(x0 - pad, 0, canvas.width - 1);
  const sy0 = clamp(y0 - pad, 0, canvas.height - 1);
  const sx1 = clamp(x1 + pad, 0, canvas.width);
  const sy1 = clamp(y1 + pad, 0, canvas.height);
  const wide = src.getImageData(sx0, sy0, sx1 - sx0, sy1 - sy0);

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = x0 + px - center.x;
      const dy = y0 + py - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const f = falloff(dist, r) * amount;
      const di = (py * w + px) * 4;

      if (f <= 0) {
        destData.data[di] = srcData.data[di];
        destData.data[di + 1] = srcData.data[di + 1];
        destData.data[di + 2] = srcData.data[di + 2];
        destData.data[di + 3] = srcData.data[di + 3];
        continue;
      }

      if (tool === 'restore') {
        destData.data[di] = lerp(destData.data[di], srcData.data[di], f);
        destData.data[di + 1] = lerp(destData.data[di + 1], srcData.data[di + 1], f);
        destData.data[di + 2] = lerp(destData.data[di + 2], srcData.data[di + 2], f);
        destData.data[di + 3] = lerp(destData.data[di + 3], srcData.data[di + 3], f);
        continue;
      }

      let sxCanvas = x0 + px;
      let syCanvas = y0 + py;

      if (tool === 'push') {
        sxCanvas -= (drag?.dx || 0) * f;
        syCanvas -= (drag?.dy || 0) * f;
      } else if (tool === 'enlarge') {
        sxCanvas = center.x + dx * (1 - f * 0.5);
        syCanvas = center.y + dy * (1 - f * 0.5);
      } else if (tool === 'shrink') {
        sxCanvas = center.x + dx * (1 + f * 0.6);
        syCanvas = center.y + dy * (1 + f * 0.6);
      } else if (tool === 'swirl-right' || tool === 'swirl-left') {
        const angle = f * (Math.PI / 2) * (tool === 'swirl-right' ? -1 : 1);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        sxCanvas = center.x + (dx * cos - dy * sin);
        syCanvas = center.y + (dx * sin + dy * cos);
      }

      const sample = bilinear(wide, sx0, sy0, sxCanvas, syCanvas);
      destData.data[di] = sample[0];
      destData.data[di + 1] = sample[1];
      destData.data[di + 2] = sample[2];
      destData.data[di + 3] = sample[3];
    }
  }

  ctx.putImageData(destData, x0, y0);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Bilinear-sample `img` (offset by ox,oy in canvas space) at canvas point (x, y). */
function bilinear(img, ox, oy, x, y) {
  const lx = x - ox;
  const ly = y - oy;
  const x0 = clamp(Math.floor(lx), 0, img.width - 1);
  const y0 = clamp(Math.floor(ly), 0, img.height - 1);
  const x1 = clamp(x0 + 1, 0, img.width - 1);
  const y1 = clamp(y0 + 1, 0, img.height - 1);
  const tx = clamp(lx - x0, 0, 1);
  const ty = clamp(ly - y0, 0, 1);

  const at = (xx, yy) => {
    const i = (yy * img.width + xx) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  };

  const c00 = at(x0, y0);
  const c10 = at(x1, y0);
  const c01 = at(x0, y1);
  const c11 = at(x1, y1);

  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const top = lerp(c00[i], c10[i], tx);
    const bottom = lerp(c01[i], c11[i], tx);
    out[i] = Math.round(lerp(top, bottom, ty));
  }
  return out;
}
