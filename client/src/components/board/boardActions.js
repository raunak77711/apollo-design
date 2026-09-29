/** Small, pure helpers behind the page's file and section actions. */

export function slugify(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'board';
}

/** Has the person moved, edited or deleted anything in this section? `s1` must not match `s13`. */
export function sectionHasWork(state, sectionId) {
  return Object.keys(state.overrides).some((id) => id.startsWith(`${sectionId}.`));
}

/** What the server needs to rebuild one section: the outline, without the blocks. */
export function outlineFromSpec(spec) {
  return {
    title: spec.title,
    audience: spec.audience || '',
    sections: spec.sections.map(({ title, beat, density }) => ({ title, beat, density })),
  };
}

export function downloadText(filename, text, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
