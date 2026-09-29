import { CX, HAIRLINE, MUTED, SAFE_W, SOFT, STRONG_LINE, font, toneColor } from '../theme.js';
import { boxItem, clamp, textItem } from './common.js';

/**
 * hub · cards · compare · panels · browser — things that sit side by side.
 * These are the wide diagrams: they may run past the 700 text column, but
 * every one is built symmetrically about x = 700 so a centred crop still
 * catches its spine.
 */

const connector = (id, from, to, color, over = {}) => ({
  id, kind: 'connector', from, to, color, width: 2, head: false, gap: 0, ...over,
});

/* ---------------------------------- hub ---------------------------------- */

export function layoutHub(block, { measure, id, density }) {
  const n = block.nodes.length;
  const R = clamp(170 + n * 22, 300, 470);
  const rx = Math.min(Math.round(R * 1.3), 540);
  const nodeFont = font({ family: 'DM Sans', size: 22, weight: 700, lineHeight: 1.15 });
  const centerFont = font({ family: 'Space Grotesk', size: 30, weight: 700, lineHeight: 1.1 });

  const sizes = block.nodes.map((node) => {
    const m = measure(node.label, nodeFont, 190);
    return { w: clamp(Math.ceil(m.w) + 40, 130, 230), h: Math.ceil(m.h) + 30 };
  });
  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  const cy0 = R + maxH / 2;

  const cm = measure(block.center, centerFont, 260);
  const cw = clamp(Math.ceil(cm.w) + 64, 200, 324);
  const centerColor = toneColor(block.tone);
  const center = boxItem({
    id: `${id}.center`, cx: CX, cy: cy0, w: cw, h: Math.ceil(cm.h) + 44, radius: 20, fill: centerColor, stroke: centerColor,
    strokeWidth: 0, label: block.center, labelFont: centerFont, labelColor: '#ffffff', pad: 32,
  });

  const nodes = block.nodes.map((node, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return boxItem({
      id: `${id}.n${i + 1}`, cx: CX + rx * Math.cos(angle), cy: cy0 + R * Math.sin(angle), w: sizes[i].w, h: sizes[i].h,
      stroke: '#0a0a0a', label: node.label, labelFont: nodeFont, labelColor: '#0a0a0a', pad: 20,
    });
  });

  const spokes = nodes.map((node, i) => connector(`${id}.s${i + 1}`, center.id, node.id, '#c7c7c7'));

  const cross = [];
  if (block.links === 'spokes+cross') {
    const hops = density >= 4 && n >= 6 ? [3, Math.floor(n / 2)] : [3];
    const seen = new Set();
    for (const hop of hops) {
      for (let i = 0; i < n; i += 1) {
        const j = (i + hop) % n;
        const key = [i, j].sort((a, b) => a - b).join('-');
        if (j === i || seen.has(key)) continue;
        seen.add(key);
        cross.push(connector(`${id}.x${cross.length + 1}`, nodes[i].id, nodes[j].id, '#d9d9d9', { width: 1 }));
      }
    }
  }
  return { items: [...cross, ...spokes, ...nodes, center], w: 2 * rx + maxW, h: 2 * R + maxH };
}

/* --------------------------------- cards --------------------------------- */

export function layoutCards(block, { measure, id }) {
  const count = block.items.length;
  const cols = Math.min(block.columns, count);
  const gap = 24;
  const pad = 20;
  const labelFont = font({ family: 'DM Sans', size: 24, weight: 700, lineHeight: 1.2 });
  const tagFont = font({ family: 'IBM Plex Mono', size: 16, weight: 600, letterSpacing: 120, lineHeight: 1.2 });

  // A card is at least as wide as its longest single word: a Textbox wraps
  // between words, never inside one.
  const longestWord = Math.max(...block.items.flatMap((it) => it.label.split(/s+/).map((w) => measure(w, labelFont, 10000).w)));
  const cardW = Math.max(Math.min(260, Math.floor((900 - (cols - 1) * gap) / cols)), Math.ceil(longestWord) + pad * 2);

  const anyTag = block.items.some((it) => it.tag);
  const labelH = Math.max(...block.items.map((it) => Math.ceil(measure(it.label, labelFont, cardW - pad * 2).h)));
  const cardH = Math.max(anyTag ? 128 : 92, labelH + pad * 2 + (anyTag ? 30 : 0));
  const rows = Math.ceil(count / cols);

  const items = block.items.map((it, i) => {
    const r = Math.floor(i / cols);
    const k = i % cols;
    const inRow = Math.min(cols, count - r * cols);
    const rowW = inRow * cardW + (inRow - 1) * gap;
    return boxItem({
      id: `${id}.n${i + 1}`, cx: CX - rowW / 2 + cardW / 2 + k * (cardW + gap), cy: r * (cardH + gap) + cardH / 2,
      w: cardW, h: cardH, radius: 16, label: it.label, labelFont, labelColor: '#0a0a0a', labelAlign: 'left', pad,
      tag: it.tag || '', tagFont, tagColor: toneColor(it.tone || block.tone), tagAlign: 'bottom-left',
    });
  });
  return { items, w: cols * cardW + (cols - 1) * gap, h: rows * cardH + (rows - 1) * gap };
}

