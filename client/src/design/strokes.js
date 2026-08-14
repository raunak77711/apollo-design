/**
 * One reading of the stroke properties, shared by every shape renderer so a
 * dashed rectangle and a dashed button are drawn the same way.
 */
export function strokeFor(p = {}) {
  if (!p.borderWidth) return 'none';
  const style = p.strokeStyle && p.strokeStyle !== 'solid' ? p.strokeStyle : 'solid';
  return `${p.borderWidth}px ${style} ${p.borderColor || '#000'}`;
}
