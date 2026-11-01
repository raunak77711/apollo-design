import { CX, MUTED, STRONG_LINE, WORLD_W, font, spacingFor } from './theme.js';
import { LAYOUTS } from './blocks/index.js';
import { textItem } from './blocks/common.js';

export { LAYOUTS };

const KICKER_GAP = 56;

/** "SCENE 7" in small mono capitals over a short hairline. Not a block type: the model never sees or places it. */
function layoutKicker(text, { measure, id }) {
  const label = textItem({
    id: `${id}.text`, text: text.toUpperCase(), width: 700, measure, color: MUTED,
    font: font({ family: 'IBM Plex Mono', size: 22, weight: 600, letterSpacing: 300, lineHeight: 1.2 }),
  });
  const rule = { id: `${id}.rule`, kind: 'rule', cx: CX, cy: label.h + 22, w: 72, h: 0, color: STRONG_LINE, width: 3 };
  return { items: [label, rule], w: 700, h: label.h + 24 };
}

/** Code is a footnote to whatever precedes it, so it sits closer than a full block gap. */
const gapBetween = (previous, block, spacing) => (block.type === 'code' ? Math.round(spacing.gap * 0.55) : spacing.gap);

/**
 * spec → scene. Pure: no Fabric, no DOM, no clock. `measure` supplies text
 * metrics, so the same function runs in the browser with real fonts and in
 * tests with a stub.
 *
 * Sections stack top to bottom. Within a section, blocks stack in the model's
 * order with density-driven whitespace; every block is centred on x = 700.
 */
export function layoutBoard(spec, measure) {
  const items = [];
  const blocks = {};
  const sections = [];
  let y = 0;

  spec.sections.forEach((section, index) => {
    const spacing = spacingFor(section.density);
    const top = y;
    let cursor = top + spacing.padTop;
    let previous = null;

    if (section.kicker) {
      // The scene marker ("SCENE 7") the creator reads off to know where they are.
      const id = `${section.id}.b0`;
      const laid = layoutKicker(section.kicker, { measure, id });
      for (const item of laid.items) {
        item.cy += cursor;
        item.block = id;
        item.section = section.id;
        items.push(item);
      }
      blocks[id] = { id, section: section.id, x: CX - laid.w / 2, y: cursor, w: laid.w, h: laid.h };
      cursor += laid.h + KICKER_GAP;
    }

    for (const block of section.blocks) {
      const layout = LAYOUTS[block.type];
      if (!layout) continue;
      const laid = layout(block, { measure, id: block.id, density: section.density });
      if (previous) cursor += gapBetween(previous, block, spacing);

      for (const item of laid.items) {
        if (typeof item.cy === 'number') item.cy += cursor;
        item.block = block.id;
        item.section = section.id;
        items.push(item);
      }
      blocks[block.id] = { id: block.id, section: section.id, x: CX - laid.w / 2, y: cursor, w: laid.w, h: laid.h };
      cursor += laid.h;
      previous = block;
    }

    const height = Math.max(spacing.minHeight, cursor - top + spacing.padBottom);
    sections.push({ id: section.id, title: section.title, index, y: top, height });
    y = top + height;
  });

  return { width: WORLD_W, height: y, sections, blocks, items };
}
