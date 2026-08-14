/**
 * Stacking and selection maths for the layer tree. Pure and free of React, so
 * the panel, the canvas and the keyboard can all reach the same answers — and
 * every reorder comes back as operations, sharing the canvas's validation and
 * its undo history.
 */

import { ancestorIds, childrenOf, descendantIds, topLevelOf } from './tree.js';

const byZ = (a, b) => (a.zIndex || 0) - (b.zIndex || 0);

/**
 * Move layers within their own sibling row. Order matters: each operation is
 * applied to the document the previous one produced, so the batch is walked
 * from whichever end keeps the selection's relative order intact.
 */
export function arrangeOps(elements, ids, mode) {
  const roots = new Set(topLevelOf(elements, ids));
  const moving = elements.filter((el) => roots.has(el.id)).sort(byZ);
  if (moving.length === 0) return [];
  const order = mode === 'front' || mode === 'backward' ? moving : [...moving].reverse();
  return order.map((el) => ({ type: 'REORDER_ELEMENT', targetId: el.id, direction: mode }));
}

/**
 * Drop layers into `parentId` at `index` — an index into that row with the
 * moved layers already taken out, which is what the panel measures. Fractional
 * z-indexes slot them between neighbours; normalisation renumbers afterwards.
 */
export function moveLayerOps(elements, ids, parentId, index) {
  const blocked = new Set(parentId ? [parentId, ...ancestorIds(elements, parentId)] : []);
  const roots = new Set(topLevelOf(elements, ids));
  const moving = elements
    .filter((el) => roots.has(el.id))
    .filter((el) => !blocked.has(el.id) && !descendantIds(elements, el.id).some((id) => blocked.has(id)))
    .sort(byZ);
  if (moving.length === 0) return [];

  const movingIds = new Set(moving.map((el) => el.id));
  const siblings = childrenOf(elements, parentId).filter((el) => !movingIds.has(el.id));
  const at = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[at - 1];
  const after = siblings[at];
  const lo = before ? before.zIndex : after ? after.zIndex - 1 : 0;
  const hi = after ? after.zIndex : before ? before.zIndex + 1 : 2;
  const step = (hi - lo) / (moving.length + 1);

  return moving.map((el, i) => ({
    type: 'REORDER_ELEMENT',
    targetId: el.id,
    parentId: parentId || null,
    zIndex: lo + step * (i + 1),
  }));
}

/**
 * Clicking the canvas selects the outermost group a layer belongs to — unless
 * the user has already stepped inside a group by double-clicking, in which case
 * selection resolves one level below that.
 */
export function selectionTargetId(elements, el, enteredId) {
  const chain = ancestorIds(elements, el.id);
  if (chain.length === 0) return el.id;
  const inside = enteredId ? chain.indexOf(enteredId) : -1;
  if (inside === -1) return chain[chain.length - 1];
  return inside === 0 ? el.id : chain[inside - 1];
}
