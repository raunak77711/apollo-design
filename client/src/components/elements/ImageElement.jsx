import { cssImageFilter } from '../../design/imageFilters.js';

export default function ImageElement({ element }) {
  const p = element.properties;
  const filter = cssImageFilter(p);

  if (!p.src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-500 text-sm select-none"
           style={{ borderRadius: p.borderRadius }}>
        No image
      </div>
    );
  }

  return (
    <img
      src={p.src}
      alt={p.alt || ''}
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: p.fit || 'cover',
        borderRadius: p.borderRadius,
        filter,
        display: 'block',
        userSelect: 'none',
      }}
    />
  );
}
