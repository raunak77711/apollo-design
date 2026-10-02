import { CX, HAIRLINE, MUTED, SAFE_W, SOFT, font, toneColor } from '../theme.js';
import { boxItem, clamp, fitSize, iconItem, range, stack, textItem } from './common.js';

/**
 * title · statement · bigtype · quote · code.
 *
 * Titles and big type are auto-fitted to ≤ 760 wide. The recording is
 * landscape, but a centred 9:16 slice of it becomes the Shorts version, and a
 * headline wider than that slice is a headline cut in half.
 */

const FIT_W = 760;
const TITLE_TARGET = { xl: 128, l: 92, m: 52 };
const TITLE_MIN = { xl: 72, l: 56, m: 36 };

export function layoutTitle(block, { measure, id }) {
  const explicitLines = block.text.split('\n').length;
  const target = TITLE_TARGET[block.size] || 92;
  const min = TITLE_MIN[block.size] || 56;
  const base = font({ weight: 900, lineHeight: 1.02, letterSpacing: -10 });
  const size = fitSize(measure, block.text, base, FIT_W, range(target, min, -4), explicitLines);

  const items = [];
  if (block.icon) {
    const badge = iconItem({ id: `${id}.icon`, name: block.icon, cx: CX, cy: 0, size: block.size === 'm' ? 84 : 120, color: toneColor(block.tone) });
    badge.cy = badge.h / 2;
    items.push(badge);
  }
  if (block.eyebrow) {
    items.push(textItem({
      id: `${id}.eyebrow`, text: block.eyebrow.toUpperCase(), width: SAFE_W, measure, color: MUTED,
      font: font({ family: 'IBM Plex Mono', size: 22, weight: 600, letterSpacing: 300, lineHeight: 1.2 }),
    }));
  }
  items.push(textItem({
    id: `${id}.text`, text: block.text, width: FIT_W, measure, color: toneColor(block.tone), font: { ...base, size },
  }));
  const h = stack(items, 28);
  return { items, w: FIT_W, h };
}

/** The punchline: white words on a black band, so it reads from across the room and on a thumbnail. */
function layoutInverse(block, { measure, id }) {
  const W = 860;
  const pad = 48;
  const base = font({ weight: 900, lineHeight: 1.12, letterSpacing: 10 });
  const size = fitSize(measure, block.text, base, W - pad * 2, [52, 48, 44, 40, 36, 32], 4);
  const labelFont = { ...base, size };
  const h = Math.ceil(measure(block.text, labelFont, W - pad * 2).h) + 76;
  return {
    items: [boxItem({
      id: `${id}.text`, cx: CX, cy: h / 2, w: W, h, radius: 22, fill: '#0a0a0a', stroke: '#0a0a0a', strokeWidth: 0,
      label: block.text, labelFont, labelColor: '#ffffff', pad, labelWidth: W - pad * 2,
    })],
    w: W,
    h,
  };
}

export function layoutStatement(block, ctx) {
  if (block.emphasis === 'inverse') return layoutInverse(block, ctx);
  const { measure, id } = ctx;
  const loud = block.emphasis === 'loud';
  const base = font({ weight: loud ? 900 : 700, lineHeight: 1.12, letterSpacing: loud ? 10 : 0 });
  const sizes = loud ? [56, 52, 48, 44, 40, 36] : [40, 36, 32, 28];
  const size = fitSize(measure, block.text, base, SAFE_W, sizes, loud ? 6 : 5);
  const item = textItem({
    id: `${id}.text`, text: block.text, width: SAFE_W, measure, color: toneColor(block.tone), font: { ...base, size },
  });
  return { items: [item], w: SAFE_W, h: stack([item]) };
}

export function layoutBigtype(block, { measure, id }) {
  const base = font({ family: 'Space Grotesk', weight: 700, lineHeight: 1, letterSpacing: -20 });
  const size = fitSize(measure, block.text, base, FIT_W, range(168, 64, -8), 1);
  const items = [textItem({
    id: `${id}.text`, text: block.text, width: FIT_W, measure, color: toneColor(block.tone), font: { ...base, size },
  })];
  if (block.caption) {
    items.push(textItem({
      id: `${id}.caption`, text: block.caption, width: SAFE_W, measure, color: MUTED,
      font: font({ size: 28, weight: 600, lineHeight: 1.25 }),
    }));
  }
  return { items, w: FIT_W, h: stack(items, 20) };
}

export function layoutQuote(block, { measure, id }) {
  const base = font({ family: 'Source Serif 4', weight: 600, italic: true, lineHeight: 1.25 });
  const size = fitSize(measure, block.text, base, SAFE_W, [42, 38, 34, 30], 4);
  const items = [textItem({ id: `${id}.text`, text: block.text, width: SAFE_W, measure, color: MUTED, font: { ...base, size } })];
  if (block.attribution) {
    items.push(textItem({
      id: `${id}.attribution`, text: block.attribution.toUpperCase(), width: SAFE_W, measure, color: MUTED,
      font: font({ family: 'IBM Plex Mono', size: 18, weight: 600, letterSpacing: 200, lineHeight: 1.2 }),
    }));
  }
  return { items, w: SAFE_W, h: stack(items, 20) };
}

/** Code is evidence, not the story: small, mono, boxed, and never wider than the safe column. */
export function layoutCode(block, { measure, id }) {
  const f = font({ family: 'IBM Plex Mono', size: 20, weight: 400, lineHeight: 1.3 });
  const pad = 28;
  const m = measure(block.text, f, SAFE_W - pad * 2);
  const w = clamp(Math.ceil(m.w) + pad * 2, 260, SAFE_W);
  const boxH = Math.ceil(m.h) + 36;
  const items = [boxItem({
    id: `${id}.box`, cx: CX, cy: boxH / 2, w, h: boxH, radius: 10, fill: SOFT, stroke: HAIRLINE,
    label: block.text, labelFont: f, labelColor: MUTED, pad, labelWidth: w - pad * 2,
  })];
  let h = boxH;
  if (block.caption) {
    const caption = textItem({
      id: `${id}.caption`, text: block.caption, width: SAFE_W, measure, color: MUTED,
      font: font({ family: 'IBM Plex Mono', size: 16, weight: 400, lineHeight: 1.3 }),
    });
    caption.cy = boxH + 14 + caption.h / 2;
    items.push(caption);
    h = boxH + 14 + caption.h;
  }
  return { items, w: block.caption ? SAFE_W : w, h };
}
