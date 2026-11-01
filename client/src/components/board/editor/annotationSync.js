import { toRelative, toWorldY } from '../state/anchor.js';

/**
 * Annotation records ↔ Fabric objects.
 *
 * A record stores its `top` relative to its section (see state/anchor.js) and
 * any image as `asset:<id>`, so this file converts on the way in and out. An
 * object remembers the record it was made from (`__rec`); `reconcile` only
 * recreates objects whose record changed, which is what keeps a selection alive
 * through an edit that originated on the canvas itself.
 */

/** A cheap, stable id for an image's pixels — same image, same asset. */
function hashString(s) {
  let h = 5381;
  const head = s.slice(0, 4096);
  const tail = s.slice(-4096);
  for (const part of [head, tail, String(s.length)]) {
    for (let i = 0; i < part.length; i += 1) h = ((h << 5) + h + part.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export function recordFromObject(obj, sections) {
  const json = obj.toObject(['data']);
  const rel = toRelative(sections, json.top);
  json.top = rel.y;
  const assets = {};
  if (json.type === 'image' && typeof json.src === 'string' && json.src.startsWith('data:')) {
    const id = `img_${hashString(json.src)}`;
    assets[id] = json.src;
    json.src = `asset:${id}`;
  }
  return { record: { id: obj.data.id, section: rel.section, kind: obj.data.ann, json }, assets };
}

/** Make thin strokes and unfilled shapes hit-testable only where they are actually inked. */
export function applyTraits(obj) {
  const transparentFill = typeof obj.fill === 'string' && /rgba\([^)]*,\s*0(\.\d+)?\)|transparent/.test(obj.fill);
  obj.perPixelTargetFind = obj.type === 'path' || obj.type === 'lineArrow' || transparentFill;
}

export function createAnnotationSync(fabric, canvas, { onCreate } = {}) {
  const objects = new Map(); // annotation id → Fabric object
  const tokens = new Map(); //  annotation id → latest creation token (enlivening can be async)
  let counter = 0;

  function prepare(record, state, sections) {
    const json = { ...record.json, top: toWorldY(sections, record.section, record.json.top) };
    if (typeof json.src === 'string' && json.src.startsWith('asset:')) json.src = state.assets[json.src.slice(6)] || '';
    return json;
  }

  function create(record, state, sections) {
    counter += 1;
    const mine = counter;
    tokens.set(record.id, mine);
    fabric.util.enlivenObjects([prepare(record, state, sections)], ([obj]) => {
      if (!obj || tokens.get(record.id) !== mine) return;
      obj.__rec = record;
      obj.data = { ...(record.json.data || {}), kind: 'annotation', id: record.id };
      applyTraits(obj);
      onCreate?.(obj);
      canvas.add(obj);
      objects.set(record.id, obj);
      canvas.requestRenderAll();
    });
  }

  function remove(id) {
    counter += 1;
    tokens.set(id, counter); // cancels an in-flight creation
    const obj = objects.get(id);
    if (obj) canvas.remove(obj);
    objects.delete(id);
  }

  return {
    reconcile(state, sections) {
      const ids = new Set(state.annotations.map((a) => a.id));
      for (const id of [...objects.keys()]) if (!ids.has(id)) remove(id);
      for (const record of state.annotations) {
        const existing = objects.get(record.id);
        if (existing && existing.__rec === record) continue;
        if (existing) remove(record.id);
        create(record, state, sections);
      }
    },
    rebuildAll(state, sections) {
      for (const id of [...objects.keys()]) remove(id);
      for (const record of state.annotations) create(record, state, sections);
    },
    /** A tool made this object by hand; tie it to the record that describes it so reconcile leaves it alone. */
    adopt(obj, record) {
      obj.__rec = record;
      objects.set(record.id, obj);
    },
    objectOf: (id) => objects.get(id) || null,
    raiseAll() {
      objects.forEach((obj) => canvas.bringToFront(obj));
    },
    dispose() {
      for (const id of [...objects.keys()]) remove(id);
    },
  };
}
