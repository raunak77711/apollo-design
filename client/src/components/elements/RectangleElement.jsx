export default function RectangleElement({ element }) {
  const p = element.properties;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: p.fill,
        borderRadius: p.borderRadius || 0,
        border: p.borderWidth ? `${p.borderWidth}px solid ${p.borderColor || '#000'}` : 'none',
      }}
    />
  );
}
