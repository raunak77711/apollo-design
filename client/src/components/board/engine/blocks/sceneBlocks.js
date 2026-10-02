import { tint } from '../../tools/util.js';
import { CX, MUTED, SAFE_W, font, toneColor } from '../theme.js';
import { boxItem, clamp, fitSize, iconItem, range, textItem } from './common.js';

/**
 * moment · meter · eliminate · track · zones — the pictures a script asks for
 * when it says "introduce Sarah", "draw a battery", "cross them out one at a
 * time", "draw a road with toll booths", "inside the window / outside it".
 *
 * Like every block here they are built from chips, text, icons, rules and
 * connectors, with followers pinned to a leader so a moved frame takes its
 * contents with it.
 */

const connector = (id, from, to, color, over = {}) => ({
  id, kind: 'connector', from, to, color, width: 4, head: true, gap: 10, ...over,
});

/* --------------------------------- moment --------------------------------- */

export function layoutMoment(block, { measure, id }) {
  const color = toneColor(block.tone);
  const items = [];
  let y = 0;

  if (block.icon) {
    const badge = iconItem({ id: `${id}.icon`, name: block.icon, cx: CX, cy: y + 80, size: 160, color });
    items.push(badge);
    y += 160 + 30;
  }

  const base = font({ family: 'Space Grotesk', weight: 700, lineHeight: 1.02, letterSpacing: -10 });
  const explicitLines = block.text.split('\n').length;
  const size = fitSize(measure, block.text, base, 760, range(132, 64, -8), explicitLines);
  const name = textItem({ id: `${id}.text`, text: block.text, width: 760, measure, color: '#0a0a0a', font: { ...base, size } });
  name.cy = y + name.h / 2;
  items.push(name);
  y += name.h;

  if (block.caption) {
    const caption = textItem({ id: `${id}.caption`, text: block.caption, width: SAFE_W, measure, color: MUTED, font: font({ size: 30, weight: 500, lineHeight: 1.25 }) });
    caption.cy = y + 16 + caption.h / 2;
    items.push(caption);
    y += 16 + caption.h;
  }

  let w = 760;
  if (block.chips?.length) {
    y += 44;
    const chipFont = font({ family: 'DM Sans', size: 30, weight: 700, lineHeight: 1.1 });
    const chips = block.chips.map((c) => {
      const m = measure(c.label, chipFont, 700);
      const pad = 28;
      const iconW = c.icon ? 44 : 0;
      return { c, w: Math.ceil(m.w) + pad * 2 + iconW, iconW, pad };
    });
    // One row if it fits, otherwise one chip per row.
    const gap = 22;
    const rowW = chips.reduce((s, k) => s + k.w, 0) + gap * (chips.length - 1);
    const oneRow = rowW <= 1100;
    const H = 72;
    let x = CX - rowW / 2;
    chips.forEach((k, i) => {
      const tone = toneColor(k.c.tone);
      const cx = oneRow ? x + k.w / 2 : CX;
      const cy = oneRow ? y + H / 2 : y + H / 2 + i * (H + 16);
      const chip = boxItem({
        id: `${id}.c${i + 1}`, cx, cy, w: k.w, h: H, radius: H / 2, fill: tint(tone, 0.08), stroke: tone, strokeWidth: 3,
        label: k.c.label, labelFont: chipFont, labelColor: tone === '#0a0a0a' ? '#0a0a0a' : tone, pad: k.pad + k.iconW, labelWidth: k.w - 2 * k.pad - k.iconW,
        ...(k.c.icon ? { labelAlign: 'left' } : {}),
      });
      items.push(chip);
      if (k.c.icon) {
        items.push(iconItem({ id: `${id}.c${i + 1}.icon`, name: k.c.icon, cx: cx - k.w / 2 + k.pad + 18, cy, size: 36, color: tone, disc: false, follow: chip.id }));
      }
      x += k.w + gap;
      w = Math.max(w, oneRow ? rowW : k.w);
    });
    y += oneRow ? H : chips.length * H + (chips.length - 1) * 16;
  }
  return { items, w, h: y };
}

/* ---------------------------------- meter --------------------------------- */

