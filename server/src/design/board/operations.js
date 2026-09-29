/**
 * Jam board — the operations DeepSeek (and Direct mode) may ask for.
 *
 * MIRRORED byte-for-byte at client/src/components/board/state/operations.js.
 * Keep the two identical; server/test/board.parity.test.js fails if they drift.
 *
 * This validates the *AI-facing* vocabulary only. The editor's own internal
 * operations (OVERRIDE_SET, ANNOTATION_ADD, …) exist in boardState.js and are
 * deliberately rejected here: a model has no business writing raw Fabric JSON
 * into a board, so it cannot.
 */

import { TONES, normalizeBlock } from './schema.js';

export const BOARD_OP_TYPES = [
  'SET_TEXT', 'SET_STYLE', 'MOVE', 'RESIZE', 'ROTATE', 'DELETE', 'RESTORE',
  'INSERT_BLOCK', 'REPLACE_BLOCK', 'CONNECT', 'DISCONNECT',
  'ADD_TEXT', 'ADD_SHAPE', 'ADD_ARROW', 'FOCUS', 'SET_VIEW',
];

export const STYLE_FONTS = ['Inter', 'Geist', 'Space Grotesk', 'DM Sans', 'IBM Plex Mono', 'Source Serif 4'];

const POSITIONS = ['above', 'below', 'left', 'right', 'over'];
const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const SECTION_RE = /^s\d{1,2}$/;
const BLOCK_RE = /^s\d{1,2}\.b\d{1,3}$/;
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
const RGB_RE = /^rgba?\([\d\s.,%]+\)$/;

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const idOf = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : null);
const clipText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function targetsOf(op) {
  const raw = Array.isArray(op.targets) ? op.targets : [op.target];
  return [...new Set(raw.map(idOf).filter(Boolean))].slice(0, 50);
}

function colorOf(v) {
  if (TONES.includes(v) || v === 'transparent') return v;
  if (typeof v === 'string' && (HEX_RE.test(v) || RGB_RE.test(v))) return v;
  return null;
}

/** Whitelist and clamp a style patch. Unknown keys and bad values are dropped, not errors. */
export function sanitizeStyle(changes) {
  if (changes === null || typeof changes !== 'object') return {};
  const out = {};
  if (STYLE_FONTS.includes(changes.fontFamily)) out.fontFamily = changes.fontFamily;
  const size = num(changes.fontSize, 8, 400);
  if (size !== null) out.fontSize = Math.round(size);
  if (changes.fontWeight === 'bold' || changes.fontWeight === 'normal') out.fontWeight = changes.fontWeight;
  else {
    const w = num(changes.fontWeight, 100, 900);
    if (w !== null) out.fontWeight = Math.round(w / 100) * 100;
  }
  if (typeof changes.italic === 'boolean') out.italic = changes.italic;
  if (typeof changes.underline === 'boolean') out.underline = changes.underline;
  if (['left', 'center', 'right'].includes(changes.align)) out.align = changes.align;
  const lh = num(changes.lineHeight, 0.6, 3);
  if (lh !== null) out.lineHeight = lh;
  const ls = num(changes.letterSpacing, -100, 800);
  if (ls !== null) out.letterSpacing = Math.round(ls);
  const op = num(changes.opacity, 0, 1);
  if (op !== null) out.opacity = op;
  for (const key of ['color', 'fill', 'stroke']) {
    const c = colorOf(changes[key]);
    if (c) out[key] = c;
  }
  const sw = num(changes.strokeWidth, 0, 40);
  if (sw !== null) out.strokeWidth = sw;
  const radius = num(changes.radius, 0, 200);
  if (radius !== null) out.radius = radius;
  if (typeof changes.dash === 'boolean') out.dash = changes.dash;
  if (typeof changes.headEnd === 'boolean') out.headEnd = changes.headEnd;
  if (typeof changes.headStart === 'boolean') out.headStart = changes.headStart;
  return out;
}

/** Placement shared by the MOVE and ADD_* operations. */
function placement(op) {
  const out = {};
  const rel = idOf(op.relativeTo);
  if (rel && POSITIONS.includes(op.position)) {
    out.relativeTo = rel;
    out.position = op.position;
    out.gap = num(op.gap, 0, 2000) ?? 40;
    out.align = ['center', 'start', 'end'].includes(op.align) ? op.align : 'center';
  }
  if (typeof op.section === 'string' && SECTION_RE.test(op.section)) out.section = op.section;
  const x = num(op.x, -5000, 6000);
  const y = num(op.y, -5000, 60000);
  if (x !== null) out.x = x;
  if (y !== null) out.y = y;
  return out;
}

const fail = (error) => ({ ok: false, error });

