/**
 * One class for every line and arrow on the board: the Line and Arrow tools,
 * the connectors the layout draws between pieces, and the ones Direct mode adds.
 *
 * Fabric's own `Line` stores absolute endpoint coordinates that drift out of
 * step with `left`/`top` when the object moves (the reference deck's snapping
 * bug), so this is a plain object instead: a bounding box plus two endpoints in
 * box-local coordinates. Moving it changes `left`/`top` and nothing else.
 * It has no scale or rotate handles — only the two endpoint handles — so
 * scale is always 1 and angle 0.
 *
 * `strokeWidth` on the Fabric object stays 0 (the bounding box is exactly the
 * endpoints); the visible width is `lineWidth`.
 */

function drawHead(ctx, tip, angle, size) {
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - Math.cos(angle - 0.42) * size, tip.y - Math.sin(angle - 0.42) * size);
  ctx.lineTo(tip.x - Math.cos(angle + 0.42) * size, tip.y - Math.sin(angle + 0.42) * size);
  ctx.closePath();
  ctx.fill();
}

function endpointControl(fabric, which) {
  return new fabric.Control({
    x: 0,
    y: 0,
    cursorStyle: 'crosshair',
    sizeX: 26,
    sizeY: 26,
    actionName: 'endpoint',
    positionHandler(dim, finalMatrix, obj) {
      const local = {
        x: (which === 'start' ? obj.sx : obj.ex) - obj.width / 2,
        y: (which === 'start' ? obj.sy : obj.ey) - obj.height / 2,
      };
      const vpt = obj.canvas ? obj.canvas.viewportTransform : fabric.iMatrix;
      return fabric.util.transformPoint(local, fabric.util.multiplyTransformMatrices(vpt, obj.calcTransformMatrix()));
    },
    // x, y arrive in scene coordinates (the pointer with the viewport undone).
    actionHandler(eventData, transform, x, y) {
      const obj = transform.target;
      const e = obj.getEndpoints();
      const anchor = which === 'start' ? { x: e.x2, y: e.y2 } : { x: e.x1, y: e.y1 };
      let px = x;
      let py = y;
      if (eventData.shiftKey) {
        const dx = px - anchor.x;
        const dy = py - anchor.y;
        const len = Math.hypot(dx, dy);
        const step = Math.PI / 4;
        const a = Math.round(Math.atan2(dy, dx) / step) * step;
        px = anchor.x + Math.cos(a) * len;
        py = anchor.y + Math.sin(a) * len;
      } else if (typeof obj.snap === 'function') {
        ({ x: px, y: py } = obj.snap(px, py, obj));
      }
      if (which === 'start') obj.setEndpoints(px, py, e.x2, e.y2);
      else obj.setEndpoints(e.x1, e.y1, px, py);
      return true;
    },
    render(ctx, left, top) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(left, top, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },
  });
}

export function registerLineArrow(fabric) {
  if (fabric.LineArrow) return fabric.LineArrow;

  const LineArrow = fabric.util.createClass(fabric.Object, {
    type: 'lineArrow',
    sx: 0,
    sy: 0,
    ex: 100,
    ey: 0,
    color: '#c81e3a',
    lineWidth: 5,
    dashed: false,
    headEnd: true,
    headStart: false,
    fill: null,
    strokeWidth: 0,
    objectCaching: false,
    padding: 10,
    hasBorders: false,

    initialize(options) {
      this.callSuper('initialize', options || {});
      this.controls = { start: endpointControl(fabric, 'start'), end: endpointControl(fabric, 'end') };
    },

    toObject(propertiesToInclude) {
      return fabric.util.object.extend(this.callSuper('toObject', propertiesToInclude), {
        sx: this.sx, sy: this.sy, ex: this.ex, ey: this.ey,
        color: this.color, lineWidth: this.lineWidth, dashed: this.dashed, headEnd: this.headEnd, headStart: this.headStart,
      });
    },

    getEndpoints() {
      return { x1: this.left + this.sx, y1: this.top + this.sy, x2: this.left + this.ex, y2: this.top + this.ey };
    },

    /** Endpoints in scene coordinates. Resets scale and angle: an arrow is only ever its two ends. */
    setEndpoints(x1, y1, x2, y2) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      this.set({
        left, top, angle: 0, scaleX: 1, scaleY: 1,
        width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(1, Math.abs(y2 - y1)),
        sx: x1 - left, sy: y1 - top, ex: x2 - left, ey: y2 - top,
      });
      this.setCoords();
      this.dirty = true;
    },

    _render(ctx) {
      const ox = -this.width / 2;
      const oy = -this.height / 2;
      const a = { x: ox + this.sx, y: oy + this.sy };
      const b = { x: ox + this.ex, y: oy + this.ey };
      const w = this.lineWidth;
      const head = Math.max(16, w * 4.2);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const inset = (this.headStart ? 1 : 0) + (this.headEnd ? 1 : 0) > 0 && length > head * 1.4 ? head * 0.7 : 0;
      const start = this.headStart ? { x: a.x + Math.cos(angle) * inset, y: a.y + Math.sin(angle) * inset } : a;
      const end = this.headEnd ? { x: b.x - Math.cos(angle) * inset, y: b.y - Math.sin(angle) * inset } : b;

      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.fillStyle = this.color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (this.dashed) ctx.setLineDash([w * 3, w * 2.2]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.headEnd && length > 2) drawHead(ctx, b, angle, head);
      if (this.headStart && length > 2) drawHead(ctx, a, angle + Math.PI, head);
      ctx.restore();
    },
  });

  LineArrow.fromObject = (object, callback) => fabric.Object._fromObject('LineArrow', object, callback);
  fabric.LineArrow = LineArrow;
  return LineArrow;
}
