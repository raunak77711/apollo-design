import { CX, MUTED, SAFE_W, font, toneColor } from '../theme.js';
import { boxItem, textItem } from './common.js';

/**
 * flow · timeline · funnel — things that happen in order.
 *
 * Connectors are drawn first so they sit behind the steps; they carry the ids
 * of their two ends and are re-routed at render time, so a step the user drags
 * away takes its arrows with it.
 */

const COLUMN_MAX = 7;
const COLUMN = { hero: { size: 64, gap: 100, note: 26 }, normal: { size: 40, gap: 76, note: 22 }, small: { size: 24, gap: 48, note: 16 } };
const NODE = { hero: { size: 34, pad: 24 }, normal: { size: 26, pad: 20 }, small: { size: 18, pad: 14 } };

const connector = (id, from, to, color, over = {}) => ({
  id, kind: 'connector', from, to, color, width: 3, head: true, gap: 12, ...over,
});

function layoutColumn(block, { measure, id }) {
  const cfg = COLUMN[block.scale] || COLUMN.normal;
  const n = block.steps.length;
  // Top-to-bottom drawing order. An upward flow lists its first step first but draws it last.
  const order = block.steps.map((_, i) => i);
  if (block.direction === 'up') order.reverse();

  const items = [];
  const labels = [];
  const lowest = [];
  let y = 0;

  order.forEach((si, pos) => {
    const step = block.steps[si];
    const label = textItem({
      id: `${id}.n${si + 1}`, text: step.label, width: SAFE_W, measure, color: toneColor(step.tone || block.tone),
      font: font({ size: cfg.size, weight: 700, lineHeight: 1.1 }),
    });
    label.cy = y + label.h / 2;
    y += label.h;
    items.push(label);
    labels[si] = label;
    lowest[si] = label;

    if (step.note) {
      const note = textItem({
        id: `${id}.n${si + 1}.note`, text: step.note, width: SAFE_W, measure, color: MUTED,
        font: font({ family: 'IBM Plex Mono', size: cfg.note, weight: 400, lineHeight: 1.25 }),
      });
      note.follow = label.id;
      note.cy = y + 8 + note.h / 2;
      y += 8 + note.h;
      items.push(note);
      lowest[si] = note;
    }
    if (pos < n - 1) y += cfg.gap;
  });

  const down = block.direction !== 'up';
  const connectors = [];
  for (let si = 0; si < n - 1; si += 1) {
    connectors.push(connector(
      `${id}.c${si + 1}`,
      down ? lowest[si].id : labels[si].id,
      down ? labels[si + 1].id : lowest[si + 1].id,
      toneColor(block.tone)
    ));
  }
  return { items: [...connectors, ...items], w: SAFE_W, h: y };
}

function layoutRow(block, { measure, id }) {
  const n = block.steps.length;
  // A long chain at hero size is a wall of shouting: past seven steps the type steps down.
  const scale = block.scale === 'hero' && n > 7 ? 'normal' : block.scale;
  const cfg = NODE[scale] || NODE.normal;
  const perRow = scale === 'small' || n > 12 ? 5 : 4;
  const cols = Math.min(perRow, n);
  const gapX = 64;
  const rowGap = 96;
  const labelFont = font({ family: 'DM Sans', size: cfg.size, weight: 700, lineHeight: 1.15 });
  // A box is never narrower than its longest word, or the word spills out of it.
  const longestWord = Math.max(...block.steps.flatMap((s) => s.label.split(/\s+/).map((w) => Math.ceil(measure(w, labelFont, 1000).w))));
  const nodeW = Math.min(
    Math.max(240, longestWord + cfg.pad * 2 + 8),
    Math.floor((1180 - (cols - 1) * gapX) / cols)
  );
  const labelWidth = nodeW - cfg.pad * 2;
  const nodeH = Math.max(...block.steps.map((s) => Math.ceil(measure(s.label, labelFont, labelWidth).h))) + cfg.pad * 2 + 8;
  const rows = Math.ceil(n / perRow);
  const up = block.direction === 'up'; // a climb still starts at the bottom when it is folded into rows
  const fullW = cols * nodeW + (cols - 1) * gapX;

  // Serpentine: rows alternate direction, and a new row starts in the slot the
  // previous one ended in, so the last step of a row sits directly above the first of the next.
  let slot = 0;
  let dir = 1;
  const nodes = block.steps.map((step, i) => {
    if (i > 0 && i % perRow === 0) dir = -dir;
    else if (i > 0) slot += dir;
    const color = toneColor(step.tone || block.tone);
    return boxItem({
      id: `${id}.n${i + 1}`, cx: CX - fullW / 2 + nodeW / 2 + slot * (nodeW + gapX),
      cy: (up ? rows - 1 - Math.floor(i / perRow) : Math.floor(i / perRow)) * (nodeH + rowGap) + nodeH / 2, w: nodeW, h: nodeH, radius: 18,
      stroke: color, strokeWidth: 3, label: step.label, labelFont, labelColor: color, pad: cfg.pad, labelWidth,
    });
  });
  const connectors = nodes.slice(0, -1).map((node, i) => connector(`${id}.c${i + 1}`, node.id, nodes[i + 1].id, toneColor(block.tone)));
  return { items: [...connectors, ...nodes], w: fullW, h: rows * nodeH + (rows - 1) * rowGap };
}

export function layoutFlow(block, ctx) {
  // Seven steps is as tall as a column can get before the board becomes a long corridor: fold longer chains into rows.
  const folded = block.direction === 'right' || block.steps.length > COLUMN_MAX;
  return folded ? layoutRow(block, ctx) : layoutColumn(block, ctx);
}

