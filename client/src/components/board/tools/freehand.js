import { resolveColor } from '../state/styleMap.js';

/**
 * Pen and highlighter. Fabric's PencilBrush draws the stroke; when it finishes
 * (`path:created`) the finished Path becomes an annotation like anything else.
 * The highlighter multiplies onto the page so it stays legible over text and
 * never hides what it marks.
 */
export function freehandTool(editor, kind) {
  const { canvas, fabric } = editor;
  const highlighter = kind === 'highlighter';

  function styleBrush() {
    const d = editor.defaults.get();
    const brush = canvas.freeDrawingBrush;
    if (!brush) return;
    brush.color = highlighter ? 'rgba(255, 221, 51, 0.5)' : resolveColor(d.color);
    brush.width = highlighter ? Math.max(24, d.strokeWidth * 5) : d.strokeWidth;
    brush.strokeLineCap = highlighter ? 'butt' : 'round';
  }

  return {
    name: kind,
    activate() {
      canvas.isDrawingMode = true;
      canvas.selection = false;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      styleBrush();
    },
    deactivate() {
      canvas.isDrawingMode = false;
    },
    onDefaultsChanged: styleBrush,
    onPathCreated(path) {
      if (highlighter) path.set('globalCompositeOperation', 'multiply');
      editor.addObject(path, highlighter ? 'highlight' : 'path');
    },
  };
}
