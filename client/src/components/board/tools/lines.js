import { arrowGeometry } from '../state/annotations.js';
import { resolveColor } from '../state/styleMap.js';
import { constrain45 } from './util.js';

/**
 * Line and arrow: press where it starts, drag to where it ends. Ends snap to
 * the centre or an edge midpoint of any nearby object (within 15 screen px),
 * Shift constrains to 45°, and a plain click drops a 180-unit arrow. Both are
 * the same LineArrow object; the arrow just has a head.
 */
export function lineTool(editor, kind) {
  const { canvas, fabric } = editor;
  const LineArrow = fabric.LineArrow;
  let start = null;
  let obj = null;

  return {
    name: kind,
    oneShot: true,
    activate() {
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.defaultCursor = 'crosshair';
    },
    onDown(opt) {
      const p = canvas.getPointer(opt.e);
      start = editor.snapPoint(p.x, p.y);
      const d = editor.defaults.get();
      obj = new LineArrow({
        ...arrowGeometry(start.x, start.y, start.x + 1, start.y),
        color: resolveColor(d.color), lineWidth: d.strokeWidth, dashed: false, headEnd: kind === 'arrow', headStart: false,
      });
      canvas.add(obj);
    },
    onMove(opt) {
      if (!obj) return;
      const p = canvas.getPointer(opt.e);
      const end = opt.e.shiftKey ? constrain45(start, p) : editor.snapPoint(p.x, p.y, obj);
      obj.setEndpoints(start.x, start.y, end.x, end.y);
      canvas.requestRenderAll();
    },
    onUp() {
      if (!obj) return;
      const e = obj.getEndpoints();
      if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 8) obj.setEndpoints(start.x, start.y, start.x + 180, start.y);
      const made = editor.addObject(obj, kind);
      obj = null;
      editor.tools.finishOneShot();
      editor.select([made.data.id]);
    },
  };
}
