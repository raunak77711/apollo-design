import { normalizeBlock } from './schema.js';
import { isAnnotationId, newAnnotationId } from './ids.js';
import { styleToFabric } from './styleMap.js';
import { arrowRecord, shapeRecord, textRecord } from './annotations.js';

/**
 * The board's state and the only function that changes it.
 *
 *   spec         what DeepSeek said should exist (sections → blocks)
 *   overrides    what the user changed on the presentation, keyed by piece or
 *                block id: { dx, dy, scaleX, scaleY, angle, w, text, style, deleted }
 *   annotations  what the user drew or added: { id, section, kind, json }
 *   connections  arrows the user (or Direct mode) tied between two pieces
 *   assets       image data by id, so annotations and history snapshots stay small
 *   view         { zoom, x, y } | null
 *
 * State is immutable data. `applyOperation` returns a new object when anything
 * changed and *the same object* when nothing did, so callers can tell.
 * Fabric only ever renders this; a gesture on the canvas becomes an operation
 * here first.
 */

export const INTERNAL_OP_TYPES = [
  'OVERRIDE_SET', 'ANNOTATION_ADD', 'ANNOTATION_UPDATE', 'ANNOTATION_REMOVE',
  'ANNOTATIONS_CLEAR', 'OVERRIDES_RESET', 'SECTION_REPLACE', 'VIEW_SET',
];

/** Camera moves are not board edits: they are neither undoable nor worth a history entry. */
export const isViewOp = (op) => op.type === 'VIEW_SET' || op.type === 'SET_VIEW' || op.type === 'FOCUS';

export function createBoardState({ spec, brief = '' }) {
  return { spec, brief, overrides: {}, annotations: [], connections: [], assets: {}, view: null };
}

const targetsOf = (op) => (Array.isArray(op.targets) ? op.targets : op.target ? [op.target] : []);

const setOverride = (state, id, patch) => ({
  ...state,
  overrides: { ...state.overrides, [id]: { ...(state.overrides[id] || {}), ...patch } },
});

function mapAnnotation(state, id, fn) {
  let hit = false;
  const annotations = state.annotations.map((a) => {
    if (a.id !== id) return a;
    hit = true;
    return fn(a);
  });
  return hit ? { ...state, annotations } : state;
}

const withAssets = (state, assets) =>
  assets && Object.keys(assets).length ? { ...state, assets: { ...state.assets, ...assets } } : state;

const sectionIndex = (state, id) => state.spec.sections.findIndex((s) => s.id === id);

const replaceSectionAt = (state, index, section) => ({
  ...state,
  spec: { ...state.spec, sections: state.spec.sections.map((s, i) => (i === index ? section : s)) },
});

/** Block ids are stable once assigned, so a block inserted later takes max + 1, never a reused number. */
export function nextBlockId(section) {
  const max = section.blocks.reduce((m, b) => Math.max(m, Number(b.id.split('.b')[1]) || 0), 0);
  return `${section.id}.b${max + 1}`;
}

/** Forget overrides and connections under an id prefix ('s3.b2' or 's3'): the things they described are gone. */
function dropUnder(state, prefix) {
  const under = (id) => id.startsWith(`${prefix}.`);
  const overrides = {};
  for (const [id, ov] of Object.entries(state.overrides)) if (!under(id)) overrides[id] = ov;
  return {
    ...state,
    overrides,
    connections: state.connections.filter((c) => !under(c.from) && !under(c.to)),
  };
}

function placeOf(state, op) {
  const first = state.spec.sections[0]?.id;
  const section = op.section && sectionIndex(state, op.section) >= 0 ? op.section : first;
  return { section, x: typeof op.x === 'number' ? op.x : 700, y: typeof op.y === 'number' ? op.y : 300 };
}

const addAnnotation = (state, record) => ({ ...state, annotations: [...state.annotations, record] });

