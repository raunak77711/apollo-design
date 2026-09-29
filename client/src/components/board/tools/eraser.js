/**
 * Object-level eraser: dragging across an annotation removes the whole
 * annotation. Presentation pieces are never erased — they are deleted with
 * Select + Delete, which is undoable and deliberate — so the tool turns their
 * hit-testing off while it is active and only ever sees what the person drew.
 * One drag is one undo step.
 */
export function eraserTool(editor) {
  const { canvas, renderer } = editor;
  let erasing = false;

  function hit(opt) {
    const target = canvas.findTarget(opt.e, false);
    if (target?.data?.kind === 'annotation') {
      editor.dispatch({ type: 'ANNOTATION_REMOVE', ids: [target.data.id] }, { coalesce: 'erase' });
    }
  }

  return {
    name: 'eraser',
    activate() {
      canvas.selection = false;
      canvas.defaultCursor = 'crosshair';
      canvas.hoverCursor = 'crosshair';
      renderer.setInteractive(false);
    },
    deactivate() {
      renderer.setInteractive(true);
    },
    onDown(opt) {
      erasing = true;
      hit(opt);
    },
    onMove(opt) {
      if (erasing) hit(opt);
    },
    onUp() {
      erasing = false;
    },
  };
}
