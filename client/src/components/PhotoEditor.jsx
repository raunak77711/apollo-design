import { useState } from 'react';
import { Wand2, Contrast, Sparkles, RotateCcw, RotateCw, X } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';
import { cssImageFilter, ADJUST_PRESETS } from '../design/imageFilters.js';

const DEFAULTS = { brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0, blur: 0 };

/**
 * Mini photo editor ("Adjust"). Edits the selected image element with a live
 * CSS-filter preview and commits the result to the design document as ONE
 * undoable operation. Server export applies the same numbers via Sharp, so the
 * exported file matches this preview.
 */
export default function PhotoEditor({ elementId, onClose }) {
  const { state, actions } = useEditor();
  const el = state.document.elements.find((e) => e.id === elementId);
  const [work, setWork] = useState(() => ({
    brightness: el?.properties.brightness ?? 100,
    contrast: el?.properties.contrast ?? 100,
    saturation: el?.properties.saturation ?? 100,
    hue: el?.properties.hue ?? 0,
    grayscale: el?.properties.grayscale ?? 0,
    blur: el?.properties.blur ?? 0,
    borderRadius: el?.properties.borderRadius ?? 0,
    opacity: el?.opacity ?? 1,
    rotation: el?.rotation ?? 0,
  }));

  if (!el || el.type !== 'image') return null;

  const set = (patch) => setWork((w) => ({ ...w, ...patch }));
  const applyPreset = (key) => set(ADJUST_PRESETS[key]);
  const reset = () => set({ ...DEFAULTS, borderRadius: work.borderRadius, opacity: 1, rotation: 0 });

  const apply = () => {
    actions.apply([
      {
        type: 'UPDATE_ELEMENT',
        targetId: el.id,
        changes: {
          brightness: work.brightness, contrast: work.contrast, saturation: work.saturation,
          hue: work.hue, grayscale: work.grayscale, blur: work.blur,
          borderRadius: work.borderRadius, opacity: work.opacity, rotation: work.rotation,
        },
      },
    ]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#0d0d0d]">
      {/* Left controls */}
      <aside className="w-80 bg-panel border-r border-edge flex flex-col">
        <div className="h-12 flex items-center justify-between px-4 border-b border-edge">
          <span className="font-semibold">Adjust</span>
          <button onClick={onClose} className="text-neutral-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto thin-scroll p-4 space-y-5">
          {/* Presets */}
          <div className="grid grid-cols-3 gap-2">
            <Preset icon={Wand2} label="Auto" onClick={() => applyPreset('auto')} />
            <Preset icon={Contrast} label="B&W" onClick={() => applyPreset('bw')} />
            <Preset icon={Sparkles} label="Pop" onClick={() => applyPreset('pop')} />
          </div>

          <Group title="Color">
            <Slider label="Saturation" value={work.saturation} min={0} max={200} onChange={(v) => set({ saturation: v })} center={100} />
            <Slider label="Hue" value={work.hue} min={-180} max={180} onChange={(v) => set({ hue: v })} center={0} />
            <Slider label="Grayscale" value={work.grayscale} min={0} max={100} onChange={(v) => set({ grayscale: v })} />
          </Group>

          <Group title="Light">
            <Slider label="Brightness" value={work.brightness} min={0} max={200} onChange={(v) => set({ brightness: v })} center={100} />
            <Slider label="Contrast" value={work.contrast} min={0} max={200} onChange={(v) => set({ contrast: v })} center={100} />
          </Group>

          <Group title="Effects">
            <Slider label="Blur" value={work.blur} min={0} max={20} step={0.5} onChange={(v) => set({ blur: v })} />
            <Slider label="Border radius" value={work.borderRadius} min={0} max={Math.round(Math.min(el.width, el.height) / 2)} onChange={(v) => set({ borderRadius: v })} />
            <Slider label="Opacity" value={Math.round(work.opacity * 100)} min={0} max={100} onChange={(v) => set({ opacity: v / 100 })} />
          </Group>

          <Group title="Transform">
            <div className="flex gap-2">
              <TBtn icon={RotateCcw} label="-90°" onClick={() => set({ rotation: mod(work.rotation - 90) })} />
              <TBtn icon={RotateCw} label="+90°" onClick={() => set({ rotation: mod(work.rotation + 90) })} />
              <button onClick={reset} className="flex-1 text-xs text-neutral-400 hover:text-white bg-panel2 border border-edge rounded py-2">Reset</button>
            </div>
          </Group>
        </div>

        <div className="p-3 border-t border-edge flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded border border-edge text-sm text-neutral-300 hover:bg-panel2">Cancel</button>
          <button onClick={apply} className="flex-1 py-2 rounded bg-accent text-white text-sm font-medium">Apply</button>
        </div>
      </aside>

      {/* Preview */}
      <div className="flex-1 flex items-center justify-center p-10 overflow-auto checkerboard">
        <img
          src={el.properties.src}
          alt={el.properties.alt || ''}
          draggable={false}
          className="max-w-full max-h-full shadow-2xl"
          style={{
            filter: cssImageFilter(work),
            borderRadius: work.borderRadius,
            opacity: work.opacity,
            transform: `rotate(${work.rotation}deg)`,
            objectFit: el.properties.fit,
          }}
        />
      </div>
    </div>
  );
}

/* --------------------------------- atoms --------------------------------- */

function Preset({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 py-3 rounded-lg bg-panel2 border border-edge hover:border-accent text-neutral-300 hover:text-white">
      <Icon size={18} />
      <span className="text-xs">{label}</span>
    </button>
  );
}

function Group({ title, children }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, center }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-neutral-400">{label}</span>
        <span className="text-neutral-500 tabular-nums">{typeof center === 'number' ? value - center : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-accent" />
    </div>
  );
}

function TBtn({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex-1 flex items-center justify-center gap-1 text-xs text-neutral-300 hover:text-white bg-panel2 border border-edge rounded py-2">
      <Icon size={14} /> {label}
    </button>
  );
}

const mod = (deg) => ((deg % 360) + 360) % 360;