export function layoutMeter(block, { measure, id }) {
  const anyIcon = block.items.some((it) => it.icon);
  const iconCol = anyIcon ? 60 : 0;
  const labelW = 310;
  const trackW = 470;
  const valueW = 150;
  const gap = 24;
  const total = iconCol + labelW + gap + trackW + gap + valueW;
  const left = CX - total / 2;
  const iconX = left + 26;
  const labelX = left + iconCol + labelW / 2;
  const trackLeft = left + iconCol + labelW + gap;
  const valueX = trackLeft + trackW + gap + valueW / 2;
  const labelFont = font({ family: 'DM Sans', size: 28, weight: 700, lineHeight: 1.15 });
  const valueFont = font({ family: 'Space Grotesk', size: 34, weight: 700, lineHeight: 1 });

  const items = [];
  let y = 0;
  block.items.forEach((it, i) => {
    const tone = toneColor(it.tone || block.tone);
    const label = textItem({ id: `${id}.l${i + 1}`, text: it.label, width: labelW, measure, color: '#0a0a0a', font: labelFont, align: 'left', cx: labelX });
    const rowH = Math.max(label.h, 52);
    const cy = y + rowH / 2;
    label.cy = cy;
    if (it.icon) items.push(iconItem({ id: `${id}.i${i + 1}`, name: it.icon, cx: iconX, cy, size: 48, color: tone }));
    const track = boxItem({ id: `${id}.t${i + 1}`, cx: trackLeft + trackW / 2, cy, w: trackW, h: 30, radius: 15, fill: '#efefef', stroke: '#efefef', strokeWidth: 0 });
    const fillW = Math.max(30, Math.round((trackW * it.value) / 100));
    const fill = boxItem({
      id: `${id}.b${i + 1}`, cx: trackLeft + fillW / 2, cy, w: fillW, h: 30, radius: 15, fill: tone, stroke: tone, strokeWidth: 0, follow: track.id,
    });
    const shown = it.display || `${it.value}%`;
    const value = textItem({ id: `${id}.v${i + 1}`, text: shown, width: valueW, measure, color: tone, font: valueFont, align: 'left', cx: valueX });
    value.cy = cy;
    items.push(label, track, fill, value);
    y += rowH + 26;
  });
  y -= 26;

  if (block.total) {
    y += 34;
    const rule = { id: `${id}.rule`, kind: 'rule', cx: CX, cy: y, w: total, h: 0, color: '#0a0a0a', width: 3 };
    items.push(rule);
    y += 30;
    const totalFont = font({ family: 'DM Sans', size: 32, weight: 900, lineHeight: 1.1 });
    const label = textItem({ id: `${id}.total`, text: block.total.label, width: iconCol + labelW + gap + trackW, measure, color: '#0a0a0a', font: totalFont, align: 'left', cx: left + (iconCol + labelW + gap + trackW) / 2 });
    const display = textItem({
      id: `${id}.total.value`, text: block.total.display, width: valueW + 20, measure, color: toneColor(block.tone), font: { ...valueFont, size: 48, weight: 900 }, align: 'left', cx: valueX + 10,
    });
    const rowH = Math.max(label.h, display.h);
    label.cy = y + rowH / 2;
    display.cy = y + rowH / 2;
    items.push(label, display);
    y += rowH;
  }
  return { items, w: total + 40, h: y };
}

/* -------------------------------- eliminate -------------------------------- */

export function layoutEliminate(block, { measure, id }) {
  const n = block.options.length;
  const color = toneColor(block.tone);
  const survive = toneColor('money');
  const chipFont = font({ family: 'Space Grotesk', size: 44, weight: 700, lineHeight: 1.05 });
  const gap = 26;
  const widest = Math.max(...block.options.map((o) => Math.ceil(measure(o, chipFont, 1000).w)));
  const chipW = clamp(widest + 70, 130, Math.floor((1120 - (n - 1) * gap) / n));
  const chipH = 96;
  const rowGap = 24;
  const rowW = n * chipW + (n - 1) * gap;
  const survivor = block.options.findIndex((_, i) => !block.order.includes(i + 1));

  const items = [];
  const rows = block.order.length + 1;
  for (let r = 0; r < rows; r += 1) {
    const out = new Set(block.order.slice(0, r));
    const cy = r * (chipH + rowGap) + chipH / 2;
    block.options.forEach((label, i) => {
      const gone = out.has(i + 1);
      const last = r === rows - 1;
      const win = last && i === survivor;
      const chip = boxItem({
        id: `${id}.r${r + 1}.o${i + 1}`, cx: CX - rowW / 2 + chipW / 2 + i * (chipW + gap), cy, w: chipW, h: chipH, radius: 20,
        fill: gone ? '#f4f4f2' : win ? tint(survive, 0.1) : '#ffffff', stroke: gone ? '#dcdcdc' : win ? survive : '#0a0a0a', strokeWidth: win ? 5 : 3,
        label: gone ? '' : label, labelFont: chipFont, labelColor: win ? survive : '#0a0a0a', pad: 16,
      });
      items.push(chip);
      if (gone) items.push(iconItem({ id: `${id}.r${r + 1}.x${i + 1}`, name: 'x', cx: chip.cx, cy, size: 76, color, disc: false, follow: chip.id }));
    });
  }
  return { items, w: rowW, h: rows * chipH + (rows - 1) * rowGap };
}

