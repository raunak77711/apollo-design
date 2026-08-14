import { cx } from '../lib/cx.js';

/**
 * The format frame — Apollo's signature device. A true-to-ratio hairline
 * rectangle with printer's crop marks, so any canvas size is readable at a
 * glance before you commit to it. Used on Home, the new-design dialog and the
 * template grid.
 */
export function FormatFrame({ width, height, box = 46, className, filled = true }) {
  const scale = box / Math.max(width, height);
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const pad = 7;
  const W = w + pad * 2;
  const H = h + pad * 2;
  const tick = 4;
  const gap = 3;

  const marks = [
    // top-left
    `M${pad - gap - tick} ${pad + 0.5} h${tick} M${pad + 0.5} ${pad - gap - tick} v${tick}`,
    // top-right
    `M${pad + w + gap} ${pad + 0.5} h${tick} M${pad + w - 0.5} ${pad - gap - tick} v${tick}`,
    // bottom-left
    `M${pad - gap - tick} ${pad + h - 0.5} h${tick} M${pad + 0.5} ${pad + h + gap} v${tick}`,
    // bottom-right
    `M${pad + w + gap} ${pad + h - 0.5} h${tick} M${pad + w - 0.5} ${pad + h + gap} v${tick}`,
  ].join(' ');

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      className={cx('overflow-visible', className)}
      aria-hidden="true"
    >
      <rect
        x={pad + 0.5}
        y={pad + 0.5}
        width={w - 1}
        height={h - 1}
        fill="currentColor"
        fillOpacity={filled ? 0.07 : 0}
        stroke="currentColor"
        strokeOpacity="0.45"
      />
      <path d={marks} stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" shapeRendering="crispEdges" />
    </svg>
  );
}
