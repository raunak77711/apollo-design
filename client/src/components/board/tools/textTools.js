import { newAnnotationId } from '../state/ids.js';
import { stickyRecord, textRecord } from '../state/annotations.js';

/**
 * Text and sticky note: click to place, type immediately. The box is not in
 * the board state until editing ends (an empty one is simply discarded), and
 * the tool hands back to Select at that moment — see toolManager and the
 * `text:editing:exited` handler in createEditor. Clicking away while typing
 * only finishes the edit; it never starts a second box.
 */
export function textTool(editor, kind) {
  const { canvas, fabric } = editor;
  return {
    name: kind,
    oneShot: true,
    activate() {
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.defaultCursor = 'text';
    },
    onDown(opt) {
      const active = canvas.getActiveObject();
      if (active?.isEditing) {
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        return;
      }
      const p = canvas.getPointer(opt.e);
      const d = editor.defaults.get();
      const id = newAnnotationId();
      // The record builders take a section-relative y; here it is a world y, which is fine:
      // the box is converted to a real record (with its true section) when editing ends.
      const rec = kind === 'text'
        ? textRecord({ id, section: '', x: p.x, y: p.y, text: 'Text', style: { fontFamily: d.fontFamily, fontSize: d.fontSize, color: d.color } })
        : stickyRecord({ id, section: '', x: p.x, y: p.y });
      const box = new fabric.Textbox(rec.json.text, rec.json);
      box.set('data', rec.json.data);
      canvas.add(box);
      canvas.setActiveObject(box);
      box.enterEditing();
      box.selectAll();
      canvas.requestRenderAll();
    },
  };
}
