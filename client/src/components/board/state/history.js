/**
 * Snapshot undo/redo.
 *
 * Board state is immutable, so a snapshot is just a reference — cheap even
 * with a hundred of them, because images live in `assets` and are shared.
 * Bursts (dragging a slider, typing a size) pass the same `coalesceKey` and
 * collapse into the single snapshot taken before the burst began.
 */

const COALESCE_MS = 800;

export function createHistory(limit = 100, now = () => Date.now()) {
  let undoStack = [];
  let redoStack = [];
  let lastKey = null;
  let lastAt = 0;

  return {
    /** Call with the state *before* a change. */
    record(previous, coalesceKey = null) {
      const t = now();
      if (coalesceKey && coalesceKey === lastKey && t - lastAt < COALESCE_MS) {
        lastAt = t;
        return;
      }
      undoStack.push(previous);
      if (undoStack.length > limit) undoStack.shift();
      redoStack = [];
      lastKey = coalesceKey;
      lastAt = t;
    },
    undo(current) {
      const previous = undoStack.pop();
      if (previous === undefined) return null;
      redoStack.push(current);
      lastKey = null;
      return previous;
    },
    redo(current) {
      const next = redoStack.pop();
      if (next === undefined) return null;
      undoStack.push(current);
      lastKey = null;
      return next;
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    clear() {
      undoStack = [];
      redoStack = [];
      lastKey = null;
    },
  };
}
