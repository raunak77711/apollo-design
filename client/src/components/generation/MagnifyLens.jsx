import { useEffect, useRef, useState } from 'react';

/**
 * A circular magnifying lens that follows the pointer over another canvas
 * (`sourceRef`) and shows a scaled-up crop of exactly what's already
 * rendered there. Self-contained: it reads the source canvas's own pixels
 * via `drawImage` — the same technique a screenshot tool uses — so it works
 * over a live WebGL scene without touching that scene's render loop, its
 * shaders, or its GL context at all.
 *
 * While visible it redraws every frame (not just on pointer move), so a
 * lens held still over something that's still animating — the moon
 * drifting, its craters catching the light — stays live rather than
 * freezing on the frame it opened on.
 */
export default function MagnifyLens({ sourceRef, size = 160, zoom = 2.2 }) {
  const lensRef = useRef(null);
  const pointRef = useRef(null);
  const rafRef = useRef(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;

    const draw = () => {
      const source = sourceRef.current;
      const lens = lensRef.current;
      const point = pointRef.current;
      if (!source || !lens || !point) return;

      const rect = source.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      // The source canvas's backing resolution can differ from its CSS
      // size (device pixel ratio, the moon scene's own pixel budget), so
      // the crop has to be taken in the source's own pixel space.
      const scaleX = source.width / rect.width;
      const scaleY = source.height / rect.height;
      const cropW = (size / zoom) * scaleX;
      const cropH = (size / zoom) * scaleY;
      const sx = point.x * scaleX - cropW / 2;
      const sy = point.y * scaleY - cropH / 2;

      const ctx = lens.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.clip();
      try {
        ctx.drawImage(source, sx, sy, cropW, cropH, 0, 0, size, size);
      } catch {
        /* a mid-resize source (0×0 for a tick) is not worth a dropped frame */
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible, sourceRef, size, zoom]);

  const handleMove = (e) => {
    const source = sourceRef.current;
    if (!source) return;
    const rect = source.getBoundingClientRect();
    pointRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (lensRef.current) {
      lensRef.current.style.left = `${pointRef.current.x - size / 2}px`;
      lensRef.current.style.top = `${pointRef.current.y - size / 2}px`;
    }
    setVisible(true);
  };

  return (
    <div className="absolute inset-0 z-10 cursor-none" onPointerMove={handleMove} onPointerLeave={() => setVisible(false)}>
      <canvas
        ref={lensRef}
        width={size}
        height={size}
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full opacity-0 transition-opacity duration-150"
        style={{
          opacity: visible ? 1 : 0,
          boxShadow: '0 0 0 1.5px rgba(255,255,255,0.5), 0 0 0 3px rgba(0,0,0,0.35), 0 10px 32px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  );
}
