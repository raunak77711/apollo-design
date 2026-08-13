/**
 * The Apollo operation system — the single, shared way any actor (a human
 * dragging on the canvas, or the AI) mutates a design document.
 *
 * Pure & dependency-free so client/src/design/operations.js can mirror it.
 * Every operation is validated, then applied immutably (returns a new doc).
 */

import { makeElement, sanitizeProperties, ELEMENT_TYPES } from './schema.js';

export const OPERATION_TYPES = [
  'CREATE_ELEMENT',
  'DELETE_ELEMENT',
  'UPDATE_ELEMENT',
  'MOVE_ELEMENT',
  'RESIZE_ELEMENT',
  'DUPLICATE_ELEMENT',
  'REORDER_ELEMENT',
  'GROUP_ELEMENTS',
  'UNGROUP_ELEMENTS',
  'SET_CONTENT',
  'SET_STYLE',
  'ADD_ICON',
  'SET_CANVAS',
];

// Geometry/element-level keys live on the element; everything else is a
// `properties` key. `hidden` is a layer-visibility flag.
const GEOMETRY_KEYS = new Set(['x', 'y', 'width', 'height', 'rotation', 'opacity', 'zIndex', 'hidden']);

let idCounter = 0;
const genId = (type) => `${type}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Split a flat `changes` bag into geometry-level and properties-level updates. */
function splitChanges(changes = {}) {
  const geometry = {};
  const properties = {};
  for (const [k, v] of Object.entries(changes)) {
    if (GEOMETRY_KEYS.has(k)) geometry[k] = v;
    else properties[k] = v;
  }
  return { geometry, properties };
}

function findIndex(doc, id) {
  return doc.elements.findIndex((e) => e.id === id);
}

/** Validate a single operation. Returns { ok, error }. */
export function validateOperation(op) {
  if (!op || typeof op !== 'object') return { ok: false, error: 'operation is not an object' };
  if (!OPERATION_TYPES.includes(op.type)) return { ok: false, error: `unknown operation: ${op.type}` };

  switch (op.type) {
    case 'CREATE_ELEMENT':
      if (!op.element || !ELEMENT_TYPES.includes(op.element.type)) {
        return { ok: false, error: 'CREATE_ELEMENT requires element.type' };
      }
      break;
    case 'ADD_ICON':
      if (!op.name) return { ok: false, error: 'ADD_ICON requires name' };
      break;
    case 'DELETE_ELEMENT':
    case 'DUPLICATE_ELEMENT':
    case 'UPDATE_ELEMENT':
    case 'MOVE_ELEMENT':
    case 'RESIZE_ELEMENT':
    case 'REORDER_ELEMENT':
    case 'SET_CONTENT':
    case 'SET_STYLE':
      if (!op.targetId) return { ok: false, error: `${op.type} requires targetId` };
      break;
    default:
      break;
  }
  return { ok: true };
}

/** Apply one operation immutably. Unknown/invalid ops throw. */
export function applyOperation(doc, op) {
  const { ok, error } = validateOperation(op);
  if (!ok) throw new Error(error);

  const elements = doc.elements.slice();

  switch (op.type) {
    case 'SET_CANVAS':
      return { ...doc, canvas: { ...doc.canvas, ...op.changes } };

    case 'CREATE_ELEMENT': {
      const el = makeElement(op.element.type, { ...op.element, id: op.element.id || genId(op.element.type) }, () =>
        genId(op.element.type)
      );
      if (el.zIndex == null || el.zIndex === 1) {
        el.zIndex = elements.length ? Math.max(...elements.map((e) => e.zIndex || 0)) + 1 : 1;
      }
      elements.push(el);
      return { ...doc, elements };
    }

    case 'ADD_ICON': {
      const el = makeElement('icon', {
        id: genId('icon'),
        x: op.x ?? 40,
        y: op.y ?? 40,
        width: op.size ?? 48,
        height: op.size ?? 48,
        name: op.name,
        color: op.color,
        size: op.size ?? 48,
        zIndex: elements.length ? Math.max(...elements.map((e) => e.zIndex || 0)) + 1 : 1,
      });
      elements.push(el);
      return { ...doc, elements };
    }

    case 'DELETE_ELEMENT': {
      return { ...doc, elements: elements.filter((e) => e.id !== op.targetId) };
    }

    case 'DUPLICATE_ELEMENT': {
      const src = elements.find((e) => e.id === op.targetId);
      if (!src) return doc;
      const copy = {
        ...structuredCloneSafe(src),
        id: genId(src.type),
        x: src.x + 24,
        y: src.y + 24,
        zIndex: Math.max(...elements.map((e) => e.zIndex || 0)) + 1,
      };
      elements.push(copy);
      return { ...doc, elements };
    }

    case 'UPDATE_ELEMENT':
    case 'MOVE_ELEMENT':
    case 'RESIZE_ELEMENT':
    case 'SET_CONTENT':
    case 'SET_STYLE': {
      const idx = findIndex(doc, op.targetId);
      if (idx === -1) return doc;
      const current = elements[idx];
      const changes = op.changes || {};
      const { geometry, properties } = splitChanges(changes);
      const nextProps = sanitizeProperties(current.type, { ...current.properties, ...properties });
      elements[idx] = { ...current, ...geometry, properties: nextProps };
      return { ...doc, elements };
    }

    case 'REORDER_ELEMENT': {
      const idx = findIndex(doc, op.targetId);
      if (idx === -1) return doc;
      const current = { ...elements[idx] };
      if (op.zIndex != null) current.zIndex = op.zIndex;
      else if (op.direction === 'front') current.zIndex = Math.max(...elements.map((e) => e.zIndex || 0)) + 1;
      else if (op.direction === 'back') current.zIndex = Math.min(...elements.map((e) => e.zIndex || 0)) - 1;
      elements[idx] = current;
      return { ...doc, elements };
    }

    case 'GROUP_ELEMENTS': {
      const ids = op.targetIds || [];
      const children = elements.filter((e) => ids.includes(e.id));
      if (children.length < 2) return doc;
      const group = makeElement('group', {
        id: genId('group'),
        x: Math.min(...children.map((c) => c.x)),
        y: Math.min(...children.map((c) => c.y)),
        width: Math.max(...children.map((c) => c.x + c.width)) - Math.min(...children.map((c) => c.x)),
        height: Math.max(...children.map((c) => c.y + c.height)) - Math.min(...children.map((c) => c.y)),
        zIndex: Math.max(...children.map((c) => c.zIndex || 0)),
        children: ids,
      });
      return { ...doc, elements: [...elements, group] };
    }

    case 'UNGROUP_ELEMENTS': {
      return { ...doc, elements: elements.filter((e) => e.id !== op.targetId) };
    }

    default:
      return doc;
  }
}

/** Apply a list of operations, skipping invalid ones. Returns { document, applied, skipped }. */
export function applyOperations(doc, operations = []) {
  let next = doc;
  const applied = [];
  const skipped = [];
  for (const op of operations) {
    const check = validateOperation(op);
    if (!check.ok) {
      skipped.push({ op, reason: check.error });
      continue;
    }
    try {
      next = applyOperation(next, op);
      applied.push(op);
    } catch (err) {
      skipped.push({ op, reason: err.message });
    }
  }
  return { document: next, applied, skipped };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}
