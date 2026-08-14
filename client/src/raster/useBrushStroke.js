import { useCallback, useRef, useState } from 'react';

/**
 * Turns pointer events on a display `<canvas>` into a stream of stroke points
 * in the CANVAS's own pixel space (not screen/CSS pixels) — the canvas is
 * shown scaled to fit the editor, so every point is converted through the
 * element's bounding box first. Shared by Liquify, Retouch and Draw.
 */
export function useBrushStroke({ onStart, onPoint, onEnd }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [hover, setHover] = useState(null); // { x, y } in canvas pixel space, or null off-canvas

  const toCanvasPoint = useCallback((e) => {
    const el = ref.current;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const scaleX = el.width / box.width;
    const scaleY = el.height / box.height;
    return { x: (e.clientX - box.left) * scaleX, y: (e.clientY - box.top) * scaleY };
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      const point = toCanvasPoint(e);
      if (!point) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = point;
      setHover(point);
      onStart?.(point);
    },
    [toCanvasPoint, onStart]
  );

  const handlePointerMove = useCallback(
    (e) => {
      const point = toCanvasPoint(e);
      if (!point) return;
      setHover(point);
      if (!drawing.current) return;
      onPoint?.(point, last.current);
      last.current = point;
    },
    [toCanvasPoint, onPoint]
  );

  const endStroke = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onEnd?.();
  }, [onEnd]);

  const handlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: endStroke,
    onPointerLeave: () => {
      endStroke();
      setHover(null);
    },
  };

  return { canvasRef: ref, handlers, hover };
}
