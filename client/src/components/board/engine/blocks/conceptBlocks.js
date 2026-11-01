import { CX, MUTED, SAFE_W, font, toneColor } from '../theme.js';
import { tint } from '../../tools/util.js';
import { boxItem, clamp, iconItem, textItem } from './common.js';

/**
 * equation · loop · matrix · bucket · list — the shapes a script reaches for when
 * it says "ATTENTION × CONVERSION × VALUE = REVENUE", "turn the funnel into a
 * circle", "three columns", "draw a bucket with holes", "six questions".
 *
 * Everything is built from the same few primitives (chips, text, polygons,
 * connectors) as the other blocks, so every part stays an individual, movable
 * piece and every arrow stays tied to the two things it joins.
 */

const connector = (id, from, to, color, over = {}) => ({
  id, kind: 'connector', from, to, color, width: 3, head: true, gap: 10, ...over,
});

/** A polygon from absolute points: its centre is the middle of its bounding box, its points are relative to that. */
function polyItem(id, absolute, fields) {
  const xs = absolute.map(([x]) => x);
  const ys = absolute.map(([, y]) => y);
  const x1 = Math.min(...xs);
  const x2 = Math.max(...xs);
  const y1 = Math.min(...ys);
  const y2 = Math.max(...ys);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return { id, kind: 'poly', cx, cy, w: x2 - x1, h: y2 - y1, points: absolute.map(([x, y]) => [x - cx, y - cy]), ...fields };
}

/* -------------------------------- equation -------------------------------- */

export function layoutEquation(block, { measure, id }) {
  const color = toneColor(block.tone);
  const parts = [];
  block.terms.forEach((label, i) => {
    if (i > 0) parts.push({ kind: 'op', text: block.operator });
    parts.push({ kind: 'term', label, index: i + 1 });
  });
  if (block.result) {
    parts.push({ kind: 'op', text: '=' });
    parts.push({ kind: 'result', label: block.result });
  }

  // Try the biggest type first and step down until the whole sum fits one line; otherwise stack it.
  let plan = null;
  for (const size of [48, 42, 36, 30, 26]) {
    const padX = Math.round(size * 0.75);
    const gap = Math.round(size * 0.45);
    const chipFont = font({ size, weight: 700, lineHeight: 1.1 });
    const resultFont = font({ size: Math.round(size * 1.12), weight: 900, lineHeight: 1.1 });
    const opFont = font({ family: 'Space Grotesk', size: Math.round(size * 1.3), weight: 500, lineHeight: 1 });
    const sized = parts.map((p) => {
      if (p.kind === 'op') {
        const m = measure(p.text, opFont, 200);
        return { ...p, font: opFont, w: Math.max(40, Math.ceil(m.w) + 8), h: Math.ceil(m.h) };
      }
      const f = p.kind === 'result' ? resultFont : chipFont;
      const m = measure(p.label, f, 1000);
      return { ...p, font: f, w: Math.ceil(m.w) + padX * 2, h: Math.ceil(m.h) + 46 };
    });
    const rowW = sized.reduce((sum, p) => sum + p.w, 0) + gap * (sized.length - 1);
    plan = { sized, rowW, gap, padX };
    if (rowW <= 1240) break;
  }

  const { sized, rowW, gap, padX } = plan;
  const horizontal = rowW <= 1240;
  const chipH = Math.max(...sized.filter((p) => p.kind !== 'op').map((p) => p.h));
  const items = [];
  const iconFor = (p) => (p.kind === 'term' ? block.icons?.[p.index - 1] : p.kind === 'result' ? block.resultIcon : '');
  const withIcons = horizontal && sized.some((p) => iconFor(p));
  const ICON = 64;
  const top = withIcons ? ICON + 18 : 0; // icons sit above the chips they belong to

  let x = CX - rowW / 2;
  let y = 0;
  sized.forEach((p, i) => {
    const key = `${id}.${p.kind === 'op' ? 'o' : p.kind === 'result' ? 'r' : 't'}${p.index || i + 1}`;
    const cx = horizontal ? x + p.w / 2 : CX;
    const cy = horizontal ? top + chipH / 2 : y + p.h / 2;
    if (withIcons && iconFor(p)) {
      const tone = p.kind === 'result' ? toneColor(block.resultTone) : color;
      items.push(iconItem({ id: `${key}.icon`, name: iconFor(p), cx, cy: ICON / 2, size: ICON, color: tone }));
    }
    if (p.kind === 'op') {
      const op = textItem({ id: key, text: p.text, width: p.w, measure, color: MUTED, font: p.font, cx });
      op.cy = cy;
      items.push(op);
    } else {
      const result = p.kind === 'result';
      const stroke = result ? toneColor(block.resultTone) : color;
      items.push(boxItem({
        id: key, cx, cy, w: p.w, h: horizontal ? chipH : p.h, radius: 24,
        fill: result ? stroke : '#ffffff', stroke, strokeWidth: 4, label: p.label, labelFont: p.font,
        labelColor: result ? '#ffffff' : color, pad: padX, labelWidth: p.w - padX * 2,
      }));
    }
    x += p.w + gap;
    y += p.h + (p.kind === 'op' ? 6 : 10);
  });

  if (horizontal) return { items, w: Math.max(rowW, 400), h: top + chipH };
  return { items, w: Math.max(...sized.map((p) => p.w)), h: y };
}

