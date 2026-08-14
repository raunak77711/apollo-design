import { useEffect, useRef, useState } from 'react';
import { Flame, Snowflake, SunDim, Waves } from 'lucide-react';
import { isCanvasReadable, loadImageToCanvas } from '../../raster/imageIO.js';
import { blurStamp, dodgeBurnStamp, sharpenStamp } from '../../raster/retouch.js';
import { useBrushStroke } from '../../raster/useBrushStroke.js';
import { SliderField } from '../../ui/fields.jsx';
import { Segmented } from '../../ui/fields.jsx';
import { Spinner } from '../../ui/primitives.jsx';

const TOOLS = [
  { id: 'dodgeburn', label: 'Dodge & Burn', icon: SunDim },
  { id: 'sharpen', label: 'Sharpen', icon: Waves },
  { id: 'blur', label: 'Blur', icon: Snowflake },
];

/**
 * Retouch brushes painted straight onto a working canvas: Dodge & Burn
 * (lighten/darken a tonal range), plus local Sharpen and Blur. Same
 * ready-handoff contract as LiquifyTab — Apply reads the canvas, nothing
 * touches the document until then.
 */
export default function RetouchTab({ src, onReady }) {
  const [tool, setTool] = useState('dodgeburn');
  const [mode, setMode] = useState('lighten'); // dodge = lighten, burn = darken
  const [range, setRange] = useState('midtones');
  const [size, setSize] = useState(60);
  const [softness, setSoftness] = useState(60);
  const [strength, setStrength] = useState(40);
  const [loading, setLoading] = useState(true);
  const [displayScale, setDisplayScale] = useState(1);
  const [blocked, setBlocked] = useState(false);

  const canvasRef = useRef(null);
  const touchedRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadImageToCanvas(src).then((source) => {
      if (!active) return;
      const canvas = canvasRef.current;
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext('2d').drawImage(source, 0, 0);
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

  const stampAt = (point) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const opts = { center: point, radius: size, softness, strength };
    if (tool === 'dodgeburn') dodgeBurnStamp(ctx, { ...opts, mode: mode === 'lighten' ? 'lighten' : 'darken', range });
    else if (tool === 'sharpen') sharpenStamp(ctx, opts);
    else if (tool === 'blur') blurStamp(ctx, opts);
    touchedRef.current = true;
  };

  const { canvasRef: strokeCanvasRef, handlers, hover } = useBrushStroke({
    onStart: (point) => stampAt(point),
    onPoint: (point, last) => {
      const dist = Math.hypot(point.x - last.x, point.y - last.y);
      const spacing = Math.max(2, size * 0.25);
      const steps = Math.max(1, Math.floor(dist / spacing));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stampAt({ x: last.x + (point.x - last.x) * t, y: last.y + (point.y - last.y) * t });
      }
    },
  });

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

        {tool === 'dodgeburn' && (
          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Mode</p>
            <Segmented
              className="w-full"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'lighten', label: 'Dodge (lighten)', icon: Flame },
                { value: 'darken', label: 'Burn (darken)', icon: Snowflake },
              ]}
            />
            <p className="label mt-1">Range</p>
            <Segmented
              className="w-full"
              size="sm"
              value={range}
              onChange={setRange}
              options={[
                { value: 'shadows', label: 'Dark' },
                { value: 'midtones', label: 'Mid' },
                { value: 'highlights', label: 'Light' },
              ]}
            />
          </section>
        )}

        <section className="space-y-3 border-b border-line px-3 py-3.5">
          <p className="label">Brush</p>
          <SliderField label="Size" value={size} min={8} max={250} display={`${size}px`} onChange={setSize} />
          <SliderField label="Softness" value={softness} min={0} max={100} display={`${softness}%`} onChange={setSoftness} />
          <SliderField label="Strength" value={strength} min={1} max={100} display={`${strength}%`} onChange={setStrength} />
        </section>
      </aside>

      <div className="checkerboard relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-10">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <Spinner /> Loading image…
          </div>
        )}
        {!loading && blocked && (
          <p className="max-w-xs text-center text-sm leading-relaxed text-ink-3">
            This image is hosted somewhere that blocks pixel-level editing. Upload it instead (Library → Uploads) to retouch it.
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
