import { useEffect, useRef, useState } from 'react';
import { Eraser, PaintBucket, Pencil, Shapes as ShapesIcon, X, Brush as BrushIcon } from 'lucide-react';
import { useEditor } from '../../state/EditorContext.jsx';
import { isCanvasReadable, loadImage } from '../../raster/imageIO.js';
import { drawSegment, floodFill, PEN_MODE_IDS } from '../../raster/draw.js';
import { drawRasterShape, SHAPE_TYPES } from '../../raster/rasterShapes.js';
import { useBrushStroke } from '../../raster/useBrushStroke.js';
import { Button, IconButton } from '../../ui/primitives.jsx';
import { SliderField, ColorField, Toggle } from '../../ui/fields.jsx';
import { useEscape } from '../../ui/overlay.jsx';

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
 * Renders inline in the editor's main row (TopBar and the tool rail stay put
 * around it) rather than as a full-screen takeover, so it reads as a tab —
 * Home and every other tool button stay one click away while drawing.
 */
export default function DrawStudio({ elementId, onClose }) {
  const { state, actions } = useEditor();
  const element = state.document.elements.find((el) => el.id === elementId);

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
  const [, forceRepaint] = useState(0);

  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const shapeStartRef = useRef(null);
  const touchedRef = useRef(false);
  const seedRef = useRef(0);

  useEscape(onClose, true);

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
  }, [loading]);

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

  const cursorSize = tool === 'brush' || tool === 'eraser' || tool === 'pen' ? size : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-void">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <h2 className="text-[13px] font-medium text-ink">Draw</h2>
        {blocked && (
          <span className="text-2xs text-ink-3">
            This image blocks pixel editing (hosted externally) — Apply is disabled. Upload it first to draw on it.
          </span>
        )}
        <div className="flex-1" />
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={apply} disabled={blocked}>Apply</Button>
        <IconButton size="lg" onClick={onClose} aria-label="Close"><X size={15} /></IconButton>
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

        <div className="checkerboard relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-10">
          {/* The canvases stay mounted throughout — the setup effect needs a
              real ref to size on the very first run, before there is
              anything to show, so "loading" is an overlay, not a swap. */}
          <div className="relative" style={{ visibility: loading ? 'hidden' : 'visible' }}>
            <canvas ref={canvasRef} className="block max-h-[70vh] max-w-full shadow-art" style={{ cursor: cursorSize ? 'none' : tool === 'fill' ? 'crosshair' : 'crosshair' }} {...handlers} />
            <canvas ref={previewCanvasRef} className="pointer-events-none absolute inset-0 block max-h-[70vh] max-w-full" />
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
