/**
 * Polygon and star geometry — MIRROR of client/src/design/shapes.js.
 *
 * Both shapes are described by a handful of numbers (sides, points, depth) and
 * turned into real coordinates here, so the canvas, the previews and the export
 * draw the same outline from the same maths.
 *
 * Points are normalised to fill their frame: a three-sided polygon reaches the
 * bottom corners of its box rather than sitting inside an invisible circle,
 * which is what anyone dragging a triangle out expects.
 */

const TAU = Math.PI * 2;

function normalise(points, width, height, inset = 0) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const w = Math.max(1, width - inset * 2);
  const h = Math.max(1, height - inset * 2);
  return points.map(([x, y]) => [
    inset + ((x - minX) / spanX) * w,
    inset + ((y - minY) / spanY) * h,
  ]);
}

/** Regular polygon, apex up. `inset` keeps a stroke inside the frame. */
export function polygonPoints(width, height, sides = 3, inset = 0) {
  const n = Math.max(3, Math.min(24, Math.round(sides)));
  const raw = [];
  for (let i = 0; i < n; i += 1) {
    const angle = -Math.PI / 2 + (i / n) * TAU;
    raw.push([Math.cos(angle), Math.sin(angle)]);
  }
  return normalise(raw, width, height, inset);
}

/** Star with `points` tips; `depth` (0–1) is how far the inner vertices sit in. */
export function starPoints(width, height, points = 5, depth = 0.45, inset = 0) {
  const n = Math.max(3, Math.min(24, Math.round(points)));
  const inner = Math.max(0.05, Math.min(0.95, depth));
  const raw = [];
  for (let i = 0; i < n * 2; i += 1) {
    const radius = i % 2 === 0 ? 1 : inner;
    const angle = -Math.PI / 2 + (i / (n * 2)) * TAU;
    raw.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return normalise(raw, width, height, inset);
}

export function pointsFor(element, inset = 0) {
  const p = element.properties || {};
  return element.type === 'star'
    ? starPoints(element.width, element.height, p.points, p.depth, inset)
    : polygonPoints(element.width, element.height, p.sides, inset);
}

export const pointsAttr = (points) => points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');

const round = (n) => Math.round(n * 100) / 100;
