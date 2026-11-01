/**
 * Ids. Presentation pieces are `s3.b2.n5` (section, block, part) and are
 * deterministic from the spec, so a re-layout never loses a user's change.
 * Annotations are `a_…` and connections `c_…`.
 */

let counter = 0;

export const newAnnotationId = () => `a_${Date.now().toString(36)}${(counter++).toString(36)}`;
export const isAnnotationId = (id) => typeof id === 'string' && id.startsWith('a_');

/** 's3.b2.n5' → 's3.b2'; anything that is not a piece id → null. */
export function blockIdOf(id) {
  const m = /^(s\d+\.b\d+)/.exec(String(id));
  return m ? m[1] : null;
}

export function sectionIdOf(id) {
  const m = /^(s\d+)(?:\.|$)/.exec(String(id));
  return m ? m[1] : null;
}