export function applyOperation(state, op) {
  switch (op.type) {
    case 'SET_TEXT': {
      const [id] = targetsOf(op);
      if (!id || typeof op.text !== 'string') return state;
      return isAnnotationId(id)
        ? mapAnnotation(state, id, (a) => ({ ...a, json: { ...a.json, text: op.text } }))
        : setOverride(state, id, { text: op.text });
    }

    case 'SET_STYLE':
      return targetsOf(op).reduce((s, id) => (isAnnotationId(id)
        ? mapAnnotation(s, id, (a) => ({ ...a, json: { ...a.json, ...styleToFabric(op.changes, a.kind) } }))
        : setOverride(s, id, { style: { ...(s.overrides[id]?.style || {}), ...op.changes } })), state);

    case 'MOVE': {
      if (typeof op.dx !== 'number' || typeof op.dy !== 'number') return state;
      return targetsOf(op).reduce((s, id) => (isAnnotationId(id)
        ? mapAnnotation(s, id, (a) => ({ ...a, json: { ...a.json, left: a.json.left + op.dx, top: a.json.top + op.dy } }))
        : setOverride(s, id, { dx: (s.overrides[id]?.dx || 0) + op.dx, dy: (s.overrides[id]?.dy || 0) + op.dy })), state);
    }

    case 'RESIZE': {
      const sx = op.scaleX ?? op.scale;
      const sy = op.scaleY ?? op.scale;
      if (typeof sx !== 'number' || typeof sy !== 'number') return state;
      return targetsOf(op).reduce((s, id) => (isAnnotationId(id)
        ? mapAnnotation(s, id, (a) => (a.json.type === 'lineArrow'
          ? a
          : { ...a, json: { ...a.json, scaleX: (a.json.scaleX ?? 1) * sx, scaleY: (a.json.scaleY ?? 1) * sy } }))
        : setOverride(s, id, { scaleX: (s.overrides[id]?.scaleX ?? 1) * sx, scaleY: (s.overrides[id]?.scaleY ?? 1) * sy })), state);
    }

    case 'ROTATE':
      if (typeof op.angle !== 'number') return state;
      return targetsOf(op).reduce((s, id) => (isAnnotationId(id)
        ? mapAnnotation(s, id, (a) => (a.json.type === 'lineArrow' ? a : { ...a, json: { ...a.json, angle: op.angle } }))
        : setOverride(s, id, { angle: op.angle })), state);

    case 'DELETE':
      return targetsOf(op).reduce((s, id) => (isAnnotationId(id)
        ? { ...s, annotations: s.annotations.filter((a) => a.id !== id) }
        : setOverride(s, id, { deleted: true })), state);

    case 'RESTORE':
      return targetsOf(op).reduce((s, id) => {
        const ov = s.overrides[id];
        if (!ov || !ov.deleted) return s;
        const { deleted, ...rest } = ov;
        const overrides = { ...s.overrides };
        if (Object.keys(rest).length) overrides[id] = rest;
        else delete overrides[id];
        return { ...s, overrides };
      }, state);

    case 'INSERT_BLOCK': {
      const si = sectionIndex(state, op.section);
      const block = normalizeBlock(op.block);
      if (si < 0 || !block) return state;
      const section = state.spec.sections[si];
      const blocks = section.blocks.slice();
      const at = Math.min(Math.max(Number.isInteger(op.index) ? op.index : blocks.length, 0), blocks.length);
      blocks.splice(at, 0, { ...block, id: nextBlockId(section) });
      return replaceSectionAt(state, si, { ...section, blocks });
    }

    case 'REPLACE_BLOCK': {
      const [target] = targetsOf(op);
      const block = normalizeBlock(op.block);
      const si = state.spec.sections.findIndex((s) => s.blocks.some((b) => b.id === target));
      if (si < 0 || !block) return state;
      const section = state.spec.sections[si];
      const blocks = section.blocks.map((b) => (b.id === target ? { ...block, id: target } : b));
      return dropUnder(replaceSectionAt(state, si, { ...section, blocks }), target);
    }

    case 'SECTION_REPLACE': {
      const current = state.spec.sections[op.index];
      if (!current || !op.section) return state;
      return dropUnder(replaceSectionAt(state, op.index, { ...op.section, id: current.id }), current.id);
    }

    case 'CONNECT': {
      const id = `c_${op.from}__${op.to}`;
      if (state.connections.some((c) => c.id === id)) return state;
      return {
        ...state,
        connections: [...state.connections, { id, from: op.from, to: op.to, tone: op.tone || 'ink', dashed: Boolean(op.dashed) }],
      };
    }

    case 'DISCONNECT': {
      const connections = state.connections.filter((c) => !(c.from === op.from && c.to === op.to));
      return connections.length === state.connections.length ? state : { ...state, connections };
    }

    case 'ADD_TEXT': {
      if (typeof op.text !== 'string' || !op.text) return state;
      return addAnnotation(state, textRecord({ id: newAnnotationId(), ...placeOf(state, op), text: op.text, style: op.style }));
    }

    case 'ADD_SHAPE':
      if (op.shape !== 'rectangle' && op.shape !== 'circle') return state;
      return addAnnotation(state, shapeRecord({
        id: newAnnotationId(), ...placeOf(state, op), shape: op.shape, width: op.width, height: op.height, style: op.style,
      }));

    case 'ADD_ARROW': {
      if (!['x1', 'y1', 'x2', 'y2'].every((k) => typeof op[k] === 'number')) return state;
      const { section } = placeOf(state, op);
      return addAnnotation(state, arrowRecord({
        id: newAnnotationId(), section, x1: op.x1, y1: op.y1, x2: op.x2, y2: op.y2, tone: op.tone, dashed: op.dashed,
      }));
    }

    case 'OVERRIDE_SET':
      return op.id && op.patch ? setOverride(state, op.id, op.patch) : state;

    case 'OVERRIDES_RESET':
      return Object.keys(state.overrides).length ? { ...state, overrides: {} } : state;

    case 'ANNOTATION_ADD':
      return withAssets({ ...state, annotations: [...state.annotations, op.record] }, op.assets);

    case 'ANNOTATION_UPDATE': {
      const exists = state.annotations.some((a) => a.id === op.record.id);
      const annotations = exists
        ? state.annotations.map((a) => (a.id === op.record.id ? op.record : a))
        : [...state.annotations, op.record];
      return withAssets({ ...state, annotations }, op.assets);
    }

    case 'ANNOTATION_REMOVE':
      return { ...state, annotations: state.annotations.filter((a) => !op.ids.includes(a.id)) };

    case 'ANNOTATIONS_CLEAR':
      return state.annotations.length || state.connections.length || Object.keys(state.assets).length
        ? { ...state, annotations: [], connections: [], assets: {} }
        : state;

    case 'VIEW_SET':
    case 'SET_VIEW':
      return { ...state, view: { zoom: op.zoom, x: op.x, y: op.y } };

    default:
      // FOCUS, and anything unknown: not a state change (FOCUS moves the camera in the UI).
      return state;
  }
}
