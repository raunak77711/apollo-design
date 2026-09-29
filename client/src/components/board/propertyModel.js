/**
 * What the property panel should show for a selection, read off the live
 * Fabric objects (the canvas is the truth while a person is editing). Pure
 * apart from reading properties, so it is tested with plain objects.
 */

const ANNOTATION_MODE = {
  text: 'text', sticky: 'text', shape: 'shape', arrow: 'line', line: 'line', path: 'stroke', highlight: 'stroke', image: 'image',
};

export function modeOf(entry) {
  if (entry.kind === 'annotation') return ANNOTATION_MODE[entry.ann] || 'other';
  if (entry.type === 'textbox') return 'text';
  if (entry.type === 'group') return 'piece';
  return 'other';
}

const isBold = (w) => w === 'bold' || Number(w) >= 600;

export function describeSelection(selection) {
  if (!selection.length) return { mode: 'none', values: {} };
  const modes = new Set(selection.map(modeOf));
  if (modes.size > 1) return { mode: 'mixed', values: {} };
  const mode = [...modes][0];
  const o = selection[0].obj;

  switch (mode) {
    case 'text':
      return {
        mode,
        values: {
          fontFamily: o.fontFamily, fontSize: o.fontSize, bold: isBold(o.fontWeight), italic: o.fontStyle === 'italic',
          underline: Boolean(o.underline), color: o.fill, align: o.textAlign, lineHeight: o.lineHeight, letterSpacing: o.charSpacing,
        },
      };
    case 'shape':
      return {
        mode,
        values: {
          fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth, opacity: o.opacity ?? 1, radius: o.rx, isRect: o.type === 'rect',
        },
      };
    case 'line':
      return {
        mode,
        values: { color: o.color, strokeWidth: o.lineWidth, dashed: Boolean(o.dashed), headEnd: Boolean(o.headEnd), headStart: Boolean(o.headStart) },
      };
    case 'stroke':
      return { mode, values: { color: o.stroke, strokeWidth: o.strokeWidth, opacity: o.opacity ?? 1 } };
    case 'image':
      return { mode, values: { opacity: o.opacity ?? 1 } };
    case 'piece': {
      const [shape = {}, label = {}] = o.getObjects ? o.getObjects() : [];
      return {
        mode,
        values: { fill: shape.fill, stroke: shape.stroke, strokeWidth: shape.strokeWidth, opacity: o.opacity ?? 1, color: label.fill, fontSize: label.fontSize },
      };
    }
    default:
      return { mode: 'other', values: {} };
  }
}
