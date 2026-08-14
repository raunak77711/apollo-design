import { useRef, useState } from 'react';
import { Eye, RotateCcw, RotateCw, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { ADJUST_PRESETS, cssImageFilter } from '../../design/imageFilters.js';
import { SIGNED_ADJUST_KEYS, UNSIGNED_ADJUST_KEYS } from '../../design/schema.js';
import { EFFECT_CATEGORIES, effectsInCategory } from '../../design/effects.js';
import ImageEffectOverlays from '../elements/ImageEffectOverlays.jsx';
import LiquifyTab from './LiquifyTab.jsx';
import RetouchTab from './RetouchTab.jsx';
import { Button, Chip, IconButton } from '../../ui/primitives.jsx';
import { SliderField, Segmented } from '../../ui/fields.jsx';
import { useEscape } from '../../ui/overlay.jsx';

const BASE_NEUTRAL = { brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0, blur: 0 };
const EXTRA_NEUTRAL = Object.fromEntries([...SIGNED_ADJUST_KEYS, ...UNSIGNED_ADJUST_KEYS].map((k) => [k, 0]));
const NEUTRAL = { ...BASE_NEUTRAL, ...EXTRA_NEUTRAL };

const PRESETS = [
  { id: 'original', label: 'Original', values: NEUTRAL },
  { id: 'auto', label: 'Auto', values: { ...EXTRA_NEUTRAL, ...ADJUST_PRESETS.auto } },
  { id: 'bw', label: 'Mono', values: { ...EXTRA_NEUTRAL, ...ADJUST_PRESETS.bw } },
  { id: 'pop', label: 'Pop', values: { ...EXTRA_NEUTRAL, ...ADJUST_PRESETS.pop } },
];

/**
 * The full Adjust panel — Color, Light, Details and Scene — plus crop-safe
 * corner radius, opacity and 90° rotation. Everything previews live and
 * commits to the document as one undoable operation. The server export
 * applies the same tone controls (see exportService.js); grain/vignette/bloom
 * are overlay effects that render identically here and on the live canvas,
 * but are approximated or omitted in the exported file — see the README.
 */
export default function PhotoEditor({ elementId, initialView = 'adjust', onClose }) {
  const { state, actions } = useEditor();
  const element = state.document.elements.find((el) => el.id === elementId);
  const [comparing, setComparing] = useState(false);
  const [view, setView] = useState(initialView); // 'adjust' | 'effects' | 'liquify' | 'retouch'
  const [effectCategory, setEffectCategory] = useState('All');
  const liquifyRef = useRef(null); // { canvasRef, touchedRef }, set once LiquifyTab has loaded
  const retouchRef = useRef(null);
  const [work, setWork] = useState(() => {
    const p = element?.properties || {};
    const extras = Object.fromEntries([...SIGNED_ADJUST_KEYS, ...UNSIGNED_ADJUST_KEYS].map((k) => [k, p[k] ?? 0]));
    return {
      brightness: p.brightness ?? 100,
      contrast: p.contrast ?? 100,
      saturation: p.saturation ?? 100,
      hue: p.hue ?? 0,
      grayscale: p.grayscale ?? 0,
      blur: p.blur ?? 0,
      ...extras,
      borderRadius: p.borderRadius ?? 0,
      opacity: element?.opacity ?? 1,
      rotation: element?.rotation ?? 0,
    };
  });

  useEscape(onClose, true);

  if (!element || element.type !== 'image') return null;

  const set = (patch) => setWork((w) => ({ ...w, ...patch }));
  const applyEffect = (effect) => set({ ...NEUTRAL, ...effect.values });
  const maxRadius = Math.round(Math.min(element.width, element.height) / 2);

  /**
   * Liquify and Retouch paint on a real canvas rather than editing document
   * properties, so leaving either tab bakes its result into the element's
   * `src` right away (its own undoable step) — the next tab you open then
   * starts from that baked-in picture, so the tools chain correctly.
   */
  const commitPixelEdits = (fromView) => {
    const ref = fromView === 'liquify' ? liquifyRef.current : fromView === 'retouch' ? retouchRef.current : null;
    if (!ref?.touchedRef.current) return;
    const src = ref.canvasRef.current.toDataURL('image/png');
    actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes: { src } }]);
    ref.touchedRef.current = false;
  };

  const changeView = (next) => {
    commitPixelEdits(view);
    setView(next);
  };

  const apply = () => {
    commitPixelEdits(view);
    const { borderRadius, opacity, rotation, ...tone } = work;
    actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes: { ...tone, borderRadius, opacity, rotation } }]);
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

      {view === 'liquify' || view === 'retouch' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-line px-3 py-2">
            <TabSwitcher view={view} onChange={changeView} />
          </div>
          {view === 'liquify' && (
            <LiquifyTab
              src={element.properties.src}
              onReady={(ref) => {
                liquifyRef.current = ref;
              }}
            />
          )}
          {view === 'retouch' && (
            <RetouchTab
              src={element.properties.src}
              onReady={(ref) => {
                retouchRef.current = ref;
              }}
            />
          )}
        </div>
      ) : (
      <div className="flex min-h-0 flex-1">
        <aside className="thin-scroll w-[290px] shrink-0 overflow-y-auto border-r border-line bg-surface">
          <div className="border-b border-line p-3">
            <TabSwitcher view={view} onChange={changeView} />
          </div>

          {view === 'effects' ? (
            <>
              <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2.5">
                {['All', ...EFFECT_CATEGORIES].map((c) => (
                  <Chip key={c} active={effectCategory === c} onClick={() => setEffectCategory(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 p-3">
                {effectsInCategory(effectCategory).map((effect) => (
                  <button key={effect.id} onClick={() => applyEffect(effect)} className="group flex flex-col items-center gap-1.5">
                    <span className="w-full overflow-hidden rounded border border-line transition-colors group-hover:border-accent">
                      <img
                        src={element.properties.src}
                        alt=""
                        className="aspect-square w-full object-cover"
                        style={{ filter: cssImageFilter({ ...NEUTRAL, ...effect.values }) }}
                      />
                    </span>
                    <span className="truncate text-2xs text-ink-3 transition-colors group-hover:text-ink">{effect.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
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
            <p className="label">Color</p>
            <SliderField label="Vibrance" value={work.vibrance} min={-100} max={100} display={signed(work.vibrance)} onChange={(vibrance) => set({ vibrance })} />
            <SliderField label="Saturation" value={work.saturation} min={0} max={200} display={signed(work.saturation - 100)} onChange={(saturation) => set({ saturation })} />
            <SliderField label="Temperature" value={work.temperature} min={-100} max={100} display={signed(work.temperature)} onChange={(temperature) => set({ temperature })} />
            <SliderField label="Tint" value={work.tint} min={-100} max={100} display={signed(work.tint)} onChange={(tint) => set({ tint })} />
            <SliderField label="Hue" value={work.hue} min={-180} max={180} display={`${signed(work.hue)}°`} onChange={(hue) => set({ hue })} />
            <SliderField label="Mono" value={work.grayscale} min={0} max={100} display={`${work.grayscale}%`} onChange={(grayscale) => set({ grayscale })} />
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Light</p>
            <SliderField label="Brightness" value={work.brightness} min={0} max={200} display={signed(work.brightness - 100)} onChange={(brightness) => set({ brightness })} />
            <SliderField label="Exposure" value={work.exposure} min={-100} max={100} display={signed(work.exposure)} onChange={(exposure) => set({ exposure })} />
            <SliderField label="Contrast" value={work.contrast} min={0} max={200} display={signed(work.contrast - 100)} onChange={(contrast) => set({ contrast })} />
            <SliderField label="Black" value={work.black} min={-100} max={100} display={signed(work.black)} onChange={(black) => set({ black })} />
            <SliderField label="White" value={work.white} min={-100} max={100} display={signed(work.white)} onChange={(white) => set({ white })} />
            <SliderField label="Highlights" value={work.highlights} min={-100} max={100} display={signed(work.highlights)} onChange={(highlights) => set({ highlights })} />
            <SliderField label="Shadows" value={work.shadowsTone} min={-100} max={100} display={signed(work.shadowsTone)} onChange={(shadowsTone) => set({ shadowsTone })} />
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Details</p>
            <SliderField label="Sharpen" value={work.sharpen} min={0} max={100} display={`${work.sharpen}%`} onChange={(sharpen) => set({ sharpen })} />
            <SliderField label="Clarity" value={work.clarity} min={-100} max={100} display={signed(work.clarity)} onChange={(clarity) => set({ clarity })} />
            <SliderField label="Smooth" value={work.smooth} min={0} max={100} display={`${work.smooth}%`} onChange={(smooth) => set({ smooth })} />
            <SliderField label="Blur" value={work.blur} min={0} max={20} step={0.5} onChange={(blur) => set({ blur })} />
            <SliderField label="Grain" value={work.grain} min={0} max={100} display={`${work.grain}%`} onChange={(grain) => set({ grain })} />
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Scene</p>
            <SliderField label="Vignette" value={work.vignette} min={0} max={100} display={`${work.vignette}%`} onChange={(vignette) => set({ vignette })} />
            <SliderField label="Glamour" value={work.glamour} min={0} max={100} display={`${work.glamour}%`} onChange={(glamour) => set({ glamour })} />
            <SliderField label="Bloom" value={work.bloom} min={0} max={100} display={`${work.bloom}%`} onChange={(bloom) => set({ bloom })} />
            <SliderField label="Dehaze" value={work.dehaze} min={-100} max={100} display={signed(work.dehaze)} onChange={(dehaze) => set({ dehaze })} />
          </section>

          <section className="space-y-3 border-b border-line px-3 py-3.5">
            <p className="label">Finish</p>
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
                onClick={() => set({ ...NEUTRAL, borderRadius: work.borderRadius, opacity: 1, rotation: 0 })}
                className="h-8 flex-1 rounded border border-line bg-raised text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
              >
                Reset
              </button>
            </div>
          </section>
            </>
          )}
        </aside>

        <div className="checkerboard flex min-w-0 flex-1 items-center justify-center overflow-auto p-10">
          <div className="relative max-h-full max-w-full shadow-art" style={{ opacity: preview.opacity, transform: `rotate(${preview.rotation}deg)` }}>
            <img
              src={element.properties.src}
              alt={element.properties.alt || ''}
              draggable={false}
              className="block max-h-full max-w-full"
              style={{ filter: cssImageFilter(preview), borderRadius: preview.borderRadius, objectFit: element.properties.fit }}
            />
            <ImageEffectOverlays properties={preview} src={element.properties.src} borderRadius={preview.borderRadius} />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function TabSwitcher({ view, onChange }) {
  return (
    <Segmented
      className="w-full"
      size="sm"
      value={view}
      onChange={onChange}
      options={[
        { value: 'adjust', label: 'Adjust' },
        { value: 'effects', label: 'Effects' },
        { value: 'liquify', label: 'Liquify' },
        { value: 'retouch', label: 'Retouch' },
      ]}
    />
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