/* ---------------------------------- track ---------------------------------- */

export function layoutTrack(block, { measure, id }) {
  const color = toneColor(block.tone);
  const stops = block.stops;
  const n = stops.length;
  const span = 1000;
  const points = n + 2;
  const spacing = span / (points - 1);
  const zigzag = n >= 5; // labels alternate above and below the road when the stops are close
  const labelW = Math.floor(zigzag ? Math.min(210, spacing * 2 - 16) : Math.min(190, spacing - 14));
  const stopFont = font({ family: 'DM Sans', size: 22, weight: 700, lineHeight: 1.1 });
  const endFont = font({ size: 30, weight: 900, lineHeight: 1.1 });
  const xAt = (k) => CX - span / 2 + k * spacing;

  const items = [];
  let y = 0;

  if (block.title) {
    const title = textItem({ id: `${id}.title`, text: block.title, width: SAFE_W, measure, color, font: font({ size: 40, weight: 900, letterSpacing: 40, lineHeight: 1.05 }) });
    title.cy = y + title.h / 2;
    items.push(title);
    y += title.h + 14;
    // A bracket over the whole road: a line with a tick at each end.
    items.push({ id: `${id}.bracket`, kind: 'rule', cx: CX, cy: y, w: span, h: 0, color, width: 4 });
    items.push({ id: `${id}.tick1`, kind: 'rule', cx: CX - span / 2, cy: y + 12, w: 0, h: 24, color, width: 4 });
    items.push({ id: `${id}.tick2`, kind: 'rule', cx: CX + span / 2, cy: y + 12, w: 0, h: 24, color, width: 4 });
    y += 36;
  }

  const labels = stops.map((s, i) => textItem({ id: `${id}.s${i + 1}.label`, text: s.label, width: labelW, measure, color: toneColor(s.tone || block.tone), font: stopFont, cx: xAt(i + 1) }));
  const aboveH = zigzag ? Math.max(0, ...labels.filter((_, i) => i % 2 === 1).map((l) => l.h)) + 20 : 0;
  const endLabels = [block.start, block.end].map((e, i) => textItem({ id: `${id}.${i ? 'end' : 'start'}.label`, text: e.label, width: 200, measure, color: '#0a0a0a', font: endFont, cx: xAt(i ? points - 1 : 0) }));

  const roadY = y + aboveH + 52;
  const endSize = 96;
  const stopSize = 64;
  const nodes = [];

  const mk = (key, name, k, size, tone) => iconItem({ id: key, name: name || 'map-pin', cx: xAt(k), cy: roadY, size, color: tone });
  const start = mk(`${id}.start`, block.start.icon, 0, endSize, '#0a0a0a');
  const finish = mk(`${id}.end`, block.end.icon, points - 1, endSize, toneColor('money'));
  const stopNodes = stops.map((s, i) => mk(`${id}.s${i + 1}`, s.icon || 'triangle-alert', i + 1, stopSize, toneColor(s.tone || block.tone)));
  nodes.push(start, ...stopNodes, finish);

  // The road is one thick pale line under everything; the only arrow is the last leg, into the destination.
  const road = [
    { id: `${id}.road`, kind: 'rule', cx: CX, cy: roadY, w: span, h: 0, color: tint(color, 0.28), width: 12 },
    connector(`${id}.c1`, nodes[nodes.length - 2].id, finish.id, color, { width: 4, gap: 6 }),
  ];

  let bottom = roadY + endSize / 2;
  labels.forEach((l, i) => {
    const above = zigzag && i % 2 === 1;
    l.cy = above ? roadY - stopSize / 2 - 12 - l.h / 2 : roadY + stopSize / 2 + 12 + l.h / 2;
    l.follow = stopNodes[i].id;
    if (!above) bottom = Math.max(bottom, l.cy + l.h / 2);
  });
  // The two ends are named on a tier of their own, clear of every stop label.
  const endTop = bottom + 16;
  endLabels.forEach((l) => { l.cy = endTop + l.h / 2; bottom = Math.max(bottom, l.cy + l.h / 2); });

  endLabels[0].follow = start.id;
  endLabels[1].follow = finish.id;
  items.push(...road, ...nodes, ...labels, ...endLabels);
  return { items, w: span + 200, h: bottom };
}

