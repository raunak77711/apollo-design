import { resolveColor } from '../state/styleMap.js';
import { tint } from './util.js';

/**
 * Rectangle and circle: drag to size (Shift keeps it square/round). A plain
 * click, with no drag, drops a default-sized shape at the click. The shape is
 * drawn straight onto the canvas while dragging and recorded once, on release.
 */
export function shapeTool(editor, shape) {
  const { canvas, fabric } = editor;
  let start = null;
  let obj = null;

  return {
    name: shape,
    oneShot: true,
    activate() {
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.defaultCursor = 'crosshair';
    },
    onDown(opt) {
      start = canvas.getPointer(opt.e);
      const d = editor.defaults.get();
      const color = resolveColor(d.color);
      const common = {
        originX: 'left', originY: 'top', left: start.x, top: start.y,
        fill: tint(color, 0.06), stroke: color, strokeWidth: d.strokeWidth, strokeUniform: true,
      };
      obj = shape === 'rectangle'
        ? new fabric.Rect({ ...common, width: 1, height: 1, rx: 10, ry: 10 })
        : new fabric.Ellipse({ ...common, rx: 1, ry: 1 });
      canvas.add(obj);
    },
    onMove(opt) {
      if (!obj) return;
      const p = canvas.getPointer(opt.e);
      let w = p.x - start.x;
      let h = p.y - start.y;
      if (opt.e.shiftKey) {
        const s = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * s;
        h = Math.sign(h || 1) * s;
      }
      const left = Math.min(start.x, start.x + w);
      const top = Math.min(start.y, start.y + h);
      if (shape === 'rectangle') obj.set({ left, top, width: Math.abs(w), height: Math.abs(h) });
      else obj.set({ left, top, rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
      obj.setCoords();
      canvas.requestRenderAll();
    },
    onUp() {
      if (!obj) return;
      if (obj.getScaledWidth() < 12 && obj.getScaledHeight() < 12) {
        const left = start.x - 120;
        const top = start.y - 75;
        if (shape === 'rectangle') obj.set({ left, top, width: 240, height: 150 });
        else obj.set({ left, top, rx: 120, ry: 75 });
        obj.setCoords();
      }
      const made = editor.addObject(obj, 'shape');
      obj = null;
      editor.tools.finishOneShot();
      editor.select([made.data.id]);
    },
  };
}
