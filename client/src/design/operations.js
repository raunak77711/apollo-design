/**
 * The Apollo operation system — MIRROR of server/src/design/operations.js.
 * Used by manual editing (via the reducer) AND to apply AI-returned operations,
 * so both paths flow through identical, validated logic.
 */

import { makeElement, sanitizeProperties, sanitizeShadow, ELEMENT_TYPES } from './schema.js';
import { boundsOf, childrenOf, descendantIds, normalizeTree, topLevelOf } from './tree.js';

export const OPERATION_TYPES = [
  'CREATE_ELEMENT', 'DELETE_ELEMENT', 'UPDATE_ELEMENT', 'MOVE_ELEMENT',
  'RESIZE_ELEMENT', 'DUPLICATE_ELEMENT', 'REORDER_ELEMENT', 'GROUP_ELEMENTS',
  'UNGROUP_ELEMENTS', 'SET_CONTENT', 'SET_STYLE', 'ADD_ICON', 'SET_CANVAS',
];

// Element-level keys (as opposed to nested `properties`): geometry plus the
// layer state the Layers panel and Properties inspector write.
const GEOMETRY_KEYS = new Set([
  'x', 'y', 'width', 'height', 'rotation', 'opacity', 'zIndex',
  'hidden', 'locked', 'name', 'parentId',
  'flipH', 'flipV', 'lockAspect', 'blendMode', 'layerBlur', 'shadow',
]);