/* ---------------------------------- loop ---------------------------------- */

export function layoutLoop(block, { measure, id }) {
  const n = block.nodes.length;
  const color = toneColor(block.tone);
  const nodeFont = font({ family: 'DM Sans', size: 26, weight: 700, lineHeight: 1.15 });
  const ry = clamp(120 + n * 24, 240, 320);
  const rx = Math.round(ry * 1.55);
  const pad = 22;

  const ICON = 44;
  const sizes = block.nodes.map((nd) => {
    const m = measure(nd.label, nodeFont, 220);
    return { w: clamp(Math.ceil(m.w) + pad * 2, 160, 270), h: Math.ceil(m.h) + 34 + (nd.icon ? ICON + 8 : 0) };
  });
  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  const cy0 = ry + maxH / 2;

  const nodes = block.nodes.map((nd, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return boxItem({
      id: `${id}.n${i + 1}`, cx: CX + rx * Math.cos(angle), cy: cy0 + ry * Math.sin(angle), w: sizes[i].w, h: sizes[i].h,
      radius: 18, stroke: color, strokeWidth: 3, label: nd.label, labelFont: nodeFont, labelColor: '#0a0a0a', pad,
      labelWidth: sizes[i].w - pad * 2, ...(nd.icon ? { labelOffsetY: (ICON + 8) / 2 } : {}),
    });
  });
  const badges = block.nodes.flatMap((nd, i) => (nd.icon
    ? [iconItem({ id: `${id}.n${i + 1}.icon`, name: nd.icon, cx: nodes[i].cx, cy: nodes[i].cy - sizes[i].h / 2 + 12 + ICON / 2, size: ICON, color, follow: nodes[i].id })]
    : []));
  // The last arrow closes the cycle back to the first node.
  const arrows = nodes.map((node, i) => connector(`${id}.a${i + 1}`, node.id, nodes[(i + 1) % n].id, color, { width: 4, gap: 12 }));

  const items = [...arrows, ...nodes, ...badges];
  if (block.center) {
    const centerFont = font({ family: 'Space Grotesk', size: 46, weight: 700, lineHeight: 1.1 });
    const c = textItem({ id: `${id}.center`, text: block.center, width: 420, measure, color, font: centerFont });
    c.cy = cy0;
    items.push(c);
  }
  return { items, w: 2 * rx + maxW, h: 2 * ry + maxH };
}

/* --------------------------------- matrix --------------------------------- */

