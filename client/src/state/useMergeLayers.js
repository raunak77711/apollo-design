import { useCallback, useState } from 'react';
import { useEditor } from './EditorContext.jsx';
import { api } from '../api/client.js';
import { newElementId } from '../design/operations.js';
import { boundsOf, expandWithDescendants, indexById } from '../design/tree.js';

/**
 * Merge down / merge visible / flatten. There is no pixel canvas to paint
 * into — instead the target layers are re-based onto a small transparent
 * canvas, rasterized once on the server (the same SVG→Sharp pipeline export
 * uses), and swapped back in as a single new image layer at the original
 * position. One network round trip, one undoable operation.
 */
export function useMergeLayers() {
  const { state, actions } = useEditor();
  const [busy, setBusy] = useState(false);

  const merge = useCallback(
    async (rootIds) => {
      const elements = state.document.elements;
      const byId = indexById(elements);
      const roots = [...new Set(rootIds)].filter((id) => byId.has(id));
      if (roots.length < 2) return;

      const included = expandWithDescendants(elements, roots)
        .map((id) => byId.get(id))
        .filter(Boolean);
      const box = boundsOf(included);
      if (!box || box.width < 1 || box.height < 1) return;

      setBusy(true);
      try {
        const { dataUrl } = await api.flattenLayers({
          version: 1,
          type: 'design',
          canvas: { width: Math.round(box.width), height: Math.round(box.height), background: 'transparent' },
          elements: included.map((el) => ({ ...el, x: el.x - box.x, y: el.y - box.y })),
        });

        const zIndex = Math.max(...roots.map((id) => byId.get(id).zIndex || 0));
        const newId = newElementId('image');
        actions.apply(
          [
            ...roots.map((id) => ({ type: 'DELETE_ELEMENT', targetId: id })),
            {
              type: 'CREATE_ELEMENT',
              element: {
                id: newId,
                type: 'image',
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.round(box.height),
                zIndex,
                properties: { src: dataUrl, fit: 'fill' },
              },
            },
          ],
          { selectIds: [newId] }
        );
      } finally {
        setBusy(false);
      }
    },
    [state.document.elements, actions]
  );

  /** The selected layer plus whichever top-level sibling sits directly below it. */
  const mergeDown = useCallback(
    (selectedIds) => {
      const elements = state.document.elements;
      const byId = indexById(elements);
      const id = selectedIds[0];
      const el = id && byId.get(id);
      if (!el) return;
      const siblings = elements
        .filter((e) => (e.parentId || null) === (el.parentId || null))
        .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
      const at = siblings.findIndex((e) => e.id === id);
      const below = siblings[at + 1];
      if (!below) return;
      merge([id, below.id]);
    },
    [state.document.elements, merge]
  );

  /** Every visible top-level layer, collapsed into one — hidden layers are untouched. */
  const mergeVisible = useCallback(() => {
    const visible = state.document.elements.filter((el) => !el.parentId && !el.hidden).map((el) => el.id);
    merge(visible);
  }, [state.document.elements, merge]);

  /** Everything visible, collapsed into one — hidden layers are discarded, matching "Flatten Image". */
  const flatten = useCallback(async () => {
    const elements = state.document.elements;
    const visible = elements.filter((el) => !el.parentId && !el.hidden).map((el) => el.id);
    const hidden = elements.filter((el) => !el.parentId && el.hidden).map((el) => el.id);
    if (visible.length < 2) return;
    await merge(visible);
    if (hidden.length) actions.apply(hidden.map((id) => ({ type: 'DELETE_ELEMENT', targetId: id })));
  }, [state.document.elements, merge, actions]);

  const canMergeVisible = () => state.document.elements.filter((el) => !el.parentId && !el.hidden).length > 1;

  return { merge, mergeDown, mergeVisible, flatten, canMergeVisible, busy };
}
