import { useMemo } from 'react';
import { useEditor } from './EditorContext.jsx';
import { newElementId } from '../design/operations.js';
import { arrangeOps, moveLayerOps } from '../design/layerOps.js';
import { childrenOf, indexById, topLevelOf } from '../design/tree.js';

/**
 * One implementation of every layer command, shared by the Layers panel, the
 * Properties inspector, the canvas context menu, the command palette and the
 * keyboard. Each command works on an explicit id list or, given none, on the
 * current selection — so "delete" means the same thing everywhere.
 */
export function useLayerActions() {
  const { state, actions } = useEditor();
  const elements = state.document.elements;
  const selectedIds = state.selectedIds;

  return useMemo(() => {
    const byId = indexById(elements);
    const resolve = (ids) => (ids && ids.length ? ids : selectedIds).filter((id) => byId.has(id));
    const roots = (ids) => topLevelOf(elements, resolve(ids));

    const setFlag = (ids, key, value) => {
      const list = resolve(ids);
      if (list.length === 0) return;
      const next = value ?? !list.every((id) => byId.get(id)?.[key]);
      actions.apply(list.map((id) => ({ type: 'UPDATE_ELEMENT', targetId: id, changes: { [key]: next } })));
    };

    return {
      rename: (id, name) => {
        const el = byId.get(id);
        const clean = String(name || '').trim();
        if (!el || clean === (el.name || '')) return;
        actions.apply([{ type: 'UPDATE_ELEMENT', targetId: id, changes: { name: clean } }]);
      },

      duplicate: (ids) => {
        const list = roots(ids);
        if (list.length === 0) return;
        const copies = list.map((id) => newElementId(byId.get(id)?.type || 'element'));
        actions.apply(
          list.map((id, i) => ({ type: 'DUPLICATE_ELEMENT', targetId: id, newId: copies[i] })),
          { selectIds: copies }
        );
      },

      remove: (ids) => {
        const list = roots(ids);
        if (list.length === 0) return;
        actions.apply(
          list.map((id) => ({ type: 'DELETE_ELEMENT', targetId: id })),
          { selectIds: [] }
        );
      },

      toggleHidden: (ids, value) => setFlag(ids, 'hidden', value),
      toggleLocked: (ids, value) => setFlag(ids, 'locked', value),

      arrange: (mode, ids) => {
        const ops = arrangeOps(elements, resolve(ids), mode);
        if (ops.length) actions.apply(ops);
      },

      /** Reparent + restack in one undoable step (layer drag and drop). */
      moveTo: (ids, parentId, index) => {
        const ops = moveLayerOps(elements, resolve(ids), parentId, index);
        if (ops.length) actions.apply(ops);
      },

      group: (ids) => {
        const list = roots(ids);
        if (list.length < 2) return;
        const groupId = newElementId('group');
        actions.apply([{ type: 'GROUP_ELEMENTS', targetIds: list, groupId }], {
          selectIds: [groupId],
          enteredId: null,
        });
      },

      ungroup: (ids) => {
        const list = resolve(ids).filter((id) => byId.get(id)?.type === 'group');
        if (list.length === 0) return;
        const freed = list.flatMap((id) => childrenOf(elements, id).map((child) => child.id));
        actions.apply(
          list.map((id) => ({ type: 'UNGROUP_ELEMENTS', targetId: id })),
          { selectIds: freed, enteredId: null }
        );
      },

      canGroup: (ids) => roots(ids).length > 1,
      canUngroup: (ids) => resolve(ids).some((id) => byId.get(id)?.type === 'group'),
    };
  }, [elements, selectedIds, actions]);
}
