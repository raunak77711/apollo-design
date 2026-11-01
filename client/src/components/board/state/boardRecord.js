import { LIMITS, normalizeBlock, normalizeSection } from './schema.js';
import { createBoardState, nextBlockId } from './boardState.js';

/**
 * A board as it is stored and as it is exported.
 *
 * Records come from IndexedDB, from a file the user chose, or from the bundled
 * example — the last two are untrusted, so both go through `sanitizeSpec` and
 * the field filters in `parseBoardFile`. Nothing in a record is ever executed:
 * the board draws text onto a canvas, it does not render HTML.
 */

export const BOARD_FILE_FORMAT = 'apollo-board';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const OVERRIDE_NUMBERS = ['dx', 'dy', 'scaleX', 'scaleY', 'angle', 'w'];

/**
 * A spec from an untrusted source → a clean spec, or null. Unlike
 * `normalizeBoard` this keeps block ids that are already valid and unique, so a
 * board that had blocks inserted keeps its overrides attached to the right ones.
 */
export function sanitizeSpec(raw) {
  if (!isObj(raw) || !Array.isArray(raw.sections)) return null;

  const cleaned = raw.sections.slice(0, LIMITS.sections).map((rs) => {
    const blocks = [];
    for (const rb of Array.isArray(rs?.blocks) ? rs.blocks : []) {
      if (blocks.length >= LIMITS.blocks) break;
      const block = normalizeBlock(rb);
      if (block) blocks.push({ block, wanted: isObj(rb) && typeof rb.id === 'string' ? rb.id : '' });
    }
    return { rs, blocks };
  }).filter((s) => s.blocks.length > 0);
  if (!cleaned.length) return null;

  const givenIds = cleaned.map((s) => s.rs?.id);
  const keepIds = givenIds.every((id) => /^s\d{1,2}$/.test(id)) && new Set(givenIds).size === givenIds.length;

  const sections = cleaned.map(({ rs, blocks }, i) => {
    const meta = normalizeSection({ title: rs.title, beat: rs.beat, density: rs.density, kicker: rs.kicker, degraded: rs.degraded, blocks: [] }, i).section;
    const id = keepIds ? rs.id : `s${i + 1}`;
    const out = { ...meta, id, blocks: [] };
    const used = new Set();
    const pattern = new RegExp(`^${id}\\.b\\d+$`);
    const slots = blocks.map(({ block, wanted }) => {
      const ok = keepIds && pattern.test(wanted) && !used.has(wanted);
      if (ok) used.add(wanted);
      return { block, id: ok ? wanted : null };
    });
    for (const slot of slots) {
      if (!slot.id) {
        slot.id = nextBlockId({ id, blocks: [...used].map((u) => ({ id: u })) });
        used.add(slot.id);
      }
      out.blocks.push({ ...slot.block, id: slot.id });
    }
    return out;
  });

  return {
    version: 1,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, LIMITS.title) : 'Untitled board',
    audience: typeof raw.audience === 'string' ? raw.audience.trim().slice(0, LIMITS.title) : '',
    sections,
  };
}

export function newBoardRecord({ id, spec, brief = '' }) {
  const now = Date.now();
  return { id, title: spec.title, createdAt: now, updatedAt: now, brief, spec, overrides: {}, annotations: [], connections: [], assets: {}, view: null };
}

export function recordFromState(state, meta) {
  return {
    id: meta.id,
    title: state.spec.title,
    createdAt: meta.createdAt ?? Date.now(),
    updatedAt: meta.updatedAt ?? Date.now(),
    brief: state.brief,
    spec: state.spec,
    overrides: state.overrides,
    annotations: state.annotations,
    connections: state.connections,
    assets: state.assets,
    view: state.view,
  };
}

export function stateFromRecord(record) {
  return {
    ...createBoardState({ spec: record.spec, brief: record.brief || '' }),
    overrides: record.overrides || {},
    annotations: record.annotations || [],
    connections: record.connections || [],
    assets: record.assets || {},
    view: record.view || null,
  };
}

export function exportBoard(record) {
  return JSON.stringify({ format: BOARD_FILE_FORMAT, version: 1, board: record });
}

function cleanOverrides(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, ov] of Object.entries(raw)) {
    if (!/^s\d+\.b\d+/.test(id) || !isObj(ov)) continue;
    const clean = {};
    for (const key of OVERRIDE_NUMBERS) if (typeof ov[key] === 'number' && Number.isFinite(ov[key])) clean[key] = ov[key];
    if (typeof ov.text === 'string') clean.text = ov.text.slice(0, 2000);
    if (ov.deleted === true) clean.deleted = true;
    if (isObj(ov.style)) clean.style = ov.style;
    if (Object.keys(clean).length) out[id] = clean;
  }
  return out;
}

/** An imported file → a record, or a plain-sentence reason it cannot be used. */
export function parseBoardFile(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a board — it isn't valid JSON." };
  }
  if (!isObj(file) || file.format !== BOARD_FILE_FORMAT || !isObj(file.board)) {
    return { ok: false, error: "That file isn't an Apollo board export." };
  }
  const board = file.board;
  const spec = sanitizeSpec(board.spec);
  if (!spec) return { ok: false, error: 'That board has no sections Apollo can draw.' };

  const assets = {};
  if (isObj(board.assets)) {
    for (const [id, url] of Object.entries(board.assets)) {
      if (typeof url === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(url)) assets[id] = url;
    }
  }
  const annotations = (Array.isArray(board.annotations) ? board.annotations : [])
    .filter((a) => isObj(a) && typeof a.id === 'string' && typeof a.section === 'string' && isObj(a.json))
    .slice(0, 2000);
  const connections = (Array.isArray(board.connections) ? board.connections : [])
    .filter((c) => isObj(c) && typeof c.id === 'string' && typeof c.from === 'string' && typeof c.to === 'string')
    .slice(0, 500)
    .map((c) => ({ id: c.id, from: c.from, to: c.to, tone: typeof c.tone === 'string' ? c.tone : 'ink', dashed: c.dashed === true }));

  const now = Date.now();
  return {
    ok: true,
    record: {
      id: typeof board.id === 'string' ? board.id : '',
      title: spec.title,
      createdAt: typeof board.createdAt === 'number' ? board.createdAt : now,
      updatedAt: now,
      brief: typeof board.brief === 'string' ? board.brief.slice(0, 120000) : '',
      spec,
      overrides: cleanOverrides(board.overrides),
      annotations,
      connections,
      assets,
      view: isObj(board.view) && ['zoom', 'x', 'y'].every((k) => typeof board.view[k] === 'number') ? board.view : null,
    },
  };
}
