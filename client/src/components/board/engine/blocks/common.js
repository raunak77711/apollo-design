import { CX, STRONG_LINE } from '../theme.js';
import { tint } from '../../tools/util.js';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** range(128, 72, -4) → [128, 124, … 72] */
export function range(from, to, step) {
  const out = [];
  for (let v = from; step < 0 ? v >= to : v <= to; v += step) out.push(v);
  return out;
}

/**
 * A text item. Its width is the width it *wraps at* (the box the renderer's
 * Textbox will have); height comes from measuring that wrap. `cy` is the
 * item's own half-height until `stack` (or the caller) places it.
 */
export function textItem({ id, text, font, color, width, measure, align = 'center', cx = CX }) {
  const m = measure(text, font, width);
  return { id, kind: 'text', cx, cy: m.h / 2, w: width, h: m.h, tight: m.w, text, font, color, align };
}

/** A rounded box, optionally with a label and a tag. `labelWidth` is what the label wraps at. */
export function boxItem(fields) {
  const pad = fields.pad ?? 20;
  return {
    kind: 'box', radius: 14, fill: '#ffffff', stroke: STRONG_LINE, strokeWidth: 2,
    labelAlign: 'center', tagAlign: 'bottom-left', ...fields, pad,
    labelWidth: fields.labelWidth ?? fields.w - 2 * pad,
  };
}

/** Place items top to bottom, `gap` apart. Sets each `cy`; returns the total height. */
export function stack(items, gap = 0) {
  let y = 0;
  items.forEach((item, i) => {
    if (i) y += gap;
    item.cy = y + item.h / 2;
    y += item.h;
  });
  return y;
}

/** The largest size (sizes are descending) whose wrapped text fits in `maxLines` lines. */
export function fitSize(measure, text, font, width, sizes, maxLines) {
  for (const size of sizes) {
    if (measure(text, { ...font, size }, width).lines <= maxLines) return size;
  }
  return sizes[sizes.length - 1];
}

/**
 * A pictogram: a Lucide icon in a soft tinted disc (or bare). The layout only
 * names the icon; the renderer owns the drawing, and the model can only name
 * icons from the schema's ICONS list.
 */
/** The colour blended into white, opaque: a disc must hide whatever passes behind it (a road, a connector). */
function softDisc(color, amount = 0.13) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(255 - (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
}

export function iconItem({ id, name, cx, cy, size, color, disc = true, follow }) {
  return {
    id, kind: 'icon', name, cx, cy, w: size, h: size, color, disc: disc ? softDisc(color) : null,
    ...(follow ? { follow } : {}),
  };
}
