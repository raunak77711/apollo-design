/**
 * The board, as DeepSeek is allowed to see it in Direct mode: every section,
 * block and *named* part with its id and current label, plus the creator's own
 * annotations. Enough to say "move the browser diagram under the $5 click";
 * nothing else. Labels are short and single-line, and image data never appears
 * (the same lesson as sanitizeForPrompt in the server's DeepSeekProvider).
 */

const CAP = { sections: 20, blocks: 12, parts: 30, annotations: 60, label: 40 };

const clip = (value) => {
  const one = String(value ?? '').replace(/\s+/g, ' ').trim();
  return one.length > CAP.label ? `${one.slice(0, CAP.label - 1)}…` : one;
};

const labelOf = (item) => (item.kind === 'text' ? item.text : item.kind === 'box' || item.kind === 'poly' ? item.label : '');

export function buildSceneOutline({ scene, state }) {
  const partsByBlock = new Map();
  for (const item of scene.items) {
    if (!labelOf(item)) continue;
    if (!partsByBlock.has(item.block)) partsByBlock.set(item.block, []);
    partsByBlock.get(item.block).push(item);
  }

  const sections = state.spec.sections.slice(0, CAP.sections).map((section) => ({
    id: section.id,
    title: clip(section.title),
    blocks: section.blocks.slice(0, CAP.blocks).map((block) => ({
      id: block.id,
      type: block.type,
      ...(state.overrides[block.id]?.deleted ? { hidden: true } : {}),
      parts: (partsByBlock.get(block.id) || []).slice(0, CAP.parts).map((item) => ({
        id: item.id,
        label: clip(state.overrides[item.id]?.text ?? labelOf(item)),
        ...(state.overrides[item.id]?.deleted ? { hidden: true } : {}),
      })),
    })),
  }));

  const annotations = state.annotations.slice(0, CAP.annotations).map((a) => ({
    id: a.id,
    kind: a.kind,
    section: a.section,
    ...(typeof a.json?.text === 'string' && a.json.text ? { label: clip(a.json.text) } : {}),
  }));

  return { title: clip(state.spec.title), sections, annotations };
}
