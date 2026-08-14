import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, RotateCwSquare, Shrink, Wind } from 'lucide-react';
import { isCanvasReadable, loadImageToCanvas } from '../../raster/imageIO.js';
import { liquifyStamp } from '../../raster/liquify.js';
import { useBrushStroke } from '../../raster/useBrushStroke.js';
import { SliderField } from '../../ui/fields.jsx';
import { Spinner } from '../../ui/primitives.jsx';

const TOOLS = [
  { id: 'push', label: 'Push', icon: Wind },
  { id: 'enlarge', label: 'Enlarge', icon: Maximize2 },
  { id: 'shrink', label: 'Shrink', icon: Minimize2 },
  { id: 'swirl-right', label: 'Swirl right', icon: RotateCwSquare },
  { id: 'swirl-left', label: 'Swirl left', icon: RotateCcw },
  { id: 'restore', label: 'Restore', icon: Shrink },
];

/**
 * Real pixel warping — push/enlarge/shrink/swirl/restore — painted straight
 * onto a working canvas loaded from the image. `onReady` hands the parent a
 * `{ canvas, touched }` ref pair so Apply can export it; nothing is written
 * back to the document until Apply is pressed.
 */
export default function LiquifyTab({ src, onReady }) {
  const [tool, setTool] = useState('push');
  const [size, setSize] = useState(70); // px, brush diameter... radius really
  const [strength, setStrength] = useState(50);
  const [density, setDensity] = useState(50);
  const [loading, setLoading] = useState(true);
  const [displayScale, setDisplayScale] = useState(1);
  const [blocked, setBlocked] = useState(false);

  const canvasRef = useRef(null);
  const originalRef = useRef(null);
  const touchedRef = useRef(false);
  const lastStampRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadImageToCanvas(src).then((source) => {
      if (!active) return;
      const canvas = canvasRef.current;
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext('2d').drawImage(source, 0, 0);

      const original = document.createElement('canvas');
      original.width = source.width;
      original.height = source.height;
      original.getContext('2d').drawImage(source, 0, 0);
      originalRef.current = original;

      setLoading(false);
      if (!isCanvasReadable(canvas)) {
        setBlocked(true);
        return;
      }
      onReady?.({ canvasRef, touchedRef });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const stampSpacing = () => Math.max(2, (size / 100) * (110 - density));

  const stampAt = (point, drag) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    liquifyStamp(ctx, {
      tool,
      center: point,
      radius: size,
      strength,
      drag,
      originalCanvas: originalRef.current,
    });
    touchedRef.current = true;
  };

  const { canvasRef: strokeCanvasRef, handlers, hover } = useBrushStroke({
    onStart: (point) => {
      lastStampRef.current = point;
      stampAt(point, { dx: 0, dy: 0 });
    },
    onPoint: (point, last) => {
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      const dist = Math.hypot(dx, dy);
      const spacing = stampSpacing();
      const steps = Math.max(1, Math.floor(dist / spacing));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stampAt({ x: last.x + dx * t, y: last.y + dy * t }, { dx: dx / steps, dy: dy / steps });
      }
    },
    onEnd: () => {
      lastStampRef.current = null;
    },
  });

  // Keep the shared brush-stroke ref pointed at our visible canvas.
  useEffect(() => {
    strokeCanvasRef.current = canvasRef.current;
  });

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

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="thin-scroll w-[290px] shrink-0 overflow-y-auto border-r border-line bg-surface">
        <section className="space-y-2 border-b border-line px-3 py-3.5">
          <p className="label mb-1">Tool</p>
          <div className="grid grid-cols-3 gap-1.5">
            {TOOLS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={label}
                className={`flex flex-col items-center gap-1 rounded border px-1 py-2.5 text-2xs transition-colors ${
                  tool === id ? 'border-accent bg-raised text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-b border-line px-3 py-3.5">
          <p className="label">Brush</p>
          <SliderField label="Size" value={size} min={10} max={300} display={`${size}px`} onChange={setSize} />
          <SliderField label="Strength" value={strength} min={1} max={100} display={`${strength}%`} onChange={setStrength} />
          <SliderField label="Density" value={density} min={1} max={100} display={`${density}%`} onChange={setDensity} />
        </section>

        <p className="px-3 py-3 text-2xs leading-relaxed text-ink-3">
          Drag on the image. {tool === 'restore' ? 'Restore blends warped areas back toward the original.' : 'Size and strength change live — try a few strokes.'}
        </p>
      </aside>

      <div className="checkerboard relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-10">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <Spinner /> Loading image…
          </div>
        )}
        {!loading && blocked && (
          <p className="max-w-xs text-center text-sm leading-relaxed text-ink-3">
            This image is hosted somewhere that blocks pixel-level editing. Upload it instead (Library → Uploads) to use Liquify on it.
          </p>
        )}
        <div className="relative" style={{ display: loading || blocked ? 'none' : 'block' }}>
          <canvas
            ref={canvasRef}
            {...(blocked ? {} : handlers)}
            className="block max-h-[70vh] max-w-full touch-none shadow-art"
            style={{ cursor: 'none' }}
          />
          {hover && !blocked && (
            <span
              className="pointer-events-none absolute rounded-full border-2 border-accent"
              style={{
                left: hover.x * displayScale - size * displayScale,
                top: hover.y * displayScale - size * displayScale,
                width: size * 2 * displayScale,
                height: size * 2 * displayScale,
                boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
