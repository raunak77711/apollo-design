import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Eraser, PaintBucket, Pencil, Shapes as ShapesIcon, X, Brush as BrushIcon } from 'lucide-react';
import { useEditor } from '../../state/EditorContext.jsx';
import { isCanvasReadable, loadImage } from '../../raster/imageIO.js';
import { drawSegment, floodFill, PEN_MODE_IDS } from '../../raster/draw.js';
import { drawRasterShape, SHAPE_TYPES } from '../../raster/rasterShapes.js';
import { useBrushStroke } from '../../raster/useBrushStroke.js';
import { Button, IconButton } from '../../ui/primitives.jsx';
import { SliderField, ColorField, TextField, Toggle } from '../../ui/fields.jsx';
import { useEscape } from '../../ui/overlay.jsx';
import { flattenPaint } from '../../design/tree.js';
import { api } from '../../api/client.js';
import { useToast } from '../../lib/toast.jsx';
import { Spark } from '../../ui/brand.jsx';
import DesignPreview from '../DesignPreview.jsx';

/** Room around the scaled document inside the viewport, in CSS px. */
const STAGE_PADDING = 40;

const TOOLS = [
  { id: 'brush', label: 'Brush', icon: BrushIcon },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'fill', label: 'Fill', icon: PaintBucket },
  { id: 'shape', label: 'Shape', icon: ShapesIcon },
];

const PEN_LABELS = {
  plain: 'Plain', parallel: 'Parallel', sketchy: 'Sketchy', shaded: 'Shaded',
  furry: 'Furry', trail: 'Trail', crayon: 'Crayon', ink: 'Ink',
};
const SHAPE_LABELS = { rectangle: 'Square', circle: 'Circle', triangle: 'Triangle', star: 'Star', heart: 'Heart', line: 'Line' };

/**
 * A real, pixel-level drawing session bound to one image element — a blank
 * canvas for a fresh layer, or the element's existing picture to draw on top
 * of. Every tool paints straight onto a working canvas; nothing touches the
 * document until Apply, matching the Adjust/Liquify/Retouch tabs.
 *
 * The rest of the document renders behind it (via `DesignPreview`, the same
 * read-only whole-document renderer project cards use) at the same scale, so
 * the target element's own box lines up exactly with where it actually sits —
 * painting happens with the surrounding text and layers in view, not blind on
 * an isolated crop.
 *
 * Renders inline in the editor's main row (TopBar and the tool rail stay put
 * around it) rather than as a full-screen takeover, so it reads as a tab —
 * Home and every other tool button stay one click away while drawing.
 */
