/**
 * Owns which tool is active and routes the canvas's mouse events to it.
 *
 * A tool is a plain object of optional callbacks. `set` resets the canvas to
 * the neutral "select" baseline, then lets the tool bend it (a drawing mode, a
 * crosshair, hit-testing off). One-shot tools — shapes, arrows, text — hand
 * control back to Select when they finish, unless locked with a double-click.
 * `hold` is the temporary Hand while Space is down.
 */
export function createToolManager(editor, tools, { onTool } = {}) {
  const { canvas } = editor;
  let name = 'select';
  let tool = tools.select;
  let locked = false;
  let held = null;

  function baseline() {
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.freeDrawingCursor = 'crosshair';
  }

  function set(next, { lock = false } = {}) {
    if (!tools[next]) return;
    tool.deactivate?.();
    editor.renderer.setInteractive(true);
    baseline();
    name = next;
    tool = tools[next];
    locked = lock;
    if (next !== 'select' && next !== 'text' && next !== 'sticky') canvas.discardActiveObject();
    tool.activate?.();
    canvas.requestRenderAll();
    onTool?.(name, locked);
  }

  function finishOneShot() {
    if (!locked && tool.oneShot) set('select');
  }

  canvas.on('mouse:down', (opt) => tool.onDown?.(opt));
  canvas.on('mouse:move', (opt) => tool.onMove?.(opt));
  canvas.on('mouse:up', (opt) => tool.onUp?.(opt));
  canvas.on('path:created', (e) => tool.onPathCreated?.(e.path));
  canvas.on('text:editing:exited', () => {
    if (name === 'text' || name === 'sticky') finishOneShot();
  });

  return {
    set,
    finishOneShot,
    hold(next) {
      if (held) return;
      held = { name, locked };
      set(next);
    },
    release() {
      if (!held) return;
      const back = held;
      held = null;
      set(back.name, { lock: back.locked });
    },
    /** Tell the active tool the defaults (colour, width…) changed. */
    refresh() {
      tool.onDefaultsChanged?.();
    },
    get name() {
      return name;
    },
    get locked() {
      return locked;
    },
  };
}