export function validateBoardOperation(op) {
  if (op === null || typeof op !== 'object' || !BOARD_OP_TYPES.includes(op.type)) {
    return fail(`unknown operation "${op && op.type}"`);
  }

  switch (op.type) {
    case 'SET_TEXT': {
      const targets = targetsOf(op);
      const text = clipText(op.text, 2000);
      if (!targets.length || !text) return fail('SET_TEXT needs a target and text');
      return { ok: true, op: { type: op.type, targets: targets.slice(0, 1), text } };
    }
    case 'SET_STYLE': {
      const targets = targetsOf(op);
      const changes = sanitizeStyle(op.changes);
      if (!targets.length) return fail('SET_STYLE needs a target');
      if (!Object.keys(changes).length) return fail('SET_STYLE has no valid style changes');
      return { ok: true, op: { type: op.type, targets, changes } };
    }
    case 'MOVE': {
      const targets = targetsOf(op);
      if (!targets.length) return fail('MOVE needs a target');
      const dx = num(op.dx, -20000, 20000);
      const dy = num(op.dy, -20000, 20000);
      if (dx !== null && dy !== null) return { ok: true, op: { type: op.type, targets, dx, dy } };
      const p = placement(op);
      if (!p.relativeTo) return fail('MOVE needs dx and dy, or relativeTo and a valid position');
      return { ok: true, op: { type: op.type, targets, ...p } };
    }
    case 'RESIZE': {
      const targets = targetsOf(op);
      if (!targets.length) return fail('RESIZE needs a target');
      const scale = num(op.scale, 0.1, 10);
      if (scale !== null) return { ok: true, op: { type: op.type, targets, scale } };
      const sx = num(op.scaleX, 0.1, 10);
      const sy = num(op.scaleY, 0.1, 10);
      if (sx !== null && sy !== null) return { ok: true, op: { type: op.type, targets, scaleX: sx, scaleY: sy } };
      return fail('RESIZE needs scale, or scaleX and scaleY');
    }
    case 'ROTATE': {
      const targets = targetsOf(op);
      const angle = num(op.angle, -360, 360);
      if (!targets.length || angle === null) return fail('ROTATE needs a target and an angle');
      return { ok: true, op: { type: op.type, targets, angle } };
    }
    case 'DELETE':
    case 'RESTORE': {
      const targets = targetsOf(op);
      if (!targets.length) return fail(`${op.type} needs a target`);
      return { ok: true, op: { type: op.type, targets } };
    }
    case 'INSERT_BLOCK': {
      const block = normalizeBlock(op.block);
      if (typeof op.section !== 'string' || !SECTION_RE.test(op.section)) return fail('INSERT_BLOCK needs a section id like "s3"');
      if (!block) return fail('INSERT_BLOCK block is not a valid block');
      const index = num(op.index, 0, 10);
      return { ok: true, op: { type: op.type, section: op.section, index: index === null ? 10 : Math.round(index), block } };
    }
    case 'REPLACE_BLOCK': {
      const target = idOf(op.target);
      const block = normalizeBlock(op.block);
      if (!target || !BLOCK_RE.test(target)) return fail('REPLACE_BLOCK needs a block id like "s3.b2"');
      if (!block) return fail('REPLACE_BLOCK block is not a valid block');
      return { ok: true, op: { type: op.type, targets: [target], block } };
    }
    case 'CONNECT':
    case 'DISCONNECT': {
      const from = idOf(op.from);
      const to = idOf(op.to);
      if (!from || !to || from === to) return fail(`${op.type} needs two different ids`);
      const out = { type: op.type, from, to };
      if (op.type === 'CONNECT') {
        out.tone = TONES.includes(op.tone) ? op.tone : 'ink';
        out.dashed = op.dashed === true;
      }
      return { ok: true, op: out };
    }
    case 'ADD_TEXT': {
      const text = clipText(op.text, 500);
      if (!text) return fail('ADD_TEXT needs text');
      return { ok: true, op: { type: op.type, text, style: sanitizeStyle(op.style), ...placement(op) } };
    }
    case 'ADD_SHAPE': {
      if (!['rectangle', 'circle'].includes(op.shape)) return fail('ADD_SHAPE needs shape "rectangle" or "circle"');
      // Size is only set when the model gave one: "circle X" sizes itself to X at placement time.
      const out = { type: op.type, shape: op.shape, style: sanitizeStyle(op.style), ...placement(op) };
      const width = num(op.width, 20, 3000);
      const height = num(op.height, 20, 3000);
      if (width !== null) out.width = width;
      if (height !== null) out.height = height;
      return { ok: true, op: out };
    }
    case 'ADD_ARROW': {
      const from = idOf(op.from);
      const to = idOf(op.to);
      const hasCoords = ['x1', 'y1', 'x2', 'y2'].every((k) => num(op[k], -5000, 60000) !== null);
      if (!(from && to) && !hasCoords) return fail('ADD_ARROW needs from/to ids, or x1 y1 x2 y2');
      const out = { type: op.type, dashed: op.dashed === true, tone: TONES.includes(op.tone) ? op.tone : 'problem' };
      if (from && to) Object.assign(out, { from, to });
      else {
        for (const k of ['x1', 'y1', 'x2', 'y2']) out[k] = num(op[k], -5000, 60000);
        if (typeof op.section === 'string' && SECTION_RE.test(op.section)) out.section = op.section;
      }
      return { ok: true, op: out };
    }
    case 'FOCUS': {
      const targets = targetsOf(op);
      if (!targets.length) return fail('FOCUS needs a target');
      return { ok: true, op: { type: op.type, targets: targets.slice(0, 1) } };
    }
    case 'SET_VIEW': {
      const zoom = num(op.zoom, 0.25, 4);
      const x = num(op.x, -1e6, 1e6);
      const y = num(op.y, -1e6, 1e6);
      if (zoom === null || x === null || y === null) return fail('SET_VIEW needs zoom, x and y');
      return { ok: true, op: { type: op.type, zoom, x, y } };
    }
    default:
      return fail(`unknown operation "${op.type}"`);
  }
}
