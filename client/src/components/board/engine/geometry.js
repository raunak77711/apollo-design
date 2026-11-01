/**
 * Rectangles and the lines between them. Everything in the scene that takes up
 * space has a centre and a size, so connectors can be worked out from that
 * alone — including after the user has moved, scaled or deleted the ends.
 */

export const rectOf = ({ cx, cy, w, h }) => ({ cx, cy, w, h });

export const overlaps = (a, b) =>
  Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h;

/** Where a ray from the centre of `rect` toward (tx, ty) leaves the rectangle. */
export function edgePoint(rect, tx, ty) {
  const dx = tx - rect.cx;
  const dy = ty - rect.cy;
  if (dx === 0 && dy === 0) return { x: rect.cx, y: rect.cy };
  const sx = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy);
  const t = Math.min(sx, sy);
  return { x: rect.cx + dx * t, y: rect.cy + dy * t };
}

/**
 * The two ends of a connector between rectangles `a` and `b`, each pulled back
 * `gap` from its box so an arrowhead never touches the thing it points at.
 * Boxes that touch or overlap get a short centre-to-centre line and
 * `degenerate: true` — better a stub than an arrow that flips backwards.
 */
export function connectorPoints(a, b, gap = 10) {
  const p1 = edgePoint(a, b.cx, b.cy);
  const p2 = edgePoint(b, a.cx, a.cy);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  const overlapping = Math.abs(a.cx - b.cx) * 2 < a.w + b.w && Math.abs(a.cy - b.cy) * 2 < a.h + b.h;
  if (overlapping || len <= gap * 2 + 1) return { x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy, degenerate: true };
  const ux = dx / len;
  const uy = dy / len;
  return { x1: p1.x + ux * gap, y1: p1.y + uy * gap, x2: p2.x - ux * gap, y2: p2.y - uy * gap };
}