export default function DrawStudio({ elementId, onClose, scribbleMode = false }) {
  const { state, actions } = useEditor();
  const toast = useToast();
  const element = state.document.elements.find((el) => el.id === elementId);
  const canvas = state.document.canvas;

  // Split the rest of the document around the target's own paint position —
  // a headline that's meant to sit ON TOP of this photo (a full-bleed hero,
  // say) has to stay on top of the editable box too, not get buried under it.
  const { belowDoc, aboveDoc } = useMemo(() => {
    const elements = state.document.elements;
    const painted = flattenPaint(elements);
    const at = painted.findIndex((p) => p.element.id === elementId);
    const below = new Set(painted.slice(0, Math.max(0, at)).map((p) => p.element.id));
    const above = new Set(painted.slice(at + 1).map((p) => p.element.id));
    return {
      belowDoc: { ...state.document, elements: elements.filter((el) => below.has(el.id)) },
      aboveDoc: { ...state.document, elements: elements.filter((el) => above.has(el.id)) },
    };
  }, [state.document, elementId]);

  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#E11D48');
  const [size, setSize] = useState(18);
  const [softness, setSoftness] = useState(30);
  const [transparency, setTransparency] = useState(100);
  const [penMode, setPenMode] = useState('plain');
  const [tolerance, setTolerance] = useState(20);
  const [fillOpacity, setFillOpacity] = useState(100);
  const [antiAlias, setAntiAlias] = useState(true);
  const [contiguous, setContiguous] = useState(true);
  const [shapeType, setShapeType] = useState('rectangle');
  const [shapeFill, setShapeFill] = useState(true);
  const [shapeOutline, setShapeOutline] = useState(false);
  const [outlineColor, setOutlineColor] = useState('#000000');
  const [outlineWidth, setOutlineWidth] = useState(4);
  const [loading, setLoading] = useState(true);
  const [displayScale, setDisplayScale] = useState(1);
  const [blocked, setBlocked] = useState(false);
  const [stageScale, setStageScale] = useState(0);
  const [genPrompt, setGenPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [, forceRepaint] = useState(0);

  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const shapeStartRef = useRef(null);
  const touchedRef = useRef(false);
  const seedRef = useRef(0);
  const viewportRef = useRef(null);

  useEscape(onClose, true);

  // Fit the *whole document* into the viewport (never upscale past 100%),
  // so the backdrop and the editable box below are both keyed off one scale.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return undefined;
    const update = () => {
      const raw = Math.min(
        (node.clientWidth - STAGE_PADDING * 2) / canvas.width,
        (node.clientHeight - STAGE_PADDING * 2) / canvas.height
      );
      setStageScale(Math.max(0.02, Math.min(1, raw)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [canvas.width, canvas.height]);

  useEffect(() => {
    if (!element) return;
    let active = true;
    setLoading(true);

    const setup = (width, height, draw) => {
      const canvas = canvasRef.current;
      canvas.width = width;
      canvas.height = height;
      previewCanvasRef.current.width = width;
      previewCanvasRef.current.height = height;
      draw?.(canvas.getContext('2d'));
      setLoading(false);
    };

    if (element.properties.src) {
      loadImage(element.properties.src).then((img) => {
        if (!active) return;
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        setup(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale), (ctx) => ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height));
        if (!isCanvasReadable(canvasRef.current)) setBlocked(true);
      });
    } else {
      setup(Math.max(1, Math.round(element.width)), Math.max(1, Math.round(element.height)));
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element?.id]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const update = () => {
      const box = el.getBoundingClientRect();
      if (box.width) setDisplayScale(box.width / el.width);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
    // The canvas's CSS box now tracks `stageScale` (document-fit) rather than
    // its own intrinsic size, so a stage-scale or element-box change resizes
    // it just as much as a window resize does.
  }, [loading, stageScale, element?.width, element?.height]);

  if (!element) return null;

  const brushOpts = () => ({ size, softness, transparency, color });

  const paintSegment = (from, to, progress) => {
    const ctx = canvasRef.current.getContext('2d');
    if (tool === 'pen') drawSegment(ctx, penMode, from, to, brushOpts(), seedRef.current, progress);
    else drawSegment(ctx, tool, from, to, brushOpts());
    touchedRef.current = true;
  };

  const runFill = (point) => {
    const ctx = canvasRef.current.getContext('2d');
    floodFill(ctx, { x: point.x, y: point.y, color, tolerance, opacity: fillOpacity, antiAlias, contiguous });
    touchedRef.current = true;
    forceRepaint((n) => n + 1);
  };

  const drawShapePreview = (start, current) => {
    const pctx = previewCanvasRef.current.getContext('2d');
    pctx.clearRect(0, 0, pctx.canvas.width, pctx.canvas.height);
    drawRasterShape(pctx, shapeType, { x0: start.x, y0: start.y, x1: current.x, y1: current.y }, {
      fill: shapeFill, fillColor: color, outline: shapeOutline, outlineColor, outlineWidth,
    });
  };

  const { canvasRef: strokeCanvasRef, handlers, hover } = useBrushStroke({
    onStart: (point) => {
      if (tool === 'fill') {
        runFill(point);
        return;
      }
      if (tool === 'shape') {
        shapeStartRef.current = point;
        return;
      }
      seedRef.current += 1;
      paintSegment(point, point, 0);
    },
    onPoint: (point, last) => {
      if (tool === 'fill') return;
      if (tool === 'shape') {
        if (shapeStartRef.current) drawShapePreview(shapeStartRef.current, point);
        return;
      }
      const dist = Math.hypot(point.x - last.x, point.y - last.y) || 1;
      const spacing = tool === 'pen' && penMode === 'ink' ? Math.max(2, size * 0.3) : Math.max(1, size * 0.15);
      const steps = Math.max(1, Math.floor(dist / spacing));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        paintSegment(
          { x: last.x + (point.x - last.x) * ((i - 1) / steps), y: last.y + (point.y - last.y) * ((i - 1) / steps) },
          { x: last.x + (point.x - last.x) * t, y: last.y + (point.y - last.y) * t },
          t
        );
      }
    },
    onEnd: () => {
      if (tool === 'shape' && shapeStartRef.current) {
        // Commit the previewed shape to the real canvas, then clear the preview layer.
        const ctx = canvasRef.current.getContext('2d');
        const pctx = previewCanvasRef.current.getContext('2d');
        ctx.drawImage(previewCanvasRef.current, 0, 0);
        pctx.clearRect(0, 0, pctx.canvas.width, pctx.canvas.height);
        touchedRef.current = true;
        shapeStartRef.current = null;
        forceRepaint((n) => n + 1);
      }
    },
  });

  useEffect(() => {
    strokeCanvasRef.current = canvasRef.current;
  });

  const apply = () => {
    if (touchedRef.current && !blocked) {
      const src = canvasRef.current.toDataURL('image/png');
      actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes: { src, fit: 'fill' } }]);
    }
    onClose();
  };

  /**
   * The same pipeline `/scribble` uses, called from right inside the editor:
   * this raster layer's own strokes go up as the scribble, Apollo reads and
   * composes from them, and the result replaces the whole document — the
   * sketch layer included, since a fresh design supersedes it rather than
   * sitting underneath it.
   */
  const runGenerate = async () => {
    if (!touchedRef.current) {
      toast.error('Draw something first', 'Apollo needs a sketch to work from.');
      return;
    }
    setGenerating(true);
    try {
      const scribble = canvasRef.current.toDataURL('image/png');
      const res = await api.aiGenerate({
        message: genPrompt.trim() || 'Design this',
        document: state.document,
        scribble,
      });
      if (!res.operations?.length) throw new Error('Apollo could not compose a design from that.');
      actions.apply(res.operations);
      onClose();
    } catch (err) {
      toast.error('Apollo could not draw that', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const cursorSize = tool === 'brush' || tool === 'eraser' || tool === 'pen' ? size : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-void">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <h2 className="text-[13px] font-medium text-ink">{scribbleMode ? 'Scribble' : 'Draw'}</h2>
        {blocked && (
          <span className="text-2xs text-ink-3">
            This image blocks pixel editing (hosted externally) — Apply is disabled. Upload it first to draw on it.
          </span>
        )}
        {scribbleMode && (
          <TextField
            className="w-80"
            placeholder="Say what you want, or leave it and let Apollo read the sketch…"
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            disabled={generating}
          />
        )}
        <div className="flex-1" />
        <Button variant="secondary" onClick={onClose} disabled={generating}>Cancel</Button>
        {scribbleMode ? (
          <>
            <Button variant="secondary" onClick={apply} disabled={generating}>Save sketch</Button>
            <Button variant="primary" onClick={runGenerate} disabled={generating} className="gap-1.5">
              <Spark size={13} />
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={apply} disabled={blocked}>Apply</Button>
        )}
        <IconButton size="lg" onClick={onClose} aria-label="Close" disabled={generating}><X size={15} /></IconButton>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="thin-scroll w-[290px] shrink-0 overflow-y-auto border-r border-line bg-surface">
          <section className="space-y-2 border-b border-line px-3 py-3.5">
            <p className="label mb-1">Tool</p>
            <div className="grid grid-cols-5 gap-1.5">
              {TOOLS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTool(id)}
                  title={label}
                  className={`flex flex-col items-center gap-1 rounded border px-1 py-2 text-2xs transition-colors ${
                    tool === id ? 'border-accent bg-raised text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </section>

          {(tool === 'brush' || tool === 'eraser' || tool === 'pen') && (
            <section className="space-y-3 border-b border-line px-3 py-3.5">
              {tool !== 'eraser' && (
                <>
                  <p className="label">Color</p>
                  <ColorField value={color} onChange={setColor} />
                </>
              )}
              {tool === 'pen' && (
                <>
                  <p className="label mt-1">Mode</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PEN_MODE_IDS.map((id) => (
                      <button
                        key={id}
                        onClick={() => setPenMode(id)}
                        className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                          penMode === id ? 'border-accent bg-raised text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
                        }`}
                      >
                        {PEN_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="label mt-1">{tool === 'brush' ? 'Brush' : tool === 'eraser' ? 'Eraser' : 'Line'}</p>
              <SliderField label="Size" value={size} min={1} max={200} display={`${size}px`} onChange={setSize} />
              {tool !== 'pen' && <SliderField label="Softness" value={softness} min={0} max={100} display={`${softness}%`} onChange={setSoftness} />}
              <SliderField label="Transparency" value={transparency} min={5} max={100} display={`${transparency}%`} onChange={setTransparency} />
            </section>
          )}

          {tool === 'fill' && (
            <section className="space-y-3 border-b border-line px-3 py-3.5">
              <p className="label">Color</p>
              <ColorField value={color} onChange={setColor} />
              <SliderField label="Tolerance" value={tolerance} min={0} max={100} display={`${tolerance}%`} onChange={setTolerance} />
              <SliderField label="Opacity" value={fillOpacity} min={1} max={100} display={`${fillOpacity}%`} onChange={setFillOpacity} />
              <SwitchRow label="Anti-alias" checked={antiAlias} onChange={setAntiAlias} />
              <SwitchRow label="Contiguous" checked={contiguous} onChange={setContiguous} />
              <p className="text-2xs leading-relaxed text-ink-3">Click the canvas to fill.</p>
            </section>
          )}

          {tool === 'shape' && (
            <section className="space-y-3 border-b border-line px-3 py-3.5">
              <p className="label">Shape</p>
              <div className="grid grid-cols-3 gap-1.5">
                {SHAPE_TYPES.map((id) => (
                  <button
                    key={id}
                    onClick={() => setShapeType(id)}
                    className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                      shapeType === id ? 'border-accent bg-raised text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {SHAPE_LABELS[id]}
                  </button>
                ))}
              </div>
              {shapeType !== 'line' && (
                <>
                  <SwitchRow label="Fill" checked={shapeFill} onChange={setShapeFill} />
                  {shapeFill && <ColorField value={color} onChange={setColor} />}
                </>
              )}
              <SwitchRow label="Outline" checked={shapeOutline || shapeType === 'line'} onChange={shapeType === 'line' ? () => {} : setShapeOutline} />
              {(shapeOutline || shapeType === 'line') && (
                <>
                  <ColorField value={outlineColor} onChange={setOutlineColor} />
                  <SliderField label="Width" value={outlineWidth} min={1} max={40} display={`${outlineWidth}px`} onChange={setOutlineWidth} />
                </>
              )}
              <p className="text-2xs leading-relaxed text-ink-3">Drag on the canvas to place it.</p>
            </section>
          )}
        </aside>

        <div ref={viewportRef} className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto bg-void p-10">
          {/* Always mounted, sized at 0 until the first `stageScale` measurement
              lands — the setup effect needs `canvasRef` attached on its very
              first run, so the canvas itself can never be conditional on it. */}
          <div className="relative shrink-0 shadow-art" style={{ width: canvas.width * stageScale, height: canvas.height * stageScale }}>
            {/* Read-only, split around the target's own paint position: what
                sits behind it in the real document renders behind the
                editable box, and — the part that actually matters for a
                full-bleed photo — what sits IN FRONT of it (a headline over
                a hero image, say) stays in front here too. */}
            <DesignPreview document={belowDoc} className="absolute inset-0" />

            <div
              className="checkerboard absolute outline outline-2 outline-accent/70"
              style={{
                left: element.x * stageScale,
                top: element.y * stageScale,
                width: element.width * stageScale,
                height: element.height * stageScale,
                visibility: loading ? 'hidden' : 'visible',
              }}
            >
              <canvas ref={canvasRef} className="block h-full w-full" style={{ cursor: cursorSize ? 'none' : 'crosshair' }} {...handlers} />
              <canvas ref={previewCanvasRef} className="pointer-events-none absolute inset-0 block h-full w-full" />
              {hover && cursorSize > 0 && (
                <span
                  className="pointer-events-none absolute rounded-full border-2 border-accent"
                  style={{
                    left: hover.x * displayScale - (cursorSize / 2) * displayScale,
                    top: hover.y * displayScale - (cursorSize / 2) * displayScale,
                    width: cursorSize * displayScale,
                    height: cursorSize * displayScale,
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
                  }}
                />
              )}
            </div>

            <DesignPreview
              document={aboveDoc}
              className="pointer-events-none absolute inset-0"
              style={{ background: 'transparent' }}
            />
          </div>
          {loading && <p className="absolute text-sm text-ink-3">Preparing canvas…</p>}
        </div>
      </div>
    </div>
  );
}

function SwitchRow({ label, checked, onChange }) {
  return (
    <div className="flex h-7 items-center justify-between">
      <span className="label">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
