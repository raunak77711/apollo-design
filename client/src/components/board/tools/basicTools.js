/** Select is the baseline; Hand drags the camera instead of anything on the board. */

export function selectTool() {
  return { name: 'select' };
}

export function handTool(editor) {
  const { canvas, viewport } = editor;
  return {
    name: 'hand',
    activate() {
      canvas.selection = false;
      canvas.skipTargetFind = true;
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
    },
    onDown(opt) {
      canvas.defaultCursor = 'grabbing';
      viewport.beginDrag(opt.e.clientX, opt.e.clientY);
    },
    onMove(opt) {
      viewport.moveDrag(opt.e.clientX, opt.e.clientY);
    },
    onUp() {
      canvas.defaultCursor = 'grab';
      viewport.endDrag();
    },
  };
}