/* ---------------------------------- zones ---------------------------------- */

export function layoutZones(block, { measure, id }) {
  const inColor = toneColor(block.inside.tone);
  const items = [];
  const pad = 44;
  const frameW = 820;
  const headFont = font({ family: 'IBM Plex Mono', size: 24, weight: 600, letterSpacing: 300, lineHeight: 1.2 });
  const rowFont = font({ size: 36, weight: 700, lineHeight: 1.1 });
  const iconSize = 60;
  const textW = frameW - pad * 2 - iconSize - 26;

  const head = textItem({ id: `${id}.in.head`, text: block.inside.heading.toUpperCase() || ' ', width: frameW - pad * 2, measure, color: inColor, font: headFont });
  const rows = block.inside.items.map((it, i) => {
    const t = textItem({ id: `${id}.in.n${i + 1}`, text: it.label, width: textW, measure, color: '#0a0a0a', font: rowFont, align: 'left', cx: CX - frameW / 2 + pad + iconSize + 26 + textW / 2 });
    return { it, t, h: Math.max(t.h, iconSize) };
  });
  const rowsH = rows.reduce((s, r) => s + r.h, 0) + (rows.length - 1) * 28;
  const frameH = pad + head.h + 34 + rowsH + pad;
  const frame = boxItem({ id: `${id}.in.frame`, cx: CX, cy: frameH / 2, w: frameW, h: frameH, radius: 36, fill: tint(inColor, 0.05), stroke: inColor, strokeWidth: 5 });
  items.push(frame);
  head.cy = pad + head.h / 2;
  head.follow = frame.id;
  items.push(head);
  let y = pad + head.h + 34;
  rows.forEach(({ it, t, h }, i) => {
    t.cy = y + h / 2;
    t.follow = frame.id;
    items.push(t);
    items.push(iconItem({
      id: `${id}.in.n${i + 1}.icon`, name: it.icon || 'check', cx: CX - frameW / 2 + pad + iconSize / 2, cy: y + h / 2, size: iconSize, color: inColor, follow: frame.id,
    }));
    y += h + 28;
  });

  let bottom = frameH;
  let w = frameW;
  if (block.outside) {
    const out = block.outside;
    const outColor = toneColor(out.tone);
    y = frameH + 54;
    const oh = textItem({ id: `${id}.out.head`, text: out.heading.toUpperCase() || ' ', width: SAFE_W, measure, color: MUTED, font: headFont });
    oh.cy = y + oh.h / 2;
    items.push(oh);
    y += oh.h + 26;

    const n = out.items.length;
    const gap = 20;
    const chipW = Math.floor(Math.min(240, (1120 - (n - 1) * gap) / n));
    const labelFont = font({ family: 'DM Sans', size: 24, weight: 700, lineHeight: 1.15 });
    const labelH = Math.max(...out.items.map((it) => Math.ceil(measure(it.label, labelFont, chipW - 32).h)));
    const chipH = labelH + 32 + 56;
    const rowW = n * chipW + (n - 1) * gap;
    out.items.forEach((it, i) => {
      const cx = CX - rowW / 2 + chipW / 2 + i * (chipW + gap);
      const chip = boxItem({
        id: `${id}.out.n${i + 1}`, cx, cy: y + chipH / 2, w: chipW, h: chipH, radius: 20, fill: '#fafafa', stroke: tint(outColor, 0.55), strokeWidth: 3, dash: [10, 8],
        label: it.label, labelFont, labelColor: MUTED, pad: 16, labelWidth: chipW - 32, labelOffsetY: 28,
      });
      items.push(chip);
      items.push(iconItem({ id: `${id}.out.n${i + 1}.icon`, name: it.icon || 'x', cx, cy: y + 16 + 20 + 4, size: 40, color: outColor, disc: false, follow: chip.id }));
    });
    bottom = y + chipH;
    w = Math.max(w, rowW);
  }
  return { items, w, h: bottom };
}
