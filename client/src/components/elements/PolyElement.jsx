import { pointsAttr, pointsFor } from '../../design/shapes.js';

/**
 * Polygons and stars, drawn as one SVG outline so fill, stroke and dash
 * patterns behave exactly as they do on a rectangle. The points are inset by
 * half the stroke width, which keeps the whole shape inside its frame the way
 * `border-box` does everywhere else.
 */
export default function PolyElement({ element }) {
  const p = element.properties || {};
  const stroke = p.borderWidth || 0;
  const points = pointsAttr(pointsFor(element, stroke / 2));

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${element.width} ${element.height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <polygon
        points={points}
        fill={p.fill}
        fillOpacity={p.fillOpacity ?? 1}
        stroke={stroke ? p.borderColor || '#000' : 'none'}
        strokeWidth={stroke}
        strokeDasharray={dashFor(p.strokeStyle, stroke)}
        strokeLinecap={p.strokeStyle === 'dotted' ? 'round' : undefined}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Shared with the shape renderers and the export so patterns match. */
export function dashFor(style, width) {
  if (!width) return undefined;
  if (style === 'dashed') return `${width * 3} ${width * 2}`;
  if (style === 'dotted') return `${width * 0.01} ${width * 2}`;
  return undefined;
}