export function layoutMatrix(block, { measure, id }) {
  const cols = block.columns.length;
  const cellW = cols === 2 ? 360 : cols === 3 ? 290 : 225;
  const gapX = cols === 4 ? 70 : 90;
  const total = cols * cellW + (cols - 1) * gapX;
  const left = CX - total / 2;
  const colX = (c) => left + cellW / 2 + c * (cellW + gapX);
  const headFont = font({ family: 'IBM Plex Mono', size: 22, weight: 600, letterSpacing: 300, lineHeight: 1.2 });
  const cellFont = font({ family: 'DM Sans', size: 26, weight: 600, lineHeight: 1.2 });
  const pad = 20;

  const items = [];
  const heads = block.columns.map((label, c) => textItem({
    id: `${id}.h${c + 1}`, text: label.toUpperCase(), width: cellW, measure, color: toneColor(block.tones[c]), font: headFont, cx: colX(c),
  }));
  const headH = Math.max(...heads.map((h) => h.h));
  heads.forEach((h) => { h.cy = headH / 2; });
  items.push(...heads);
  items.push({ id: `${id}.rule`, kind: 'rule', cx: CX, cy: headH + 18, w: total, h: 0, color: '#0a0a0a', width: 3 });

  let y = headH + 46;
  const connectors = [];
  block.rows.forEach((row, r) => {
    const rowH = Math.max(80, Math.max(...row.map((cell) => (cell ? Math.ceil(measure(cell, cellFont, cellW - pad * 2).h) + 40 : 0))));
    const cells = row.map((cell, c) => (cell
      ? boxItem({
        id: `${id}.r${r + 1}c${c + 1}`, cx: colX(c), cy: y + rowH / 2, w: cellW, h: rowH, radius: 16,
        stroke: toneColor(block.tones[c]), strokeWidth: 3, label: cell, labelFont: cellFont, labelColor: '#0a0a0a', pad, labelWidth: cellW - pad * 2,
      })
      : null));
    cells.forEach((cell) => cell && items.push(cell));
    for (let c = 0; c < cols - 1; c += 1) {
      if (cells[c] && cells[c + 1]) connectors.push(connector(`${id}.a${r + 1}.${c + 1}`, cells[c].id, cells[c + 1].id, '#9a9a9a', { width: 2, gap: 8 }));
    }
    y += rowH + 24;
  });
  return { items: [...connectors, ...items], w: total, h: y - 24 };
}

/* --------------------------------- bucket --------------------------------- */

export function layoutBucket(block, { measure, id }) {
  const leakColor = toneColor(block.tone);
  const flowColor = toneColor('movement');
  const n = block.leaks.length;
  const perSide = Math.ceil(n / 2);
  const topW = 460;
  const bottomW = 330;
  const bodyH = Math.max(340, perSide * 76 + 90);
  const items = [];
  let y = 0;

  if (block.top) {
    const top = textItem({ id: `${id}.top`, text: block.top, width: SAFE_W, measure, color: flowColor, font: font({ size: 64, weight: 900, lineHeight: 1.05 }) });
    top.cy = y + top.h / 2;
    items.push(top);
    y += top.h + 4;
  }
  const pour = textItem({ id: `${id}.pour`, text: '↓   ↓   ↓', width: 460, measure, color: flowColor, font: font({ size: 56, weight: 700, lineHeight: 1, letterSpacing: 100 }) });
  pour.cy = y + pour.h / 2;
  items.push(pour);
  y += pour.h + 16;

  const bodyTop = y;
  const half = (depth) => topW / 2 + ((bottomW - topW) / 2) * (depth / bodyH); // wall half-width at a depth
  const bodyPoints = [[CX - topW / 2, bodyTop], [CX + topW / 2, bodyTop], [CX + bottomW / 2, bodyTop + bodyH], [CX - bottomW / 2, bodyTop + bodyH]];
  const body = polyItem(`${id}.body`, bodyPoints, { fill: '#fafafa', stroke: '#0a0a0a', strokeWidth: 7 });
  const level = bodyH * 0.2;
  const inset = 6;
  const water = polyItem(`${id}.water`, [
    [CX - half(level) + inset, bodyTop + level], [CX + half(level) - inset, bodyTop + level],
    [CX + bottomW / 2 - inset, bodyTop + bodyH - inset], [CX - bottomW / 2 + inset, bodyTop + bodyH - inset],
  ], { fill: tint(flowColor, 0.2), stroke: null, strokeWidth: 0, follow: body.id });
  items.push(body, water);

  const chipFont = font({ family: 'DM Sans', size: 24, weight: 700, lineHeight: 1.1 });
  const connectors = [];
  const slotTop = bodyH * 0.3;
  const slotSpan = bodyH * 0.6;
  block.leaks.forEach((leak, i) => {
    const left = i % 2 === 0;
    const slot = Math.floor(i / 2);
    const depth = perSide === 1 ? bodyH * 0.6 : slotTop + (slotSpan * slot) / (perSide - 1);
    const sign = left ? -1 : 1;
    const wallX = CX + sign * half(depth);
    const m = measure(leak.label, chipFont, 240);
    const iconPad = leak.icon ? 40 : 0;
    const chipW = clamp(Math.ceil(m.w) + 44 + iconPad, 150, 290);
    const cy = bodyTop + depth;

    const hole = boxItem({
      id: `${id}.h${i + 1}`, cx: wallX, cy, w: 28, h: 28, radius: 14, fill: '#ffffff', stroke: '#0a0a0a', strokeWidth: 4, follow: body.id,
    });
    const chip = boxItem({
      id: `${id}.l${i + 1}`, cx: CX + sign * (410 + chipW / 2 - 100), cy, w: chipW, h: 60, radius: 16, stroke: leakColor, strokeWidth: 3,
      label: leak.label, labelFont: chipFont, labelColor: leakColor, pad: 18 + iconPad, labelWidth: chipW - 36 - iconPad, follow: body.id,
      ...(leak.icon ? { labelAlign: 'left' } : {}),
    });
    const drop = boxItem({
      id: `${id}.d${i + 1}`, cx: wallX + sign * 20, cy: cy + 36, w: 14, h: 18, radius: 7, fill: tint(leakColor, 0.55), stroke: leakColor, strokeWidth: 0, follow: body.id,
    });
    items.push(hole, chip, drop);
    if (leak.icon) {
      items.push(iconItem({ id: `${id}.l${i + 1}.icon`, name: leak.icon, cx: chip.cx - chipW / 2 + 18 + 15, cy, size: 30, color: leakColor, disc: false, follow: chip.id }));
    }
    connectors.push(connector(`${id}.c${i + 1}`, hole.id, chip.id, leakColor, { head: false, width: 3, gap: 4 }));
  });

  y = bodyTop + bodyH + 36;
  if (block.bottom) {
    const bottom = textItem({ id: `${id}.bottom`, text: block.bottom, width: SAFE_W, measure, color: toneColor('money'), font: font({ size: 60, weight: 900, lineHeight: 1.05 }) });
    bottom.cy = y + bottom.h / 2;
    bottom.follow = body.id;
    items.push(bottom);
    y += bottom.h;
  }
  return { items: [...connectors, ...items], w: 1180, h: y };
}

