/**
 * Freehand drawing primitives: a plain brush/eraser, eight stylised pen
 * modes, and a flood fill. Each pen mode is a genuinely different rendering
 * technique (not the same line with a different name) — see the comment on
 * each. All draw incrementally, segment by segment, so a stroke never needs
 * to be replayed from scratch as it grows.
 */

const TAU = Math.PI * 2;
const rand = (seed) => {
  // Deterministic per-call jitter without a dependency: cheap xorshift-ish hash.
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function withAlpha(ctx, alpha, draw) {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  draw();
  ctx.globalAlpha = prev;
}

/** Plain round line — the baseline the pen modes vary from. */
function strokePlain(ctx, from, to, { size, color }) {
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/**
 * A soft round brush: a trail of radial-gradient dabs rather than a hard
 * line, so "softness" has something real to control (a hard-edge disc at 0,
 * feathering out to a barely-there haze at 100).
 */
function dab(ctx, x, y, size, softness, color, compositeColor = color) {
  const r = Math.max(0.5, size / 2);
  const hardness = 1 - clamp01((softness ?? 0) / 100);
  const grad = ctx.createRadialGradient(x, y, r * hardness, x, y, r);
  grad.addColorStop(0, compositeColor);
  grad.addColorStop(1, transparent(compositeColor));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function strokeBrush(ctx, from, to, { size, softness, color }, seed = 0) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const spacing = Math.max(1, size * 0.2);
  const steps = Math.max(1, Math.round(dist / spacing));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    dab(ctx, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, size, softness, color);
  }
  void seed;
}

/** Eraser — same soft dabs, but cuts a hole instead of painting. */
function strokeEraser(ctx, from, to, opts) {
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'destination-out';
  strokeBrush(ctx, from, to, { ...opts, color: '#000000' });
  ctx.globalCompositeOperation = prevOp;
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const transparent = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return 'rgba(0,0,0,0)';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},0)`;
};

/* -------------------------------- pen modes ------------------------------- */

/** Two thin offset lines either side of the path — a technical-pen double line. */
function penParallel(ctx, from, to, { size, color }) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x) + Math.PI / 2;
  const offset = Math.max(2, size * 0.5);
  for (const s of [-1, 1]) {
    const ox = Math.cos(angle) * offset * s;
    const oy = Math.sin(angle) * offset * s;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x + ox, from.y + oy);
    ctx.lineTo(to.x + ox, to.y + oy);
    ctx.stroke();
  }
}

/** Several jittered, faint passes — reads as a rough pencil sketch. */
function penSketchy(ctx, from, to, { size, color }, seed) {
  for (let i = 0; i < 3; i++) {
    const jx = (rand(seed + i) - 0.5) * size * 0.6;
    const jy = (rand(seed + i * 7) - 0.5) * size * 0.6;
    withAlpha(ctx, 0.35, () => {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, size * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x + jx, from.y + jy);
      ctx.lineTo(to.x + jx, to.y + jy);
      ctx.stroke();
    });
  }
}

/** A perpendicular gradient across the stroke width — reads as a lit, rounded form. */
function penShaded(ctx, from, to, { size, color }) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const grad = ctx.createLinearGradient(
    from.x + Math.cos(angle + Math.PI / 2) * size,
    from.y + Math.sin(angle + Math.PI / 2) * size,
    from.x - Math.cos(angle + Math.PI / 2) * size,
    from.y - Math.sin(angle + Math.PI / 2) * size
  );
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

/** Short bristles fanned along the path — a textured, furry edge. */
function penFurry(ctx, from, to, { size, color }, seed) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const steps = Math.max(1, Math.round(dist / 3));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.1);
  ctx.lineCap = 'round';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + (to.x - from.x) * t;
    const py = from.y + (to.y - from.y) * t;
    const bristle = angle + Math.PI / 2 + (rand(seed + i) - 0.5) * 0.8;
    const len = size * (0.4 + rand(seed + i * 3) * 0.6);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(bristle) * len, py + Math.sin(bristle) * len);
    ctx.stroke();
  }
}

/** A fading ghost trail behind the stroke — motion-blur-like. */
function penTrail(ctx, from, to, { size, color }) {
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    withAlpha(ctx, 0.5 * (1 - t), () => {
      ctx.strokeStyle = color;
      ctx.lineWidth = size * (1 - t * 0.5);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x - (to.x - from.x) * t * 0.5, from.y - (to.y - from.y) * t * 0.5);
      ctx.lineTo(to.x - (to.x - from.x) * t * 0.5, to.y - (to.y - from.y) * t * 0.5);
      ctx.stroke();
    });
  }
}

/** Overlapping semi-transparent dabs with random alpha — a waxy, grainy crayon. */
function penCrayon(ctx, from, to, { size, color }, seed) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const steps = Math.max(1, Math.round(dist / (size * 0.25)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = from.x + (to.x - from.x) * t + (rand(seed + i) - 0.5) * size * 0.15;
    const py = from.y + (to.y - from.y) * t + (rand(seed + i * 5) - 0.5) * size * 0.15;
    withAlpha(ctx, 0.25 + rand(seed + i * 11) * 0.35, () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, size * (0.35 + rand(seed + i * 2) * 0.25), 0, TAU);
      ctx.fill();
    });
  }
}

/** Tapered width along the path — a loaded, wet ink line. */
function penInk(ctx, from, to, { size, color }, t = 0.5) {
  const width = size * (0.5 + Math.sin(t * Math.PI) * 0.9);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

const PEN_MODES = {
  plain: strokePlain,
  parallel: penParallel,
  sketchy: penSketchy,
  shaded: penShaded,
  furry: penFurry,
  trail: penTrail,
  crayon: penCrayon,
  ink: penInk,
};

export const PEN_MODE_IDS = Object.keys(PEN_MODES);

/**
 * Draw one segment with the given tool. `progress` (0-1, how far into the
 * overall stroke this segment sits) feeds ink's taper; `seed` gives the
 * jittered modes stable-but-varied per-segment randomness.
 */
export function drawSegment(ctx, tool, from, to, opts, seed = 0, progress = 0.5) {
  ctx.save();
  withAlpha(ctx, (opts.transparency ?? 100) / 100, () => {
    if (tool === 'eraser') strokeEraser(ctx, from, to, opts);
    else if (tool === 'brush') strokeBrush(ctx, from, to, opts, seed);
    else {
      const render = PEN_MODES[tool] || strokePlain;
      if (tool === 'sketchy' || tool === 'furry' || tool === 'crayon') render(ctx, from, to, opts, seed);
      else if (tool === 'ink') render(ctx, from, to, opts, progress);
      else render(ctx, from, to, opts);
    }
  });
  ctx.restore();
}

/**
 * Classic 4-connected flood fill with a colour-distance tolerance. Non
 * -contiguous mode instead scans the whole canvas for matching pixels — the
 * "similar" behaviour most paint tools call the same button.
 */
export function floodFill(ctx, { x, y, color, tolerance = 20, opacity = 100, antiAlias = true, contiguous = true }) {
  const canvas = ctx.canvas;
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const startX = Math.round(x);
  const startY = Math.round(y);
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;

  const startI = (startY * w + startX) * 4;
  const target = [data[startI], data[startI + 1], data[startI + 2], data[startI + 3]];
  const fill = hexToRgb(color);
  const tol = (tolerance / 100) * 260; // 0-100 UI scale -> approx max channel distance

  const matches = (i) => colorDistance(data, i, target) <= tol;
  const alpha = clamp(opacity, 0, 100) / 100;

  const setPixel = (i, coverage = 1) => {
    const a = alpha * coverage;
    data[i] = lerp(data[i], fill[0], a);
    data[i + 1] = lerp(data[i + 1], fill[1], a);
    data[i + 2] = lerp(data[i + 2], fill[2], a);
    data[i + 3] = clamp(data[i + 3] + (255 - data[i + 3]) * a, 0, 255);
  };

  if (!contiguous) {
    for (let i = 0; i < data.length; i += 4) if (matches(i)) setPixel(i);
  } else {
    const visited = new Uint8Array(w * h);
    const stack = [[startX, startY]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
      const idx = cy * w + cx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const i = idx * 4;
      if (!matches(i)) continue;
      setPixel(i);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    if (antiAlias) {
      // Soften the fill's own edge by lightly re-blending boundary pixels.
      for (let yy = 1; yy < h - 1; yy++) {
        for (let xx = 1; xx < w - 1; xx++) {
          const idx = yy * w + xx;
          if (!visited[idx]) continue;
          const neighborsOut = [idx - 1, idx + 1, idx - w, idx + w].some((n) => !visited[n]);
          if (neighborsOut) setPixel(idx * 4, 0.5);
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);
}

function colorDistance(data, i, target) {
  const dr = data[i] - target[0];
  const dg = data[i + 1] - target[1];
  const db = data[i + 2] - target[2];
  const da = data[i + 3] - target[3];
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const lerp = (a, b, t) => a + (b - a) * t;
