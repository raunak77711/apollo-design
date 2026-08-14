import { cssImageFilter } from '../../design/imageFilters.js';

/**
 * An image layer. With no source yet it renders as a marked slot — crop marks
 * and a label, matching Apollo's format frames — so a template reads as
 * deliberate rather than broken.
 */
export default function ImageElement({ element, preview }) {
  const p = element.properties;

  if (!p.src) {
    const compact = Math.min(element.width, element.height) < 120;
    return (
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        style={{
          borderRadius: p.borderRadius,
          background: 'rgba(128,128,128,0.14)',
          boxShadow: 'inset 0 0 0 1px rgba(128,128,128,0.35)',
        }}
      >
        {['left-2 top-2 border-l border-t', 'right-2 top-2 border-r border-t', 'left-2 bottom-2 border-l border-b', 'right-2 bottom-2 border-r border-b'].map(
          (pos) => (
            <span key={pos} className={`absolute h-3 w-3 border-[rgba(128,128,128,0.75)] ${pos}`} />
          )
        )}
        {!compact && (
          <span
            className="select-none font-mono uppercase tracking-[0.2em]"
            style={{ color: 'rgba(140,140,140,0.95)', fontSize: Math.max(9, Math.min(13, element.width / 24)) }}
          >
            {preview ? 'Image' : 'Add image'}
          </span>
        )}
      </div>
    );
  }

  // Cropping is a focal point plus a zoom: the frame decides how much is seen,
  // the focal point decides what stays in it. Both survive resizing the layer.
  const cropped = (p.fit || 'cover') === 'cover';
  const focal = `${p.focalX ?? 50}% ${p.focalY ?? 50}%`;
  const zoom = cropped ? p.zoom ?? 1 : 1;

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: p.borderRadius }}>
      <img
        src={p.src}
        alt={p.alt || ''}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: p.fit || 'cover',
          objectPosition: cropped ? focal : undefined,
          transform: zoom > 1 ? `scale(${zoom})` : undefined,
          transformOrigin: focal,
          filter: cssImageFilter(p),
          display: 'block',
          userSelect: 'none',
        }}
      />
    </div>
  );
}
