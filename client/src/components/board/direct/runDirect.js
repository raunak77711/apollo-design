import { buildSceneOutline } from './sceneOutline.js';
import { resolveOperation } from './resolveOps.js';

/**
 * Apply what the model asked for, one operation at a time so each sees the
 * result of the one before (a resize, then a move relative to the resized
 * thing), and record the whole batch as a single undo step.
 */
export function applyAIOperations(editor, { operations, message }) {
  const before = editor.getState();
  let focus = null;
  let applied = 0;

  for (const op of operations) {
    const ctx = { boundsOf: editor.boundsOf, sections: editor.getScene().sections };
    for (const resolved of resolveOperation(op, ctx)) {
      if (resolved.type === 'FOCUS') {
        focus = resolved.targets?.[0] || null;
        continue;
      }
      if (editor.dispatch(resolved, { record: false })) applied += 1;
    }
  }

  const changed = editor.getState() !== before;
  if (changed) editor.recordUndoPoint(before);
  if (focus) editor.focusObject(focus);
  return { message, applied, changed };
}

export async function runDirect(editor, api, message) {
  const selection = editor.getSelection().map((s) => s.id);
  const outline = buildSceneOutline({ scene: editor.getScene(), state: editor.getState() });
  const reply = await api.edit({ message, outline, selection });
  return applyAIOperations(editor, reply);
}
