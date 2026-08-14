import { useState } from 'react';
import { Eye, RotateCcw, RotateCw, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { ADJUST_PRESETS, cssImageFilter } from '../../design/imageFilters.js';
import { Button, IconButton } from '../../ui/primitives.jsx';
import { SliderField } from '../../ui/fields.jsx';
import { useEscape } from '../../ui/overlay.jsx';

const NEUTRAL = { brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0, blur: 0 };

const PRESETS = [
  { id: 'original', label: 'Original', values: NEUTRAL },
  { id: 'auto', label: 'Auto', values: ADJUST_PRESETS.auto },
  { id: 'bw', label: 'Mono', values: ADJUST_PRESETS.bw },
  { id: 'pop', label: 'Pop', values: ADJUST_PRESETS.pop },
];

/**
 * Focused image adjustment. Everything is previewed live and committed to the
 * document as one undoable operation; the server export applies the same
 * numbers, so what you see here is what you download.
 */
export default function PhotoEditor({ elementId, onClose }) {
  const { state, actions } = useEditor();
  const element = state.document.elements.find((el) => el.id === elementId);
  const [comparing, setComparing] = useState(false);
  const [work, setWork] = useState(() => ({
    brightness: element?.properties.brightness ?? 100,
    contrast: element?.properties.contrast ?? 100,
    saturation: element?.properties.saturation ?? 100,
    hue: element?.properties.hue ?? 0,
    grayscale: element?.properties.grayscale ?? 0,
    blur: element?.properties.blur ?? 0,
    borderRadius: element?.properties.borderRadius ?? 0,
    opacity: element?.opacity ?? 1,
    rotation: element?.rotation ?? 0,
  }));

  useEscape(onClose, true);

  if (!element || element.type !== 'image') return null;

  const set = (patch) => setWork((w) => ({ ...w, ...patch }));
  const maxRadius = Math.round(Math.min(element.width, element.height) / 2);

  const apply = () => {
    actions.apply([
      {
        type: 'UPDATE_ELEMENT',
        targetId: element.id,
        changes: {
          brightness: work.brightness,
          contrast: work.contrast,
          saturation: work.saturation,
          hue: work.hue,
          grayscale: work.grayscale,
          blur: work.blur,
          borderRadius: work.borderRadius,
          opacity: work.opacity,
          rotation: work.rotation,
        },
      },
    ]);
    onClose();
  };

  const preview = comparing ? { ...NEUTRAL, borderRadius: work.borderRadius, opacity: 1, rotation: work.rotation } : work;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-void">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <h2 className="text-[13px] font-medium text-ink">Adjust image</h2>
        <span className="num text-2xs text-ink-3">
          {element.width} × {element.height}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          onPointerDown={() => setComparing(true)}
          onPointerUp={() => setComparing(false)}
          onPointerLeave={() => setComparing(false)}
          className={cx(comparing && 'text-ink')}
        >
          <Eye size={14} /> Hold to compare
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={apply}>
          Apply
        </Button>
        <IconButton size="lg" onClick={onClose} aria-label="Close">
          <X size={15} />
        </IconButton>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="thin-scroll w-[290px] shrink-0 overflow-y-auto border-r border-line bg-surface">
          <section className="border-b border-line px-3 py-3.5">
            <p className="label mb-2.5">Presets</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => set(preset.values)}
                  className="group flex flex-col items-center gap-1.5"
                >
                  <span className="w-full overflow-hidden rounded border border-line transition-colors group-hover:border-accent">
                    <img
                      src={element.properties.src}
                      alt=""
                      className="aspect-square w-full object-cover"
                      style={{ filter: cssImageFilter(preset.values) }}
                    />
                  </span>
                  <span className="text-2xs text-ink-3 transition-colors group-hover:text-ink">{preset.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Light</p>
            <SliderField label="Brightness" value={work.brightness} min={0} max={200} display={signed(work.brightness - 100)} onChange={(brightness) => set({ brightness })} />
            <SliderField label="Contrast" value={work.contrast} min={0} max={200} display={signed(work.contrast - 100)} onChange={(contrast) => set({ contrast })} />
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Colour</p>
            <SliderField label="Saturation" value={work.saturation} min={0} max={200} display={signed(work.saturation - 100)} onChange={(saturation) => set({ saturation })} />
            <SliderField label="Hue" value={work.hue} min={-180} max={180} display={`${signed(work.hue)}°`} onChange={(hue) => set({ hue })} />
            <SliderField label="Mono" value={work.grayscale} min={0} max={100} display={`${work.grayscale}%`} onChange={(grayscale) => set({ grayscale })} />
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Finish</p>
            <SliderField label="Blur" value={work.blur} min={0} max={20} step={0.5} onChange={(blur) => set({ blur })} />
            <SliderField label="Corner radius" value={work.borderRadius} min={0} max={maxRadius} onChange={(borderRadius) => set({ borderRadius })} />
            <SliderField
              label="Opacity"
              value={Math.round(work.opacity * 100)}
              min={0}
              max={100}
              display={`${Math.round(work.opacity * 100)}%`}
              onChange={(v) => set({ opacity: v / 100 })}
            />
          </section>

          <section className="px-3 py-3.5">
            <p className="label mb-2.5">Rotate</p>
            <div className="flex gap-1.5">
              <TransformButton icon={RotateCcw} label="−90°" onClick={() => set({ rotation: wrap(work.rotation - 90) })} />
              <TransformButton icon={RotateCw} label="+90°" onClick={() => set({ rotation: wrap(work.rotation + 90) })} />
              <button
                onClick={() => set({ ...NEUTRAL, opacity: 1, rotation: 0 })}
                className="h-8 flex-1 rounded border border-line bg-raised text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
              >
                Reset
              </button>
            </div>
          </section>
        </aside>

        <div className="checkerboard flex min-w-0 flex-1 items-center justify-center overflow-auto p-10">
          <img
            src={element.properties.src}
            alt={element.properties.alt || ''}
            draggable={false}
            className="max-h-full max-w-full shadow-art"
            style={{
              filter: cssImageFilter(preview),
              borderRadius: preview.borderRadius,
              opacity: preview.opacity,
              transform: `rotate(${preview.rotation}deg)`,
              objectFit: element.properties.fit,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function TransformButton({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-line bg-raised text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
    >
      <Icon size={13} /> {label}
    </button>
  );
}

const signed = (n) => (n > 0 ? `+${Math.round(n)}` : String(Math.round(n)));
const wrap = (deg) => ((deg % 360) + 360) % 360;
