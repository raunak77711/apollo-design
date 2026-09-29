/**
 * Keyboard shortcuts. Bare-key shortcuts are ignored whenever a person is
 * typing — in a text input, or inside a text box on the canvas — because "r"
 * and "e" must type letters there, not switch tools. They are also ignored
 * while a dialog is open: the dialog owns the keyboard, and reacting to its
 * Escape here would re-render the page between listeners and make the dialog's
 * own Escape handler miss the event. Ctrl/Cmd+key is left to the browser except
 * undo/redo and the Direct bar.
 */

const TOOL_KEYS = {
  v: 'select', h: 'hand', p: 'pen', m: 'highlighter', e: 'eraser', a: 'arrow', l: 'line',
  r: 'rectangle', c: 'circle', t: 'text', n: 'sticky',
};

export function attachKeys(editor, { onEscape, onHelp, onDirect } = {}) {
  const typing = () => {
    const el = document.activeElement;
    if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return true;
    return Boolean(editor.canvas.getActiveObject()?.isEditing);
  };

  const dialogOpen = () => Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));

  function onKeyDown(e) {
    if (typing() || dialogOpen()) return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (mod && key === 'y') {
      e.preventDefault();
      editor.redo();
      return;
    }
    if (mod && key === 'k') {
      e.preventDefault();
      onDirect?.();
      return;
    }
    if (mod || e.altKey) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) editor.tools.hold('hand');
      return;
    }
    if (e.key === 'Escape') {
      onEscape?.();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (editor.getSelection().length) {
        e.preventDefault();
        editor.deleteSelection();
      }
      return;
    }
    if (e.key === '?') {
      onHelp?.();
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      onDirect?.();
      return;
    }
    if (TOOL_KEYS[key]) {
      editor.tools.set(TOOL_KEYS[key]);
      return;
    }
    if (key === 'i') {
      editor.requestImage?.();
      return;
    }
    if (key === '+' || key === '=') return editor.viewport.zoomBy(1.2);
    if (key === '-' || key === '_') return editor.viewport.zoomBy(1 / 1.2);
    if (key === '0') return editor.viewport.reset();
    if (key === 'f') {
      const first = editor.getSelection()[0];
      if (first) editor.focusObject(first.id);
      return;
    }
    if (key === '[') return editor.stepSection(-1);
    if (key === ']') return editor.stepSection(1);
    if (e.key === 'PageDown') return editor.stepSection(1);
    if (e.key === 'PageUp') return editor.stepSection(-1);
    if (e.key === 'Home') return editor.goToSection(0);
    if (e.key === 'End') return editor.goToSection(Infinity);

    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [x, y] = arrows[e.key];
      const step = e.shiftKey ? 10 : 1;
      // With something selected the arrows nudge it; otherwise they scroll the board.
      if (!editor.nudge(x * step, y * step)) editor.viewport.panBy(-x * 60, -y * 60);
    }
    return undefined;
  }

  function onKeyUp(e) {
    if (e.code === 'Space') editor.tools.release();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  };
}
