import { strokeFor } from '../../design/strokes.js';

export default function CircleElement({ element }) {
  const p = element.properties;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: p.fill,
        opacity: p.fillOpacity ?? 1,
        borderRadius: '50%',
        border: strokeFor(p),
        boxSizing: 'border-box',
      }}
    />
  );
}
