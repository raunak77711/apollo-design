import { TONE_COLORS } from '../engine/theme.js';
import { styleToFabric } from './styleMap.js';

/**
 * Pure builders for annotation records — the same objects the drawing tools
 * make by hand, expressed as Fabric `toObject` JSON so Direct mode and the
 * property panel can create them without a canvas.
 *
 * A record is `{ id, section, kind, json }`. `json.top` is relative to the top
 * of its section (see anchor.js). Every json carries
 * `data = { kind: 'annotation', id, ann }` so the canvas can tell it apart from
 * the presentation.
 */

const tag = (id, ann) => ({ kind: 'annotation', id, ann });

export function textRecord({ id, section, x, y, text, style = {}, width = 520 }) {
  return {
    id,
    section,
    kind: 'text',
    json: {
      type: 'textbox', originX: 'center', originY: 'top', left: x, top: y, width, text,
      fontFamily: 'Inter', fontSize: 56, fontWeight: '700', fill: TONE_COLORS.problem, textAlign: 'center', lineHeight: 1.1,
      ...styleToFabric(style, 'text'),
      data: tag(id, 'text'),
    },
  };
}

export function stickyRecord({ id, section, x, y, text = 'Note', style = {} }) {
  return {
    id,
    section,
    kind: 'sticky',
    json: {
      type: 'textbox', originX: 'left', originY: 'top', left: x, top: y, width: 260, text,
      fontFamily: 'DM Sans', fontSize: 26, fontWeight: '400', fill: '#3a3a1a', backgroundColor: '#fff6b7', padding: 16,
      ...styleToFabric(style, 'sticky'),
      data: tag(id, 'sticky'),
    },
  };
}

export function shapeRecord({ id, section, shape, x, y, width = 240, height = 150, style = {} }) {
  const base = {
    originX: 'left', originY: 'top', left: x - width / 2, top: y - height / 2,
    fill: 'rgba(200,30,58,0.06)', stroke: TONE_COLORS.problem, strokeWidth: 5,
    ...styleToFabric(style, 'shape'),
    data: tag(id, 'shape'),
  };
  const json = shape === 'circle'
    ? { type: 'ellipse', rx: width / 2, ry: height / 2, ...base }
    : { type: 'rect', width, height, rx: 10, ry: 10, ...base };
  return { id, section, kind: 'shape', json };
}

/** The box and box-local endpoints of an arrow between two points. Shared with the LineArrow class. */
export function arrowGeometry(x1, y1, x2, y2) {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  return {
    left, top,
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1)),
    sx: x1 - left, sy: y1 - top, ex: x2 - left, ey: y2 - top,
  };
}

export function arrowRecord({ id, section, x1, y1, x2, y2, tone = 'problem', dashed = false, head = true, style = {} }) {
  return {
    id,
    section,
    kind: head ? 'arrow' : 'line',
    json: {
      type: 'lineArrow', originX: 'left', originY: 'top', ...arrowGeometry(x1, y1, x2, y2),
      color: TONE_COLORS[tone] || tone, lineWidth: 5, dashed, headEnd: head, headStart: false,
      strokeWidth: 0, fill: null, objectCaching: false, padding: 10,
      ...styleToFabric(style, head ? 'arrow' : 'line'),
      data: tag(id, head ? 'arrow' : 'line'),
    },
  };
}
