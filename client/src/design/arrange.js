/**
 * Alignment, distribution and snapping maths. Everything returns plain
 * operations so arrangement flows through the same validated pipeline (and the
 * same undo entry) as every other edit.
 */

export function boundsOf(elements) {
  if (elements.length === 0) return null;
  const x = Math.min(...elements.map((e) => e.x));
  const y = Math.min(...elements.map((e) => e.y));
  const right = Math.max(...elements.map((e) => e.x + e.width));
  const bottom = Math.max(...elements.map((e) => e.y + e.height));
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

/**
 * A single element aligns to the canvas; several align to their shared bounding
 * box — which is what a designer means by "align left" in each case.
 */
export function alignOperations(elements, canvas, mode) {
  if (elements.length === 0) return [];
  const frame =
    elements.length > 1
      ? boundsOf(elements)
      : { x: 0, y: 0, width: canvas.width, height: canvas.height, right: canvas.width, bottom: canvas.height };

  return elements.map((el) => {
    const changes = {};
    if (mode === 'left') changes.x = Math.round(frame.x);
    if (mode === 'center') changes.x = Math.round(frame.x + (frame.width - el.width) / 2);
    if (mode === 'right') changes.x = Math.round(frame.right - el.width);
    if (mode === 'top') changes.y = Math.round(frame.y);
    if (mode === 'middle') changes.y = Math.round(frame.y + (frame.height - el.height) / 2);
    if (mode === 'bottom') changes.y = Math.round(frame.bottom - el.height);
    return { type: 'UPDATE_ELEMENT', targetId: el.id, changes };
  });
}

/** Even gaps between three or more elements along one axis. */
export function distributeOperations(elements, axis) {
  if (elements.length < 3) return [];
  const key = axis === 'x' ? 'x' : 'y';
  const sizeKey = axis === 'x' ? 'width' : 'height';
  const sorted = [...elements].sort((a, b) => a[key] - b[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[key] + last[sizeKey] - first[key];
  const used = sorted.reduce((total, el) => total + el[sizeKey], 0);
  const gap = (span - used) / (sorted.length - 1);

  let cursor = first[key];
  return sorted.map((el) => {
    const op = { type: 'UPDATE_ELEMENT', targetId: el.id, changes: { [key]: Math.round(cursor) } };
    cursor += el[sizeKey] + gap;
    return op;
  });
}

/* ------------------------------- Snapping -------------------------------- */

const THRESHOLD = 6; // screen pixels, converted to document units by the caller

/**
 * Finds the nearest alignment between the dragged box and the canvas centre,
 * canvas edges and every other element. Returns the adjusted position plus the
 * guides to draw, so moving something feels measured rather than approximate.
 */
export function snapPosition({ box, others, canvas, zoom }) {
  const tolerance = THRESHOLD / zoom;
  const guides = [];

  const verticals = [
    { at: 0, from: 0, to: canvas.height },
    { at: canvas.width / 2, from: 0, to: canvas.height },
    { at: canvas.width, from: 0, to: canvas.height },
  ];
  const horizontals = [
    { at: 0, from: 0, to: canvas.width },
    { at: canvas.height / 2, from: 0, to: canvas.width },
    { at: canvas.height, from: 0, to: canvas.width },
  ];

  for (const other of others) {
    verticals.push(
      { at: other.x, from: other.y, to: other.y + other.height },
      { at: other.x + other.width / 2, from: other.y, to: other.y + other.height },
      { at: other.x + other.width, from: other.y, to: other.y + other.height }
    );
    horizontals.push(
      { at: other.y, from: other.x, to: other.x + other.width },
      { at: other.y + other.height / 2, from: other.x, to: other.x + other.width },
      { at: other.y + other.height, from: other.x, to: other.x + other.width }
    );
  }

  const x = closest(verticals, [box.x, box.x + box.width / 2, box.x + box.width], tolerance);
  const y = closest(horizontals, [box.y, box.y + box.height / 2, box.y + box.height], tolerance);

  let nextX = box.x;
  let nextY = box.y;

  if (x) {
    nextX = box.x + x.delta;
    guides.push({ axis: 'x', at: x.line.at, from: Math.min(x.line.from, box.y), to: Math.max(x.line.to, box.y + box.height) });
  }
  if (y) {
    nextY = box.y + y.delta;
    guides.push({ axis: 'y', at: y.line.at, from: Math.min(y.line.from, box.x), to: Math.max(y.line.to, box.x + box.width) });
  }

  return { x: Math.round(nextX), y: Math.round(nextY), guides };
}

function closest(lines, points, tolerance) {
  let best = null;
  for (const line of lines) {
    for (const point of points) {
      const delta = line.at - point;
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, line };
      }
    }
  }
  return best;
}
