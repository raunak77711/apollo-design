/**
 * Annotations and moved pieces are stored relative to the top of the section
 * they belong to, not at a world y. When a section is regenerated and changes
 * height, everything below it must land with its own section, not stay behind
 * at its old absolute position.
 *
 * `sections` is `[{ id, y, height }]`, top to bottom.
 */

/** The section a world y falls in (clamped to the first/last). */
export function sectionAt(sections, y) {
  if (!sections.length) return null;
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (y >= sections[i].y) return sections[i];
  }
  return sections[0];
}

export function toRelative(sections, worldY) {
  const s = sectionAt(sections, worldY);
  return { section: s.id, y: worldY - s.y };
}

/** A missing section (deleted, or a board that shrank) anchors to the last one rather than vanishing. */
export function toWorldY(sections, sectionId, relY) {
  const s = sections.find((x) => x.id === sectionId) || sections[sections.length - 1];
  return s.y + relY;
}
