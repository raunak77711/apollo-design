import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The drawing engine behind Scribble → Design.
 *
 * Strokes are kept as **points, not pixels**. Every other pixel tool in Apollo
 * (`raster/`) paints straight onto a canvas and snapshots ImageData to undo,
 * which is right for retouching a photograph — the pixels *are* the document
 * there. A scribble is different: it is a short-lived sketch that has to be
 * undoable dozens of times, redrawn whenever the canvas is resized, saved into
 * a version, restored later, and exported at a resolution nobody chose while
 * drawing. Vectors make all of that nearly free, where an ImageData history of
 * a full-bleed canvas would cost megabytes a stroke.
 *
 * Smoothness comes from three things:
 *
 *   1. **Coalesced events.** A 120Hz pointer delivers several samples per
 *      frame; `getCoalescedEvents()` hands over the ones the browser batched,
 *      so a fast line is captured as a curve rather than as the four points
 *      that survived to a frame boundary.
 *   2. **Midpoint curves.** Each segment is a quadratic through the midpoints
 *      of consecutive samples, which is the cheapest way to get a genuinely
 *      smooth line out of a jittery input device.
 *   3. **Incremental painting.** A live stroke only ever draws its newest
 *      segment. The whole scene is repainted on undo, redo, clear and resize —
 *      never on pointer move.
 *
 * Pressure is honoured where the hardware reports it (stylus), and ignored
 * gracefully where it does not (mouse reports a constant 0.5).
 */

/** Strokes past this are dropped from history — a sketch, not a manuscript. */
const MAX_STROKES = 600;

/** How each tool behaves. Deliberately few: this is a sketchpad, not a paint app. */
const TOOL_SPEC = {
  pen: { composite: 'source-over', alpha: 1, widthScale: 1, pressure: 0.55 },
  // A marker lays down a wide, slightly transparent band — what people reach
  // for to block out where a photograph or a colour field goes.
  marker: { composite: 'source-over', alpha: 0.42, widthScale: 2.6, pressure: 0.2 },
  eraser: { composite: 'destination-out', alpha: 1, widthScale: 1.9, pressure: 0 },
};

