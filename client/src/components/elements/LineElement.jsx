export default function LineElement({ element }) {
  const p = element.properties;
  const width = p.strokeWidth || 2;
  // A dashed or dotted line is drawn as a border so the pattern scales with the
  // stroke width, exactly as it does for shapes.
  const style = p.strokeStyle && p.strokeStyle !== 'solid' ? p.strokeStyle : null;
  return (
    <div className="w-full h-full flex items-center">
      <div
        style={
          style
            ? { width: '100%', height: 0, borderTop: `${width}px ${style} ${p.stroke}` }
            : { width: '100%', height: width, background: p.stroke }
        }
      />
    </div>
  );
}