let idCounter = 0;
const genId = (type) => `${type}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Ids can be minted up front so a caller can select what it is about to create. */
export const newElementId = (type = 'element') => genId(type);

function splitChanges(changes = {}) {
  const geometry = {};
  const properties = {};
  for (const [k, v] of Object.entries(changes)) {
    if (GEOMETRY_KEYS.has(k)) geometry[k] = v;
    else properties[k] = v;
  }
  if (geometry.shadow !== undefined) geometry.shadow = sanitizeShadow(geometry.shadow);
  if (geometry.name !== undefined) geometry.name = String(geometry.name).slice(0, 80);
  return { geometry, properties };
}

const findIndex = (doc, id) => doc.elements.findIndex((e) => e.id === id);
const byZ = (a, b) => (a.zIndex || 0) - (b.zIndex || 0);

export function validateOperation(op) {
  if (!op || typeof op !== 'object') return { ok: false, error: 'operation is not an object' };
  if (!OPERATION_TYPES.includes(op.type)) return { ok: false, error: `unknown operation: ${op.type}` };
  switch (op.type) {
    case 'CREATE_ELEMENT':
      if (!op.element || !ELEMENT_TYPES.includes(op.element.type)) return { ok: false, error: 'CREATE_ELEMENT requires element.type' };
      break;
    case 'ADD_ICON':
      if (!op.name) return { ok: false, error: 'ADD_ICON requires name' };
      break;
    case 'GROUP_ELEMENTS':
      if (!Array.isArray(op.targetIds) || op.targetIds.length < 2) return { ok: false, error: 'GROUP_ELEMENTS requires two or more targetIds' };
      break;
    case 'DELETE_ELEMENT':
    case 'DUPLICATE_ELEMENT':
    case 'UPDATE_ELEMENT':
    case 'MOVE_ELEMENT':
    case 'RESIZE_ELEMENT':
    case 'REORDER_ELEMENT':
    case 'SET_CONTENT':
    case 'SET_STYLE':
    case 'UNGROUP_ELEMENTS':
      if (!op.targetId) return { ok: false, error: `${op.type} requires targetId` };
      break;
    default:
      break;
  }
  return { ok: true };
}

export function applyOperation(doc, op) {
  const { ok, error } = validateOperation(op);
  if (!ok) throw new Error(error);
  const elements = doc.elements.slice();
  const topZ = (list) => (list.length ? Math.max(...list.map((e) => e.zIndex || 0)) : 0);

  switch (op.type) {
    case 'SET_CANVAS':
      return { ...doc, canvas: { ...doc.canvas, ...op.changes } };

    case 'CREATE_ELEMENT': {
      const el = makeElement(op.element.type, { ...op.element, id: op.element.id || genId(op.element.type) }, () => genId(op.element.type));
      if (el.zIndex == null || el.zIndex === 1) {
        el.zIndex = topZ(childrenOf(elements, el.parentId || null)) + 1;
      }
      // A group may be created around existing layers (the AI does this);
      // adopting them here keeps `parentId` the only thing that nests.
      if (el.type === 'group' && Array.isArray(op.element.children) && op.element.children.length) {
        const adopted = new Set(op.element.children);
        for (let i = 0; i < elements.length; i += 1) {
          if (adopted.has(elements[i].id)) elements[i] = { ...elements[i], parentId: el.id };
        }
      }
      elements.push(el);
      return { ...doc, elements };
    }

    case 'ADD_ICON': {
      const el = makeElement('icon', {
        id: genId('icon'), x: op.x ?? 40, y: op.y ?? 40, width: op.size ?? 48, height: op.size ?? 48,
        name: op.name, color: op.color, size: op.size ?? 48,
        zIndex: topZ(childrenOf(elements, null)) + 1,
      });
      elements.push(el);
      return { ...doc, elements };
    }

    // Deleting a group takes everything inside it with it.
    case 'DELETE_ELEMENT': {
      const doomed = new Set([op.targetId, ...descendantIds(elements, op.targetId)]);
      return { ...doc, elements: elements.filter((e) => !doomed.has(e.id)) };
    }

    // A duplicate is a whole subtree, re-identified and dropped in just above
    // the original rather than on top of the document.
    case 'DUPLICATE_ELEMENT': {
      const src = elements.find((e) => e.id === op.targetId);
      if (!src) return doc;
      const subtree = [src, ...descendantIds(elements, src.id).map((id) => elements.find((e) => e.id === id))].filter(Boolean);
      const ids = new Map(subtree.map((el) => [el.id, genId(el.type)]));
      if (op.newId) ids.set(src.id, op.newId);
      const offset = op.offset ?? 24;

      const copies = subtree.map((el) => {
        const copy = JSON.parse(JSON.stringify(el));
        copy.id = ids.get(el.id);
        copy.x += offset;
        copy.y += offset;
        if (el.parentId && ids.has(el.parentId)) copy.parentId = ids.get(el.parentId);
        if (Array.isArray(copy.children)) copy.children = copy.children.map((c) => ids.get(c) || c);
        return copy;
      });
      copies[0].zIndex = (src.zIndex || 0) + 0.5;
      return { ...doc, elements: [...elements, ...copies] };
    }

    case 'UPDATE_ELEMENT':
    case 'MOVE_ELEMENT':
    case 'RESIZE_ELEMENT':
    case 'SET_CONTENT':
    case 'SET_STYLE': {
      const idx = findIndex(doc, op.targetId);
      if (idx === -1) return doc;
      const current = elements[idx];
      const { geometry, properties } = splitChanges(op.changes || {});
      // Moving or resizing a group carries its contents with it.
      if (current.type === 'group') transformSubtree(elements, current, geometry);
      const nextProps = sanitizeProperties(current.type, { ...current.properties, ...properties });
      elements[idx] = { ...current, ...geometry, properties: nextProps };
      if (geometry.parentId === null) delete elements[idx].parentId;
      return { ...doc, elements };
    }

    /**
     * Stacking is per sibling row. `direction` steps or jumps within the row,
     * `index`/`zIndex` place explicitly, and `parentId` re-nests — which is what
     * dragging a layer in the panel sends.
     */
    case 'REORDER_ELEMENT': {
      const idx = findIndex(doc, op.targetId);
      if (idx === -1) return doc;
      const current = { ...elements[idx] };

      if (op.parentId !== undefined) {
        const blocked = new Set([current.id, ...descendantIds(elements, current.id)]);
        const parent = op.parentId ? elements.find((e) => e.id === op.parentId) : null;
        if (!op.parentId) delete current.parentId;
        else if (parent && parent.type === 'group' && !blocked.has(parent.id)) current.parentId = parent.id;
      }

      const siblings = elements.filter((e) => e.id !== current.id && (e.parentId || null) === (current.parentId || null)).sort(byZ);
      if (op.zIndex != null) {
        current.zIndex = op.zIndex;
      } else if (op.index != null) {
        const before = siblings[op.index - 1];
        const after = siblings[op.index];
        current.zIndex = before && after ? (before.zIndex + after.zIndex) / 2
          : after ? after.zIndex - 0.5
          : before ? before.zIndex + 0.5
          : 1;
      } else if (op.direction === 'front') {
        current.zIndex = (siblings.length ? siblings[siblings.length - 1].zIndex : 0) + 1;
      } else if (op.direction === 'back') {
        current.zIndex = (siblings.length ? siblings[0].zIndex : 2) - 1;
      } else if (op.direction === 'forward') {
        const next = siblings.find((e) => (e.zIndex || 0) > (current.zIndex || 0));
        if (!next) return doc;
        current.zIndex = next.zIndex + 0.5;
      } else if (op.direction === 'backward') {
        const previous = [...siblings].reverse().find((e) => (e.zIndex || 0) < (current.zIndex || 0));
        if (!previous) return doc;
        current.zIndex = previous.zIndex - 0.5;
      }

      elements[idx] = current;
      return { ...doc, elements };
    }

    /** Members become children of a new group that sits in the front-most one's slot. */
    case 'GROUP_ELEMENTS': {
      const wanted = topLevelOf(elements, (op.targetIds || []).filter((id) => elements.some((e) => e.id === id)));
      const members = elements.filter((e) => wanted.includes(e.id));
      if (members.length < 2) return doc;

      const front = members.reduce((a, b) => ((b.zIndex || 0) > (a.zIndex || 0) ? b : a));
      const parentId = front.parentId || null;
      const box = boundsOf(members);
      const group = makeElement('group', {
        id: op.groupId || genId('group'),
        name: op.name,
        x: box.x, y: box.y, width: box.width, height: box.height,
        zIndex: (front.zIndex || 0) + 0.5,
        parentId,
        children: members.map((m) => m.id),
      });

      const ids = new Set(members.map((m) => m.id));
      const next = elements.map((el) => (ids.has(el.id) ? { ...el, parentId: group.id } : el));
      return { ...doc, elements: [...next, group] };
    }

    /** Children take the group's place in the row, keeping their own order. */
    case 'UNGROUP_ELEMENTS': {
      const group = elements.find((e) => e.id === op.targetId);
      if (!group || group.type !== 'group') return doc;
      const kids = childrenOf(elements, group.id);
      const base = group.zIndex || 0;

      const next = elements.map((el) => {
        if (el.parentId !== group.id) return el;
        const slot = kids.findIndex((k) => k.id === el.id);
        const copy = { ...el, zIndex: base + (slot + 1) / (kids.length + 1) };
        if (group.parentId) copy.parentId = group.parentId;
        else delete copy.parentId;
        return copy;
      });
      return { ...doc, elements: next.filter((el) => el.id !== group.id) };
    }

    default:
      return doc;
  }
}

/** Translate/scale every descendant with its group, about the group's origin. */
function transformSubtree(elements, group, geometry) {
  const dx = geometry.x != null ? geometry.x - group.x : 0;
  const dy = geometry.y != null ? geometry.y - group.y : 0;
  const sx = geometry.width != null && group.width ? geometry.width / group.width : 1;
  const sy = geometry.height != null && group.height ? geometry.height / group.height : 1;
  if (!dx && !dy && sx === 1 && sy === 1) return;

  const ids = new Set(descendantIds(elements, group.id));
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    if (!ids.has(el.id)) continue;
    elements[i] = {
      ...el,
      x: Math.round(group.x + (el.x - group.x) * sx + dx),
      y: Math.round(group.y + (el.y - group.y) * sy + dy),
      width: Math.max(1, Math.round(el.width * sx)),
      height: Math.max(1, Math.round(el.height * sy)),
    };
  }
}

export function applyOperations(doc, operations = []) {
  let next = doc;
  const applied = [];
  const skipped = [];
  for (const op of operations) {
    const check = validateOperation(op);
    if (!check.ok) { skipped.push({ op, reason: check.error }); continue; }
    try {
      next = applyOperation(next, op);
      applied.push(op);
    } catch (err) {
      skipped.push({ op, reason: err.message });
    }
  }
  // One repair pass per batch: re-derive the tree, renumber siblings and refit
  // every group, so no operation has to think about the whole document.
  return { document: normalizeTree(next), applied, skipped };
}
