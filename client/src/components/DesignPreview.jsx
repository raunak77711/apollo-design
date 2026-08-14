import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx.js';
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

  const elements = [...(doc?.elements || [])]
    .filter((el) => !el.hidden)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

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
          {elements.map((el) => (
            <div
              key={el.id}
              className="absolute"
              style={{
                left: el.x,
                top: el.y,
                width: el.width,
                height: el.height,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                opacity: el.opacity,
              }}
            >
              <ElementRenderer element={el} preview />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
