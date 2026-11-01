import { toRelative } from '../state/anchor.js';

/**
 * DeepSeek speaks in relationships ("under the $5 click"); the board stores
 * numbers. This turns one into the other at the moment of applying, from the
 * objects' current bounds — so stored state stays numeric and replayable, and
 * an instruction that mentions something that has since moved still lands right.
 *
 * `ctx.boundsOf(id) → { x, y, w, h } | null` is in world coordinates;
 * `ctx.sections` is `[{ id, y, height }]`.
 */

function union(rects) {
  if (!rects.length) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Top-left of a `size`-sized thing placed next to `rel` (or, for "over", centred on it). */
function place(size, rel, op) {
  const gap = typeof op.gap === 'number' ? op.gap : 40;
  const align = op.align || 'center';
  if (op.position === 'over') return { x: rel.x + rel.w / 2 - size.w / 2, y: rel.y + rel.h / 2 - size.h / 2 };
  if (op.position === 'above' || op.position === 'below') {
    const y = op.position === 'below' ? rel.y + rel.h + gap : rel.y - gap - size.h;
    const x = align === 'start' ? rel.x : align === 'end' ? rel.x + rel.w - size.w : rel.x + rel.w / 2 - size.w / 2;
    return { x, y };
  }
  const x = op.position === 'right' ? rel.x + rel.w + gap : rel.x - gap - size.w;
  const y = align === 'start' ? rel.y : align === 'end' ? rel.y + rel.h - size.h : rel.y + rel.h / 2 - size.h / 2;
  return { x, y };
}

const stripPlacement = ({ relativeTo, position, gap, align, ...rest }) => rest;

export function resolveOperation(op, ctx) {
  switch (op.type) {
    case 'MOVE': {
      if (!op.relativeTo) return [op];
      const rel = ctx.boundsOf(op.relativeTo);
      const mover = union(op.targets.map(ctx.boundsOf).filter(Boolean));
      if (!rel || !mover) return [];
      const p = place(mover, rel, op);
      return [{ type: 'MOVE', targets: op.targets, dx: p.x - mover.x, dy: p.y - mover.y }];
    }

    case 'ADD_TEXT':
    case 'ADD_SHAPE': {
      if (!op.relativeTo) return [op];
      const rel = ctx.boundsOf(op.relativeTo);
      if (!rel) return [];
      const text = op.type === 'ADD_TEXT';
      // Text is placed by its top edge and centre; a shape by its centre.
      // A shape placed "over" something with no stated size is drawn around it.
      const around = op.position === 'over';
      const size = text
        ? { w: 520, h: (op.style?.fontSize || 56) * 1.1 }
        : { w: op.width || (around ? rel.w + 80 : 220), h: op.height || (around ? rel.h + 50 : 140) };
      const p = place(size, rel, op);
      const worldY = text ? p.y : p.y + size.h / 2;
      const at = toRelative(ctx.sections, worldY);
      const sized = text ? {} : { width: size.w, height: size.h };
      return [{ ...stripPlacement(op), ...sized, section: at.section, x: p.x + size.w / 2, y: at.y }];
    }

    case 'ADD_ARROW':
      // An arrow between two named things should stay tied to them.
      if (op.from && op.to) return [{ type: 'CONNECT', from: op.from, to: op.to, tone: op.tone || 'problem', dashed: Boolean(op.dashed) }];
      return [op];

    default:
      return [op];
  }
}
