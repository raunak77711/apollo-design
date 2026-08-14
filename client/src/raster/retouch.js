/**
 * Retouch brushes: dodge/burn (tonal-range-aware lighten/darken), a local
 * blur, and a local sharpen (unsharp mask). All operate only within the
 * brush's bounding box, softness-feathered from the centre.
 */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function falloff(dist, radius, softness) {
  if (dist >= radius) return 0;
  const soft = clamp(softness, 0, 100) / 100;
  const hard = radius * (1 - soft);
  if (dist <= hard) return 1;
  return 1 - (dist - hard) / Math.max(1, radius - hard);
}

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** How strongly a pixel of luminance L belongs to the chosen tonal range. */
function rangeWeight(L, range) {
  if (range === 'shadows') return clamp(1 - L / 128, 0, 1);
  if (range === 'highlights') return clamp((L - 128) / 127, 0, 1);
  return 1 - Math.abs(L - 128) / 128; // midtones
}

function stampBox(ctx, center, radius) {
  const canvas = ctx.canvas;
  const r = Math.max(2, Math.round(radius));
  const x0 = clamp(Math.floor(center.x - r), 0, canvas.width - 1);
  const y0 = clamp(Math.floor(center.y - r), 0, canvas.height - 1);
  const x1 = clamp(Math.ceil(center.x + r), 0, canvas.width);
  const y1 = clamp(Math.ceil(center.y + r), 0, canvas.height);
  const w = x1 - x0;
  const h = y1 - y0;
  return w > 0 && h > 0 ? { x0, y0, x1, y1, w, h, r } : null;
}

export function dodgeBurnStamp(ctx, { center, radius, softness, strength, mode, range }) {
  const box = stampBox(ctx, center, radius);
  if (!box) return;
  const { x0, y0, w, h, r } = box;
  const data = ctx.getImageData(x0, y0, w, h);
  const amount = (clamp(strength, 0, 100) / 100) * 0.55;
  const sign = mode === 'darken' ? -1 : 1;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = x0 + px - center.x;
      const dy = y0 + py - center.y;
      const f = falloff(Math.sqrt(dx * dx + dy * dy), r, softness);
      if (f <= 0) continue;
      const i = (py * w + px) * 4;
      const [red, green, blue] = [data.data[i], data.data[i + 1], data.data[i + 2]];
      const L = luminance(red, green, blue);
      const k = f * amount * rangeWeight(L, range);
      if (k <= 0) continue;
      data.data[i] = adjust(red, k, sign);
      data.data[i + 1] = adjust(green, k, sign);
      data.data[i + 2] = adjust(blue, k, sign);
    }
  }
  ctx.putImageData(data, x0, y0);
}

function adjust(channel, k, sign) {
  return sign > 0 ? clamp(channel + (255 - channel) * k, 0, 255) : clamp(channel * (1 - k), 0, 255);
}

export function blurStamp(ctx, { center, radius, softness, strength }) {
  const box = stampBox(ctx, center, radius);
  if (!box) return;
  const { x0, y0, w, h, r } = box;
  const pad = 2;
  const src = ctx.getImageData(clamp(x0 - pad, 0, ctx.canvas.width - 1), clamp(y0 - pad, 0, ctx.canvas.height - 1), w + pad * 2, h + pad * 2);
  const dest = ctx.getImageData(x0, y0, w, h);
  const amount = clamp(strength, 0, 100) / 100;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = x0 + px - center.x;
      const dy = y0 + py - center.y;
      const f = falloff(Math.sqrt(dx * dx + dy * dy), r, softness) * amount;
      if (f <= 0) continue;
      const di = (py * w + px) * 4;
      const [br, bg, bb, ba] = boxAvg3(src, px + pad, py + pad);
      dest.data[di] = lerp(dest.data[di], br, f);
      dest.data[di + 1] = lerp(dest.data[di + 1], bg, f);
      dest.data[di + 2] = lerp(dest.data[di + 2], bb, f);
      dest.data[di + 3] = lerp(dest.data[di + 3], ba, f);
    }
  }
  ctx.putImageData(dest, x0, y0);
}

export function sharpenStamp(ctx, { center, radius, softness, strength }) {
  const box = stampBox(ctx, center, radius);
  if (!box) return;
  const { x0, y0, w, h, r } = box;
  const pad = 1;
  const src = ctx.getImageData(clamp(x0 - pad, 0, ctx.canvas.width - 1), clamp(y0 - pad, 0, ctx.canvas.height - 1), w + pad * 2, h + pad * 2);
  const dest = ctx.getImageData(x0, y0, w, h);
  const amount = (clamp(strength, 0, 100) / 100) * 1.5;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = x0 + px - center.x;
      const dy = y0 + py - center.y;
      const f = falloff(Math.sqrt(dx * dx + dy * dy), r, softness) * amount;
      if (f <= 0) continue;
      const di = (py * w + px) * 4;
      const [br, bg, bb] = boxAvg3(src, px + pad, py + pad);
      // Unsharp mask: original + (original - blurred) * amount.
      dest.data[di] = clamp(dest.data[di] + (dest.data[di] - br) * f, 0, 255);
      dest.data[di + 1] = clamp(dest.data[di + 1] + (dest.data[di + 1] - bg) * f, 0, 255);
      dest.data[di + 2] = clamp(dest.data[di + 2] + (dest.data[di + 2] - bb) * f, 0, 255);
    }
  }
  ctx.putImageData(dest, x0, y0);
}

const lerp = (a, b, t) => a + (b - a) * t;

/** 3x3 box average around (cx, cy) in `img` — cheap local blur for the blur/sharpen brushes. */
function boxAvg3(img, cx, cy) {
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let yy = cy - 1; yy <= cy + 1; yy++) {
    for (let xx = cx - 1; xx <= cx + 1; xx++) {
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      const i = (yy * img.width + xx) * 4;
      r += img.data[i];
      g += img.data[i + 1];
      b += img.data[i + 2];
      a += img.data[i + 3];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n, a / n] : [0, 0, 0, 0];
}
