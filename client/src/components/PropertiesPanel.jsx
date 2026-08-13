import { SlidersHorizontal } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';
import { ICON_NAMES } from '../design/icons.js';

/**
 * Right properties inspector. Every change is a single UPDATE_ELEMENT operation,
 * so it flows through the exact same pipeline (and undo history) as AI edits.
 */
export default function PropertiesPanel({ onEditImage }) {
  const { state, actions } = useEditor();
  const el = state.document.elements.find((e) => e.id === state.selectedElementId) || null;

  if (!el) {
    return (
      <aside className="w-72 bg-panel border-l border-edge p-4 text-sm text-neutral-500">
        <p className="font-medium text-neutral-300 mb-1">No selection</p>
        <p>Select an element on the canvas to edit its properties, or ask Apollo AI below.</p>
      </aside>
    );
  }

  const set = (changes) => actions.apply([{ type: 'UPDATE_ELEMENT', targetId: el.id, changes }]);
  const p = el.properties;

  return (
    <aside className="w-72 bg-panel border-l border-edge overflow-y-auto thin-scroll">
      <div className="px-4 py-3 border-b border-edge">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Selected</p>
        <p className="text-sm font-medium capitalize">{el.type}</p>
      </div>

      <Section title="Position">
        <Row>
          <Num label="X" value={el.x} onChange={(v) => set({ x: v })} />
          <Num label="Y" value={el.y} onChange={(v) => set({ y: v })} />
        </Row>
      </Section>

      <Section title="Size">
        <Row>
          <Num label="W" value={el.width} onChange={(v) => set({ width: Math.max(1, v) })} />
          <Num label="H" value={el.height} onChange={(v) => set({ height: Math.max(1, v) })} />
        </Row>
      </Section>

      <Section title="Transform">
        <Row>
          <Num label="Rotation" value={el.rotation} onChange={(v) => set({ rotation: v })} />
          <Range label="Opacity" value={el.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
        </Row>
      </Section>

      {(el.type === 'text' || el.type === 'button') && (
        <Section title="Typography">
          <Field label="Text">
            <textarea
              value={p.text}
              onChange={(e) => set({ text: e.target.value })}
              rows={2}
              className="input resize-none"
            />
          </Field>
          <Row>
            <Num label="Size" value={p.fontSize} onChange={(v) => set({ fontSize: v })} />
            <Num label="Weight" value={p.fontWeight} step={100} onChange={(v) => set({ fontWeight: v })} />
          </Row>
          {el.type === 'text' && (
            <Row>
              <Num label="Line H" value={p.lineHeight} step={0.05} onChange={(v) => set({ lineHeight: v })} />
              <Num label="Spacing" value={p.letterSpacing} step={0.5} onChange={(v) => set({ letterSpacing: v })} />
            </Row>
          )}
          <Field label="Align">
            <Select value={p.align} options={['left', 'center', 'right']} onChange={(v) => set({ align: v })} />
          </Field>
          <Color label="Text color" value={p.color} onChange={(v) => set({ color: v })} />
          {el.type === 'button' && (
            <>
              <Color label="Background" value={p.background} onChange={(v) => set({ background: v })} />
              <Num label="Radius" value={p.borderRadius} onChange={(v) => set({ borderRadius: v })} />
            </>
          )}
        </Section>
      )}

      {(el.type === 'rectangle' || el.type === 'circle') && (
        <Section title="Fill">
          <Color label="Fill" value={p.fill} onChange={(v) => set({ fill: v })} />
          {el.type === 'rectangle' && <Num label="Radius" value={p.borderRadius} onChange={(v) => set({ borderRadius: v })} />}
          <Color label="Border" value={p.borderColor || '#000000'} onChange={(v) => set({ borderColor: v })} />
          <Num label="Border width" value={p.borderWidth} onChange={(v) => set({ borderWidth: v })} />
        </Section>
      )}

      {el.type === 'line' && (
        <Section title="Stroke">
          <Color label="Color" value={p.stroke} onChange={(v) => set({ stroke: v })} />
          <Num label="Width" value={p.strokeWidth} onChange={(v) => set({ strokeWidth: v })} />
        </Section>
      )}

      {el.type === 'icon' && (
        <Section title="Icon">
          <Field label="Name">
            <Select value={p.name} options={ICON_NAMES} onChange={(v) => set({ name: v })} />
          </Field>
          <Num label="Size" value={p.size} onChange={(v) => set({ size: v, width: v, height: v })} />
          <Color label="Color" value={p.color} onChange={(v) => set({ color: v })} />
        </Section>
      )}

      {el.type === 'image' && (
        <Section title="Image">
          <button
            onClick={() => onEditImage?.(el.id)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 text-sm font-medium"
          >
            <SlidersHorizontal size={15} /> Adjust image
          </button>
          <Field label="Fit">
            <Select value={p.fit} options={['cover', 'contain', 'fill']} onChange={(v) => set({ fit: v })} />
          </Field>
          <Num label="Radius" value={p.borderRadius} onChange={(v) => set({ borderRadius: v })} />
          <Range label="Brightness" value={p.brightness} min={0} max={200} step={1} onChange={(v) => set({ brightness: v })} />
          <Range label="Contrast" value={p.contrast} min={0} max={200} step={1} onChange={(v) => set({ contrast: v })} />
          <Range label="Saturation" value={p.saturation} min={0} max={200} step={1} onChange={(v) => set({ saturation: v })} />
          <Range label="Blur" value={p.blur} min={0} max={20} step={0.5} onChange={(v) => set({ blur: v })} />
        </Section>
      )}
    </aside>
  );
}

/* ------------------------------ UI atoms ------------------------------ */

function Section({ title, children }) {
  return (
    <div className="px-4 py-3 border-b border-edge space-y-2">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{title}</p>
      {children}
    </div>
  );
}
const Row = ({ children }) => <div className="grid grid-cols-2 gap-2">{children}</div>;
const Field = ({ label, children }) => (
  <label className="block">
    <span className="text-xs text-neutral-400">{label}</span>
    {children}
  </label>
);

function Num({ label, value, onChange, step = 1 }) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="input"
      />
    </Field>
  );
}

function Color({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 rounded bg-panel2 border border-edge cursor-pointer" />
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} className="input flex-1" />
      </div>
    </Field>
  );
}

function Range({ label, value, onChange, min, max, step }) {
  return (
    <Field label={`${label} (${value})`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-accent" />
    </Field>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function toHex(v = '#000000') {
  if (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v.length === 4
    ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
  return '#000000';
}
