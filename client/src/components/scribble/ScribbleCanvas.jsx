import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../lib/cx.js';

/**
 * The sketch surface.
 *
 * An artboard, not a full-bleed drawing area: it holds the aspect ratio of the
 * format being designed, so where you put a mark is where that thing ends up.
 * A canvas that ignored the format would be quietly lying — you would draw a
 * headline across the bottom of a square and get it back somewhere else on a
 * story.
 *
 * The paper is light in both themes. A sketchpad is paper, and inverting it in
 * dark mode would mean the ink colour had to invert too, which makes a saved
 * sketch look different from the one that was drawn.
 */
export default function ScribbleCanvas({
  canvasRef,
  handlers,
  attach,
  aspect,
  tool,
  brushSize,
  color,
  isEmpty,
  disabled = false,
  className,
}) {
  const frameRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState(null);

  /* The artboard is the largest box of the right shape that fits the room it
     is given — measured, because the room changes with the panel, the window
     and the phone's keyboard. */
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    // The frame carries its own padding, and the artboard may only use what
    // is inside it. `getBoundingClientRect()` reports the padded box, which
    // sized the artboard larger than the room it had and clipped the drawing
    // at the edges — most visibly on a phone, where the padding is a real
    // fraction of the width. `contentRect` is the content box exactly.
    const measure = (width, height) => {
      if (!width || !height) return;
      const fitted =
        width / height > aspect
          ? { width: height * aspect, height }
          : { width, height: width / aspect };
      setBox({ width: Math.floor(fitted.width), height: Math.floor(fitted.height) });
    };

    const style = window.getComputedStyle(frame);
    measure(
      frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      frame.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    );

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      measure(rect.width, rect.height);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [aspect]);

  // Re-attach whenever the artboard's logical size changes: the backing store
  // is resized and every stroke repainted at the new scale.
  useEffect(() => {
    if (box.width && box.height) attach(box.width, box.height);
  }, [attach, box.width, box.height]);

  const showRing = !disabled && (tool === 'pen' || tool === 'marker' || tool === 'eraser');
  const ringSize = Math.max(6, brushSize * (tool === 'marker' ? 2.6 : tool === 'eraser' ? 1.9 : 1));

  return (
    <div ref={frameRef} className={cx('relative flex min-h-0 flex-1 items-center justify-center', className)}>
      {box.width > 0 && (
        <div
          className="relative rounded-[3px] shadow-art transition-[width,height] duration-200 ease-out"
          style={{ width: box.width, height: box.height, background: '#FCFBF8' }}
        >
          {/* A faint rule of thirds. Real sketchpads have it and it is exactly
              the grid the layout engine thinks in, so it helps people place
              things where Apollo will read them. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]">
            {[1, 2].map((n) => (
              <span key={`v${n}`} className="absolute top-0 h-full w-px bg-black/[0.055]" style={{ left: `${(n / 3) * 100}%` }} />
            ))}
            {[1, 2].map((n) => (
              <span key={`h${n}`} className="absolute left-0 w-full border-t border-black/[0.055]" style={{ top: `${(n / 3) * 100}%` }} />
            ))}
          </div>

          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Sketch canvas — draw your idea here"
            className={cx(
              'absolute inset-0 h-full w-full rounded-[3px]',
              disabled ? 'cursor-not-allowed' : showRing ? 'cursor-none' : 'cursor-crosshair'
            )}
            // Without this a touch drag scrolls the page instead of drawing.
            style={{ touchAction: 'none' }}
            {...(disabled ? {} : handlers)}
            onPointerMove={(event) => {
              if (!disabled) {
                const rect = event.currentTarget.getBoundingClientRect();
                setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
                handlers.onPointerMove?.(event);
              }
            }}
            onPointerLeave={(event) => {
              setCursor(null);
              if (!disabled) handlers.onPointerLeave?.(event);
            }}
          />

          {/* The brush ring. Mirrors the editor's pixel tools so the two feel
              like the same hand. */}
          {showRing && cursor && (
            <span
              aria-hidden="true"
              className={cx(
                'pointer-events-none absolute rounded-full border',
                tool === 'eraser' ? 'border-black/45 bg-black/[0.04]' : 'border-black/35'
              )}
              style={{
                left: cursor.x - ringSize / 2,
                top: cursor.y - ringSize / 2,
                width: ringSize,
                height: ringSize,
                boxShadow: '0 0 0 1px rgb(255 255 255 / 0.65)',
                ...(tool !== 'eraser' ? { background: `${color}22` } : {}),
              }}
            />
          )}

          {/* The empty state lives on the paper, because that is where someone
              is looking when they do not yet know what to do. It never
              intercepts the first stroke. */}
          {isEmpty && !disabled && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-8 text-center">
              <p className="font-display text-[15px] font-medium tracking-[-0.02em] text-black/30">
                Draw your idea
              </p>
              <p className="max-w-[30ch] text-xs leading-relaxed text-black/25">
                Rough shapes are enough — a box for a photo, a line for a headline. Apollo reads the
                arrangement, not the drawing.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
