/**
 * Shapes drawn straight onto the Draw Studio canvas by dragging a bounding
 * box (or, for a line, just two endpoints) — distinct from Apollo's vector
 * shape *elements* (design/shapes.js), which stay editable forever. These are
 * baked into pixels the moment you release the drag, matching how the rest of
 * the Draw tools work.
 */
export const SHAPE_TYPES = ['rectangle', 'circle', 'triangle', 'star', 'heart', 'line'];

export function drawRasterShape(ctx, type, box, { fill, fillColor, outline, outlineColor, outlineWidth }) {
  const { x0, y0, x1, y1 } = box;
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);

  ctx.save();
  if (fill) ctx.fillStyle = fillColor;
  if (outline) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(1, outlineWidth);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  const paint = () => {
    if (fill) ctx.fill();
    if (outline) ctx.stroke();
  };

  if (type === 'line') {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = outline ? outlineColor : fillColor;
    ctx.lineWidth = Math.max(1, outlineWidth || 4);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (type === 'rectangle') {
    ctx.rect(x, y, w, h);
  } else if (type === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.1, w / 2), Math.max(0.1, h / 2), 0, 0, Math.PI * 2);
  } else if (type === 'triangle') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  } else if (type === 'star') {
    starPath(ctx, x + w / 2, y + h / 2, Math.min(w, h) / 2, Math.min(w, h) / 4.4, 5);
  } else if (type === 'heart') {
    heartPath(ctx, x, y, w, h);
  }
  paint();
  ctx.restore();
}

function starPath(ctx, cx, cy, outerR, innerR, points) {
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = i * step - Math.PI / 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function heartPath(ctx, x, y, w, h) {
  const cx = x + w / 2;
  ctx.moveTo(cx, y + h * 0.3);
  ctx.bezierCurveTo(cx, y, x, y, x, y + h * 0.3);
  ctx.bezierCurveTo(x, y + h * 0.6, cx, y + h * 0.8, cx, y + h);
  ctx.bezierCurveTo(cx, y + h * 0.8, x + w, y + h * 0.6, x + w, y + h * 0.3);
  ctx.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.3);
  ctx.closePath();
}
