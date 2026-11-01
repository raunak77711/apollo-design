import { MOTION } from './theme.js';

/**
 * Animating a Jam board block inside a short.
 *
 * The board's layout engine (components/board/engine) turns a block into positioned pieces whose ids say what
 * they are: `s5.b2.n3` is the third node of block s5.b2, `s5.b2.n3.icon` its icon, `s5.b2.c2` the arrow after
 * the second. This file reads those ids to answer "which part does this piece belong to?", so a block can
 * appear part by part, exactly as the speaker gets to each part, with the leader / follower structure the
 * board already has doing the rest.
 *
 * Pure: ids and timings in, timings out.
 */

/** 'steps.2' -> 3 (the third part). Paths with no index (a heading, a caption) return 0: they are always there. */
export function groupFromPath(path) {
  const m = /(?:^|\.)(?:steps|items|nodes|events|stages|leaks|terms|options|stops|chips|rows|panels|columns)\.(\d+)/.exec(String(path || ''));
  return m ? Number(m[1]) + 1 : 0;
}

/** Which side of a two-sided block a path is on, for compare/zones: 1 = left / inside, 2 = right / outside, 0 = neither. */
export function sideFromPath(path) {
  const p = String(path || '');
  if (/^(left|inside)\b/.test(p)) return 1;
  if (/^(right|outside)\b/.test(p)) return 2;
  return 0;
}

/** The tail of a piece's id after the block id: 's5.b2.n3.icon' -> 'n3.icon'. */
const tailOf = (id, blockId) => (id.startsWith(`${blockId}.`) ? id.slice(blockId.length + 1) : id);

/** { group, side } for one piece. group 0 = static furniture (a heading, the bucket, a rule). */
export function pieceOf(item, blockId, byId) {
  if (item.kind === 'connector') {
    const a = byId.get(item.from);
    const b = byId.get(item.to);
    const ga = a ? pieceOf(a, blockId, byId) : { group: 0, side: 0 };
    const gb = b ? pieceOf(b, blockId, byId) : { group: 0, side: 0 };
    return { group: Math.max(ga.group, gb.group), side: ga.side || gb.side };
  }
  const tail = tailOf(item.id, blockId);
  const side = /^(l|in)\./.test(tail) ? 1 : /^(r|out)\./.test(tail) ? 2 : 0;
  const m = /^(?:(?:l|r|in|out)\.)?[a-z]*(\d+)/i.exec(tail);
  return { group: m ? Number(m[1]) : 0, side };
}

/**
 * When each group appears, in seconds from the start of the board event.
 *   hits        [{ path, at }] when each part was said, in CLIP seconds
 *   eventAt     the event's own start, to turn those into event-relative times
 * Groups the speaker never reached are staggered after the last one that was timed, so nothing is left hidden.
 */
export function revealTimes({ animation, groups, sides, hits = [], eventAt, duration }) {
  const times = new Map(); // group -> seconds
  const lastStart = Math.max(0.6, duration - 0.9);

  if (animation === 'reveal' || animation === 'focus' || animation === 'highlight') {
    for (let g = 0; g <= groups; g += 1) times.set(g, g === 0 ? 0 : 0.12 + (g - 1) * 0.05); // the whole block, with a tiny cascade
    return { times, sideTimes: new Map([[0, 0], [1, 0], [2, 0]]) };
  }

  if (animation === 'compare' && sides > 0) {
    const spoken = hits.map((h) => ({ side: sideFromPath(h.path), at: h.at - eventAt })).filter((h) => h.side > 0 && h.at >= 0);
    const second = spoken.find((h) => h.side === 2);
    const rightAt = second ? Math.min(lastStart, Math.max(1.0, second.at - 0.1)) : Math.min(lastStart, Math.max(1.6, duration * 0.4));
    for (let g = 0; g <= groups; g += 1) times.set(g, 0.05);
    return { times, sideTimes: new Map([[0, 0.05], [1, 0.1], [2, rightAt]]) };
  }

  // progressive
  const timed = new Map();
  for (const h of hits) {
    const g = groupFromPath(h.path);
    if (g > 0 && !timed.has(g)) timed.set(g, Math.min(lastStart, Math.max(0.25, h.at - eventAt - 0.12)));
  }
  times.set(0, 0);
  let previous = 0.1;
  for (let g = 1; g <= groups; g += 1) {
    let t = timed.get(g);
    if (t === undefined) t = Math.min(lastStart, previous + MOTION.stagger);
    t = Math.max(t, previous + 0.08); // always in order, never all at once
    t = Math.min(t, lastStart + (g - groups) * 0.01);
    times.set(g, t);
    previous = t;
  }
  return { times, sideTimes: new Map([[0, 0], [1, 0], [2, 0]]) };
}

/** Group indices and the highest group of a scene's pieces. */
export function groupPieces(items, blockId) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const pieces = new Map();
  let groups = 0;
  let sides = 0;
  for (const item of items) {
    const p = pieceOf(item, blockId, byId);
    pieces.set(item.id, p);
    groups = Math.max(groups, p.group);
    sides = Math.max(sides, p.side);
  }
  return { pieces, groups, sides };
}