export function useScribbleCanvas({ color = '#111111', size = 6, tool = 'pen' } = {}) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);
  const undone = useRef([]);
  const current = useRef(null);
  const drawing = useRef(false);
  const raf = useRef(0);

  // The live settings, read inside pointer handlers without re-binding them.
  const settings = useRef({ color, size, tool });
  settings.current = { color, size, tool };

  // Counters rather than the arrays themselves: the UI only needs to know
  // whether undo/redo are available and whether anything has been drawn, and
  // re-rendering the page on every point would defeat the whole design.
  const [counts, setCounts] = useState({ strokes: 0, undone: 0 });
  // Whether the canvas has been measured and sized. Restoring a saved sketch
  // has to wait for this: strokes are stored in 0..1 and are scaled up by the
  // artboard's size, which is zero until it has been laid out.
  const [ready, setReady] = useState(false);
  const sync = useCallback(() => {
    setCounts({ strokes: strokes.current.length, undone: undone.current.length });
  }, []);

  /* ------------------------------ painting ------------------------------- */

  const context = () => canvasRef.current?.getContext('2d') || null;

  /** Paint one stroke, whole. Used by the full repaint. */
  const paintStroke = useCallback((ctx, stroke) => {
    const spec = TOOL_SPEC[stroke.tool] || TOOL_SPEC.pen;
    ctx.save();
    ctx.globalCompositeOperation = spec.composite;
    ctx.globalAlpha = spec.alpha;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const points = stroke.points;
    if (points.length === 1) {
      // A tap is a dot, not nothing.
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, widthAt(stroke, points[0]) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    for (let i = 1; i < points.length; i += 1) paintSegment(ctx, stroke, points, i);
    ctx.restore();
  }, []);

  /**
   * One segment of a stroke, as a quadratic curve through the midpoints of the
   * samples either side of it. Width is interpolated per segment, which is
   * what lets a pressure-sensitive line taper instead of stepping.
   */
  const paintSegment = (ctx, stroke, points, i) => {
    const prev = points[i - 1];
    const point = points[i];
    const before = points[i - 2] || prev;

    const from = { x: (before.x + prev.x) / 2, y: (before.y + prev.y) / 2 };
    const to = { x: (prev.x + point.x) / 2, y: (prev.y + point.y) / 2 };

    ctx.lineWidth = (widthAt(stroke, prev) + widthAt(stroke, point)) / 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(prev.x, prev.y, to.x, to.y);
    ctx.stroke();
  };

  /** Repaint everything. Only on undo, redo, clear, restore and resize. */
  const repaint = useCallback(() => {
    const ctx = context();
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const scale = ctx.canvas.width / (canvasRef.current.__logicalWidth || ctx.canvas.width);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    for (const stroke of strokes.current) paintStroke(ctx, stroke);
    if (current.current) paintStroke(ctx, current.current);
  }, [paintStroke]);

  /* ------------------------------ the stroke ------------------------------ */

  const begin = useCallback((point) => {
    const { color: strokeColor, size: strokeSize, tool: strokeTool } = settings.current;
    drawing.current = true;
    // Starting a new stroke is what discards the redo branch — the same rule
    // the editor's own history uses.
    undone.current = [];
    current.current = {
      tool: strokeTool,
      color: strokeTool === 'eraser' ? '#000000' : strokeColor,
      size: strokeSize,
      points: [point],
    };
    const ctx = context();
    if (ctx) paintStroke(ctx, current.current);
  }, [paintStroke]);

  const extend = useCallback((points) => {
    const stroke = current.current;
    if (!stroke || !points.length) return;
    const ctx = context();
    if (!ctx) return;

    const spec = TOOL_SPEC[stroke.tool] || TOOL_SPEC.pen;
    ctx.save();
    ctx.globalCompositeOperation = spec.composite;
    ctx.globalAlpha = spec.alpha;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const point of points) {
      const last = stroke.points[stroke.points.length - 1];
      // Sub-pixel duplicates are what a stationary finger produces; they cost
      // memory and add nothing to the line.
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.6) continue;
      stroke.points.push(point);
      if (stroke.points.length > 1) paintSegment(ctx, stroke, stroke.points, stroke.points.length - 1);
    }
    ctx.restore();
  }, []);

  const end = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    const stroke = current.current;
    current.current = null;
    if (!stroke) return;
    strokes.current.push(stroke);
    if (strokes.current.length > MAX_STROKES) strokes.current.shift();
    sync();
  }, [sync]);

  /* ------------------------------- handlers ------------------------------- */

  const toLocal = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    const width = canvas.__logicalWidth || box.width;
    const height = canvas.__logicalHeight || box.height;
    return {
      x: ((event.clientX - box.left) / box.width) * width,
      y: ((event.clientY - box.top) / box.height) * height,
      // A mouse reports 0.5 and a finger often 0 or 1; only a real stylus
      // varies, so anything else is normalised to "no pressure information".
      pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5,
    };
  }, []);

  const onPointerDown = useCallback(
    (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      const point = toLocal(event);
      if (!point) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      begin(point);
    },
    [begin, toLocal]
  );

  const onPointerMove = useCallback(
    (event) => {
      if (!drawing.current) return;
      event.preventDefault();
      // Everything the browser batched since the last frame, so a fast line is
      // a curve rather than four points and a straight edge.
      const raw = typeof event.nativeEvent?.getCoalescedEvents === 'function'
        ? event.nativeEvent.getCoalescedEvents()
        : [event.nativeEvent || event];
      const points = raw.map(toLocal).filter(Boolean);
      extend(points.length ? points : [toLocal(event)].filter(Boolean));
    },
    [extend, toLocal]
  );

  const onPointerUp = useCallback(() => end(), [end]);

  const handlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onPointerLeave: onPointerUp,
  };

  /* -------------------------------- history ------------------------------- */

  const undo = useCallback(() => {
    if (!strokes.current.length) return;
    undone.current.push(strokes.current.pop());
    repaint();
    sync();
  }, [repaint, sync]);

  const redo = useCallback(() => {
    if (!undone.current.length) return;
    strokes.current.push(undone.current.pop());
    repaint();
    sync();
  }, [repaint, sync]);

  const clear = useCallback(() => {
    if (!strokes.current.length) return;
    // Clearing is undoable in one step, because clearing by accident after ten
    // minutes of drawing is the worst thing this page could do to someone.
    undone.current = strokes.current.slice().reverse();
    strokes.current = [];
    repaint();
    sync();
  }, [repaint, sync]);

  /* ------------------------------- lifecycle ------------------------------ */

  /**
   * Point the engine at a canvas of a given logical size. Called on mount and
   * whenever the artboard's aspect changes; the backing store is sized for the
   * display so lines are crisp on a retina screen, while every stroke stays in
   * logical coordinates and survives the change.
   */
  const attach = useCallback(
    (logicalWidth, logicalHeight) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.__logicalWidth = logicalWidth;
      canvas.__logicalHeight = logicalHeight;
      canvas.width = Math.round(logicalWidth * dpr);
      canvas.height = Math.round(logicalHeight * dpr);
      repaint();
      setReady(true);
    },
    [repaint]
  );

  /**
   * Replace the drawing wholesale — restoring a saved sketch.
   *
   * Strokes arrive in the 0..1 space `snapshot` wrote them in, so a sketch
   * drawn on a laptop restores correctly on a phone, on a different format, or
   * simply in a resized window. Anything already in pixel space (a stroke that
   * never left this session) is passed through untouched.
   */
  const load = useCallback(
    (source) => {
      const canvas = canvasRef.current;
      const width = canvas?.__logicalWidth || 1;
      const height = canvas?.__logicalHeight || 1;

      strokes.current = (Array.isArray(source) ? source : []).map((stroke) => ({
        ...stroke,
        size: (stroke.size / 1000) * width,
        points: (stroke.points || []).map((point) => ({
          ...point,
          x: point.x * width,
          y: point.y * height,
        })),
      }));
      undone.current = [];
      current.current = null;
      repaint();
      sync();
    },
    [repaint, sync]
  );

  /**
   * The drawing as an image, ready to send.
   *
   * Rendered fresh at the requested size rather than lifted off the display
   * canvas: the sketch has to be legible to a vision model, and the display
   * canvas is whatever size the browser window happened to be. Transparent,
   * because a scribble is ink on nothing — which is also what lets the reader
   * measure ink by alpha rather than guessing at a background colour.
   */
  const toDataUrl = useCallback(
    ({ width, height, background = null } = {}) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const logicalWidth = canvas.__logicalWidth || canvas.width;
      const logicalHeight = canvas.__logicalHeight || canvas.height;
      const outWidth = Math.round(width || logicalWidth);
      const outHeight = Math.round(height || logicalHeight);

      const out = document.createElement('canvas');
      out.width = outWidth;
      out.height = outHeight;
      const ctx = out.getContext('2d');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, outWidth, outHeight);
      }
      ctx.scale(outWidth / logicalWidth, outHeight / logicalHeight);
      for (const stroke of strokes.current) paintStroke(ctx, stroke);
      return out.toDataURL('image/png');
    },
    [paintStroke]
  );

  /**
   * The strokes themselves, for saving a version that can be drawn on again.
   *
   * Coordinates are normalised to 0..1 on the way out. The artboard's pixel
   * size is an accident of the window it was drawn in, and storing that
   * accident would mean a restored sketch landed in the wrong place on any
   * other screen.
   */
  const snapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const width = canvas?.__logicalWidth || 1;
    const height = canvas?.__logicalHeight || 1;
    return strokes.current.map((stroke) => ({
      tool: stroke.tool,
      color: stroke.color,
      // Sizes are in pixels of that same accidental space, so they scale with it.
      size: (stroke.size / width) * 1000,
      points: stroke.points.map((point) => ({
        x: point.x / width,
        y: point.y / height,
        pressure: point.pressure,
      })),
    }));
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return {
    canvasRef,
    handlers,
    attach,
    load,
    undo,
    redo,
    clear,
    toDataUrl,
    snapshot,
    repaint,
    ready,
    canUndo: counts.strokes > 0,
    canRedo: counts.undone > 0,
    isEmpty: counts.strokes === 0,
    strokeCount: counts.strokes,
  };
}

/** Stroke width at a point: the tool's scale, modulated by pressure if real. */
function widthAt(stroke, point) {
  const spec = TOOL_SPEC[stroke.tool] || TOOL_SPEC.pen;
  const base = stroke.size * spec.widthScale;
  if (!spec.pressure) return base;
  // Pressure moves the width around the nominal size rather than scaling from
  // zero, so a light touch still leaves a visible line.
  const factor = 1 - spec.pressure + point.pressure * spec.pressure * 2;
  return Math.max(0.75, base * factor);
}
