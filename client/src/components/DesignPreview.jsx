import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../lib/cx.js';
import { flattenPaint } from '../design/tree.js';
import { contentFilter, frameStyle, layerState } from '../design/render.js';
import ElementRenderer from './elements/ElementRenderer.jsx';

/**
 * Renders a design document at any size using the real element renderers, so
 * project cards and template tiles are always an exact, live picture of the
 * document — no thumbnail generation, nothing to go stale.
 */
export default function DesignPreview({ document: doc, className, style }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0);
  const canvas = doc?.canvas || { width: 1200, height: 628, background: '#111111' };

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setScale(node.clientWidth / canvas.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [canvas.width]);

  // Previews paint through exactly the same tree walk as the canvas, so a card
  // and the editor can never disagree about order, nesting or visibility.
  const elements = doc?.elements || [];
  const painted = useMemo(() => flattenPaint(elements), [elements]);
  const stateOf = useMemo(() => layerState(elements), [elements]);

  return (
    <div
      ref={ref}
      className={cx('relative overflow-hidden', className)}
      style={{ aspectRatio: `${canvas.width} / ${canvas.height}`, background: canvas.background, ...style }}
    >
      {scale > 0 && (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})` }}
        >
          {painted.map(({ element: el }, index) => {
            const layer = stateOf(el);
            if (layer.hidden) return null;
            return (
              <div key={el.id} className="absolute" style={frameStyle(el, { opacity: layer.opacity, zIndex: index + 1 })}>
                <div className="h-full w-full" style={{ filter: contentFilter(el) }}>
                  <ElementRenderer element={el} preview />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