/* -------------------------------- timeline -------------------------------- */

const DOT = 24;

function timelineRight(block, { measure, id }) {
  const n = block.events.length;
  const spacing = Math.min(240, Math.floor(1100 / (n - 1)));
  const span = spacing * (n - 1);
  const colW = Math.max(120, spacing - 24);
  const whenFont = font({ family: 'IBM Plex Mono', size: 20, weight: 600, letterSpacing: 100, lineHeight: 1.2 });
  const labelFont = font({ family: 'DM Sans', size: 24, weight: 700, lineHeight: 1.15 });
  const color = toneColor(block.tone);

  const whens = block.events.map((ev, i) => textItem({
    id: `${id}.w${i + 1}`, text: ev.when || ' ', width: colW, measure, color: MUTED, font: whenFont,
    cx: CX - span / 2 + i * spacing,
  }));
  const labels = block.events.map((ev, i) => textItem({
    id: `${id}.l${i + 1}`, text: ev.label, width: colW, measure, color: toneColor(ev.tone || block.tone), font: labelFont,
    cx: CX - span / 2 + i * spacing,
  }));
  const whenH = Math.max(...whens.map((w) => w.h));
  const dotY = whenH + 28 + DOT / 2;
  const labelTop = dotY + DOT / 2 + 24;

  whens.forEach((w) => { w.cy = whenH - w.h / 2; });
  labels.forEach((l) => { l.cy = labelTop + l.h / 2; });
  const dots = block.events.map((ev, i) => boxItem({
    id: `${id}.d${i + 1}`, cx: CX - span / 2 + i * spacing, cy: dotY, w: DOT, h: DOT, radius: DOT / 2,
    fill: toneColor(ev.tone || block.tone), stroke: toneColor(ev.tone || block.tone), strokeWidth: 0,
  }));
  const connectors = dots.slice(0, -1).map((d, i) => connector(`${id}.c${i + 1}`, d.id, dots[i + 1].id, color, { gap: 6 }));
  const h = labelTop + Math.max(...labels.map((l) => l.h));
  return { items: [...connectors, ...dots, ...whens, ...labels], w: span + colW, h };
}

function timelineDown(block, { measure, id }) {
  const side = 360;
  const offset = 32;
  const rowGap = 56;
  const whenFont = font({ family: 'IBM Plex Mono', size: 20, weight: 600, letterSpacing: 100, lineHeight: 1.2 });
  const labelFont = font({ family: 'DM Sans', size: 24, weight: 700, lineHeight: 1.15 });
  const color = toneColor(block.tone);

  const items = [];
  const dots = [];
  let y = 0;
  block.events.forEach((ev, i) => {
    const when = textItem({
      id: `${id}.w${i + 1}`, text: ev.when || ' ', width: side, measure, color: MUTED, font: whenFont,
      align: 'right', cx: CX - offset - side / 2,
    });
    const label = textItem({
      id: `${id}.l${i + 1}`, text: ev.label, width: side, measure, color: toneColor(ev.tone || block.tone), font: labelFont,
      align: 'left', cx: CX + offset + side / 2,
    });
    const rowH = Math.max(when.h, label.h, DOT);
    when.cy = y + rowH / 2;
    label.cy = y + rowH / 2;
    dots.push(boxItem({
      id: `${id}.d${i + 1}`, cx: CX, cy: y + rowH / 2, w: DOT, h: DOT, radius: DOT / 2,
      fill: toneColor(ev.tone || block.tone), stroke: toneColor(ev.tone || block.tone), strokeWidth: 0,
    }));
    items.push(when, label);
    y += rowH + rowGap;
  });
  const connectors = dots.slice(0, -1).map((d, i) => connector(`${id}.c${i + 1}`, d.id, dots[i + 1].id, color, { gap: 6 }));
  return { items: [...connectors, ...dots, ...items], w: (offset + side) * 2, h: y - rowGap };
}

export function layoutTimeline(block, ctx) {
  return block.direction === 'down' ? timelineDown(block, ctx) : timelineRight(block, ctx);
}

/* --------------------------------- funnel --------------------------------- */

const ALPHAS = ['ff', 'e0', 'c8', 'b0', '98', '84', '70'];

export function layoutFunnel(block, { measure, id }) {
  const n = block.stages.length;
  const topW = 700;
  const bottomW = 260;
  const gap = 10;
  const color = toneColor(block.tone);
  const labelFont = font({ size: 28, weight: 700, lineHeight: 1.15 });
  const widthAt = (i) => topW - ((topW - bottomW) * i) / n;

  const items = [];
  let y = 0;
  block.stages.forEach((stage, i) => {
    const wTop = widthAt(i);
    const wBottom = widthAt(i + 1);
    const label = stage.value ? `${stage.label}  ${stage.value}` : stage.label;
    const labelWidth = Math.floor(wBottom - 48);
    const h = Math.max(104, Math.ceil(measure(label, labelFont, labelWidth).h) + 36);
    items.push({
      id: `${id}.f${i + 1}`, kind: 'poly', cx: CX, cy: y + h / 2, w: wTop, h,
      points: [[-wTop / 2, -h / 2], [wTop / 2, -h / 2], [wBottom / 2, h / 2], [-wBottom / 2, h / 2]],
      fill: `${color}${ALPHAS[Math.min(i, ALPHAS.length - 1)]}`, label, labelFont, labelColor: '#ffffff', labelWidth,
    });
    y += h + gap;
  });
  return { items, w: topW, h: y - gap };
}
