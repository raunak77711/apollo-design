export default function LineElement({ element }) {
  const p = element.properties;
  return (
    <div className="w-full h-full flex items-center">
      <div style={{ width: '100%', height: p.strokeWidth || 2, background: p.stroke }} />
    </div>
  );
}
