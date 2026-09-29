import { CX, WORLD_W, spacingFor } from './theme.js';
import { LAYOUTS } from './blocks/index.js';

export { LAYOUTS };

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