/* ---------------------------------- list ---------------------------------- */

export function layoutList(block, { measure, id }) {
  const color = toneColor(block.tone);
  const labelFont = font({ size: 38, weight: 700, lineHeight: 1.1 });
  const detailFont = font({ size: 26, weight: 400, lineHeight: 1.25 });
  const numFont = font({ family: 'Space Grotesk', size: 30, weight: 700, lineHeight: 1 });
  const badge = 62;
  const textW = 560;
  const colW = badge + 26 + textW;
  const left = CX - colW / 2;
  const items = [];
  let y = 0;

  block.items.forEach((it, i) => {
    const label = textItem({ id: `${id}.t${i + 1}`, text: it.label, width: textW, measure, color: '#0a0a0a', font: labelFont, align: 'left', cx: left + badge + 26 + textW / 2 });
    let rowH = label.h;
    let detail = null;
    if (it.detail) {
      detail = textItem({ id: `${id}.d${i + 1}`, text: it.detail, width: textW, measure, color: MUTED, font: detailFont, align: 'left', cx: left + badge + 26 + textW / 2 });
      rowH += 6 + detail.h;
    }
    const rowTop = y;
    const h = Math.max(badge, rowH);
    label.cy = rowTop + (h - rowH) / 2 + label.h / 2;
    if (detail) detail.cy = rowTop + (h - rowH) / 2 + label.h + 6 + detail.h / 2;
    const num = it.icon
      ? iconItem({ id: `${id}.n${i + 1}`, name: it.icon, cx: left + badge / 2, cy: rowTop + h / 2, size: badge, color })
      : boxItem({
        id: `${id}.n${i + 1}`, cx: left + badge / 2, cy: rowTop + h / 2, w: badge, h: badge, radius: badge / 2,
        fill: color, stroke: color, strokeWidth: 0, label: String(i + 1), labelFont: numFont, labelColor: '#ffffff', pad: 8, labelWidth: badge - 16,
      });
    items.push(num, label);
    if (detail) items.push(detail);
    y += h + 38;
  });
  return { items, w: colW, h: y - 38 };
}