/* -------------------------------- compare -------------------------------- */

export function layoutCompare(block, { measure, id }) {
  const colW = 380;
  const gapMid = 140;
  const offset = gapMid / 2 + colW / 2;
  const headFont = font({ size: 28, weight: 900, letterSpacing: 60, lineHeight: 1.1 });
  const stepFont = font({ size: 28, weight: 700, lineHeight: 1.1 });
  const footFont = font({ family: 'IBM Plex Mono', size: 16, weight: 400, lineHeight: 1.3 });

  const build = (side, key, cx) => {
    const color = toneColor(side.tone);
    const items = [];
    let y = 0;
    const head = textItem({ id: `${id}.${key}.head`, text: side.heading || ' ', width: colW, measure, color, font: headFont, cx });
    head.cy = y + head.h / 2;
    y += head.h + 44;
    items.push(head);

    const steps = side.steps.map((step, i) => {
      const t = textItem({ id: `${id}.${key}.n${i + 1}`, text: step.label, width: colW, measure, color: toneColor(step.tone || side.tone), font: stepFont, cx });
      t.cy = y + t.h / 2;
      y += t.h + (i < side.steps.length - 1 ? 64 : 0);
      return t;
    });
    items.push(...steps);
    const connectors = steps.slice(0, -1).map((t, i) => connector(`${id}.${key}.c${i + 1}`, t.id, steps[i + 1].id, color, { width: 3, head: true, gap: 10 }));

    if (side.footnote) {
      const foot = textItem({ id: `${id}.${key}.foot`, text: side.footnote, width: colW, measure, color: MUTED, font: footFont, cx });
      foot.cy = y + 28 + foot.h / 2;
      y += 28 + foot.h;
      items.push(foot);
    }
    return { items, connectors, h: y };
  };

  const left = build(block.left, 'l', CX - offset);
  const right = build(block.right, 'r', CX + offset);
  const h = Math.max(left.h, right.h);
  const divider = { id: `${id}.divider`, kind: 'rule', cx: CX, cy: h / 2, w: 0, h, color: HAIRLINE, width: 2 };
  return {
    items: [divider, ...left.connectors, ...right.connectors, ...left.items, ...right.items],
    w: colW * 2 + gapMid,
    h,
  };
}

/* --------------------------------- panels --------------------------------- */

