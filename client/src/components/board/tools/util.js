/** Small pure helpers the tools share — kept apart from Fabric so they can be tested. */

export function tint(color, alpha) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function nearestPoint(points, x, y, maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** Where an arrow end may snap on an object: its centre and the midpoint of each edge. */
export function rectSnapPoints({ left, top, width, height }) {
  const cx = left + width / 2;
  const cy = top + height / 2;
  return [
    { x: cx, y: cy },
    { x: cx, y: top },
    { x: left + width, y: cy },
    { x: cx, y: top + height },
    { x: left, y: cy },
  ];
}

export function constrain45(anchor, p) {
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: anchor.x + Math.cos(a) * len, y: anchor.y + Math.sin(a) * len };
}

/** Downscale so the longer side is at most `max`; never enlarge. */
export function scaledSize(w, h, max) {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const k = max / longest;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Scale and position that centre a w×h image inside `box`, leaving `pad` all round. */
export function fitInto(w, h, box, pad = 0) {
  const scale = Math.min((box.w - pad * 2) / w, (box.h - pad * 2) / h);
  return { scale, left: box.x + (box.w - w * scale) / 2, top: box.y + (box.h - h * scale) / 2 };
}
