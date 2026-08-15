import { paintFor } from '../../design/color.js';
import { strokeFor } from '../../design/strokes.js';

export default function RectangleElement({ element }) {
  const p = element.properties;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: paintFor(p),
        opacity: p.fillOpacity ?? 1,
        borderRadius: p.borderRadius || 0,
        border: strokeFor(p),
        boxSizing: 'border-box',
      }}
    />
  );
}