export function layoutPanels(block, { measure, id }) {
  const count = block.panels.length;
  const pw = count === 1 ? 460 : count === 2 ? 400 : 300;
  const gap = 40;
  const pad = 26;
  const innerW = pw - pad * 2;
  const headFont = font({ family: 'IBM Plex Mono', size: 22, weight: 600, letterSpacing: 200, lineHeight: 1.2 });
  const rowFont = font({ family: 'DM Sans', size: 24, weight: 600, lineHeight: 1.2 });
  const tagFont = font({ family: 'IBM Plex Mono', size: 16, weight: 600, letterSpacing: 100, lineHeight: 1.2 });
  const rowLabelW = innerW - 32 - 120; // room for the tag on the right

  const built = block.panels.map((panel) => {
    const head = measure(panel.heading || ' ', headFont, innerW);
    const rows = panel.rows.map((row) => ({ row, h: Math.max(64, Math.ceil(measure(row.label, rowFont, rowLabelW).h) + 28) }));
    const rowsH = rows.reduce((s, r) => s + r.h, 0) + (rows.length - 1) * 14;
    return { panel, head, rows, h: pad + Math.ceil(head.h) + 22 + rowsH + pad };
  });
  const panelH = Math.max(...built.map((b) => b.h));
  const total = count * pw + (count - 1) * gap;

  const items = [];
  built.forEach(({ panel, head, rows }, k) => {
    const cx = CX - total / 2 + pw / 2 + k * (pw + gap);
    const color = toneColor(panel.tone);
    const frame = boxItem({ id: `${id}.p${k + 1}`, cx, cy: panelH / 2, w: pw, h: panelH, radius: 22, stroke: color, strokeWidth: 3 });
    const heading = textItem({
      id: `${id}.p${k + 1}.head`, text: panel.heading || ' ', width: innerW, measure, color, font: headFont, align: 'left', cx,
    });
    heading.cy = pad + head.h / 2;
    heading.follow = frame.id;
    items.push(frame, heading);

    let y = pad + Math.ceil(head.h) + 22;
    rows.forEach(({ row, h }, j) => {
      const locked = row.state === 'locked';
      const rowColor = locked ? MUTED : color;
      const box = boxItem({
        id: `${id}.p${k + 1}.r${j + 1}`, cx, cy: y + h / 2, w: innerW, h, radius: 12,
        fill: locked ? '#efefef' : '#ffffff', stroke: locked ? STRONG_LINE : color, strokeWidth: 2,
        label: row.label, labelFont: rowFont, labelColor: locked ? MUTED : '#0a0a0a', labelAlign: 'left', pad: 16,
        labelWidth: rowLabelW, tag: locked ? 'LOCKED' : 'EDITABLE', tagFont, tagColor: rowColor, tagAlign: 'right',
      });
      box.follow = frame.id;
      items.push(box);
      y += h + 14;
    });
  });
  return { items, w: total, h: panelH };
}

/* --------------------------------- browser -------------------------------- */

export function layoutBrowser(block, { measure, id }) {
  const W = 760;
  const barH = 64;
  const bodyH = 420;
  const H = barH + bodyH;
  const items = [];
  let top = 0;

  if (block.title) {
    const title = textItem({ id: `${id}.title`, text: block.title, width: SAFE_W, measure, color: '#0a0a0a', font: font({ size: 30, weight: 700, lineHeight: 1.15 }) });
    title.cy = title.h / 2;
    items.push(title);
    top = title.h + 24;
  }

  const frame = boxItem({ id: `${id}.frame`, cx: CX, cy: top + H / 2, w: W, h: H, radius: 20, stroke: STRONG_LINE, strokeWidth: 3 });
  const follower = (item) => ({ ...item, follow: frame.id });
  items.push(frame);
  items.push(follower({ id: `${id}.bar`, kind: 'rule', cx: CX, cy: top + barH, w: W, h: 0, color: HAIRLINE, width: 2 }));
  for (let d = 0; d < 3; d += 1) {
    items.push(follower(boxItem({
      id: `${id}.dot${d + 1}`, cx: CX - W / 2 + 34 + d * 26, cy: top + barH / 2, w: 14, h: 14, radius: 7,
      fill: STRONG_LINE, stroke: STRONG_LINE, strokeWidth: 0,
    })));
  }
  const pillW = W - 150;
  items.push(follower(boxItem({
    id: `${id}.url`, cx: CX - W / 2 + 120 + pillW / 2 - 6, cy: top + barH / 2, w: pillW - 12, h: 36, radius: 18,
    fill: SOFT, stroke: SOFT, strokeWidth: 0, label: block.url || '', labelFont: font({ family: 'IBM Plex Mono', size: 18, weight: 400, lineHeight: 1.2 }),
    labelColor: MUTED, pad: 18,
  })));
  if (block.placeholder === 'screenshot') {
    items.push(follower({
      ...boxItem({
        id: `${id}.body`, cx: CX, cy: top + barH + bodyH / 2, w: W - 48, h: bodyH - 48, radius: 12, fill: '#fafafa',
        stroke: STRONG_LINE, strokeWidth: 2, label: 'Drop a screenshot here', labelFont: font({ size: 24, weight: 600, lineHeight: 1.2 }),
        labelColor: MUTED, pad: 24,
      }),
      dash: [10, 8],
      drop: true,
    }));
  }

  let h = top + H;
  if (block.note) {
    const note = textItem({
      id: `${id}.note`, text: block.note, width: SAFE_W, measure, color: MUTED,
      font: font({ family: 'IBM Plex Mono', size: 18, weight: 400, lineHeight: 1.3 }),
    });
    note.cy = h + 20 + note.h / 2;
    h += 20 + note.h;
    items.push(note);
  }
  return { items, w: W, h };
}
