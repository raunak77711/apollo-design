import { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Circle,
  Copy,
  Group,
  ImageIcon,
  Minus,
  RectangleHorizontal,
  Repeat2,
  SlidersHorizontal,
  Square,
  Star,
  Trash2,
  Type,
  Ungroup,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { alignOperations, boundsOf, distributeOperations } from '../../design/arrange.js';
import { FONTS } from '../../design/fonts.js';
import { ICON_NAMES, getIcon } from '../../design/icons.js';
import { PRESETS, presetLabel, ratioLabel } from '../../design/presets.js';
import { ColorField, NumberField, Row, SelectField, Segmented, SliderField } from '../../ui/fields.jsx';
import { IconButton, Tooltip } from '../../ui/primitives.jsx';
import { MenuItem, Popover } from '../../ui/overlay.jsx';

const TYPE_META = {
  text: { icon: Type, label: 'Text' },
  image: { icon: ImageIcon, label: 'Image' },
  icon: { icon: Star, label: 'Icon' },
  rectangle: { icon: Square, label: 'Rectangle' },
  circle: { icon: Circle, label: 'Ellipse' },
  line: { icon: Minus, label: 'Line' },
  button: { icon: RectangleHorizontal, label: 'Button' },
  group: { icon: Group, label: 'Group' },
};

const WEIGHTS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extrabold' },
  { value: '900', label: 'Black' },
];

const CANVAS_SWATCHES = ['#0A0A0B', '#111110', '#F5F4F1', '#FFFFFF', '#12100E', '#D9A441'];

/**
 * The right column. It only ever shows controls for what is actually selected —
 * document settings when nothing is, arrangement when several things are.
 */
export default function Inspector({ onEditImage, onPickImage }) {
  const selection = useSelection();

  return (
    <aside className="thin-scroll flex h-full w-[300px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface">
      {selection.length === 0 && <DesignPanel />}
      {selection.length === 1 && (
        <ElementPanel element={selection[0]} onEditImage={onEditImage} onPickImage={onPickImage} />
      )}
      {selection.length > 1 && <ArrangePanel selection={selection} />}
    </aside>
  );
}

/* ------------------------------ no selection ----------------------------- */

function DesignPanel() {
  const { state, actions } = useEditor();
  const canvas = state.document.canvas;
  const setCanvas = (changes) => actions.apply([{ type: 'SET_CANVAS', changes }]);
  // Scrubbing a canvas dimension is one gesture, so it should be one history step.
  const liveCanvas = (changes) => actions.applyTransient([{ type: 'SET_CANVAS', changes }]);

  return (
    <>
      <PanelHeader title="Design" meta={ratioLabel(canvas.width, canvas.height)} />

      <Section label="Canvas">
        <Row>
          <NumberField
            label="W"
            value={canvas.width}
            min={16}
            max={8000}
            onChange={(width) => liveCanvas({ width })}
            onCommit={actions.commitTransient}
          />
          <NumberField
            label="H"
            value={canvas.height}
            min={16}
            max={8000}
            onChange={(height) => liveCanvas({ height })}
            onCommit={actions.commitTransient}
          />
        </Row>
        <Popover
          align="start"
          panelClassName="w-56 max-h-64 overflow-y-auto thin-scroll"
          button={({ toggle }) => (
            <button
              onClick={toggle}
              className="flex h-8 w-full items-center justify-between rounded border border-line bg-raised px-2 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              Resize to preset
              <Repeat2 size={13} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              {PRESETS.map((preset) => (
                <MenuItem
                  key={preset.id}
                  hint={presetLabel(preset)}
                  onClick={() => {
                    setCanvas({ width: preset.width, height: preset.height });
                    close();
                  }}
                >
                  {preset.name}
                </MenuItem>
              ))}
            </>
          )}
        </Popover>
      </Section>

      <Section label="Background">
        <ColorField value={canvas.background} onChange={(background) => setCanvas({ background })} />
        <div className="flex flex-wrap gap-1.5">
          {CANVAS_SWATCHES.map((color) => (
            <button
              key={color}
              onClick={() => setCanvas({ background: color })}
              aria-label={`Background ${color}`}
              className={cx(
                'h-6 w-6 rounded border transition-transform duration-150 hover:scale-110',
                canvas.background?.toLowerCase() === color.toLowerCase() ? 'border-accent' : 'border-line-strong'
              )}
              style={{ background: color }}
            />
          ))}
        </div>
      </Section>

      <Section label="Document">
        <dl className="space-y-1.5">
          <Stat label="Layers" value={state.document.elements.length} />
          <Stat label="Ratio" value={ratioLabel(canvas.width, canvas.height)} />
          <Stat label="History" value={`${state.past.length} step${state.past.length === 1 ? '' : 's'}`} />
        </dl>
      </Section>

      <p className="mt-auto border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-3">
        Select a layer to edit it, or drag a box on the canvas to select several.
      </p>
    </>
  );
}

/* ---------------------------- single selection --------------------------- */

function ElementPanel({ element, onEditImage, onPickImage }) {
  const { state, actions } = useEditor();
  const p = element.properties;

  const set = (changes) => actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes }]);
  const live = (changes) => actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes }]);
  const commit = () => actions.commitTransient();

  const meta = TYPE_META[element.type] || TYPE_META.rectangle;

  return (
    <>
      <PanelHeader
        title={meta.label}
        icon={meta.icon}
        actions={
          <>
            <Tooltip label="Bring forward" side="bottom">
              <IconButton
                aria-label="Bring forward"
                onClick={() => actions.apply([{ type: 'REORDER_ELEMENT', targetId: element.id, direction: 'front' }])}
              >
                <ArrowUpToLine size={14} />
              </IconButton>
            </Tooltip>
            <Tooltip label="Send backward" side="bottom">
              <IconButton
                aria-label="Send backward"
                onClick={() => actions.apply([{ type: 'REORDER_ELEMENT', targetId: element.id, direction: 'back' }])}
              >
                <ArrowDownToLine size={14} />
              </IconButton>
            </Tooltip>
            <Tooltip label="Duplicate" hint="⌘D" side="bottom">
              <IconButton
                aria-label="Duplicate"
                onClick={() => actions.apply([{ type: 'DUPLICATE_ELEMENT', targetId: element.id }])}
              >
                <Copy size={13} />
              </IconButton>
            </Tooltip>
            <Tooltip label="Delete" hint="⌫" side="bottom">
              <IconButton
                aria-label="Delete"
                variant="danger"
                onClick={() => actions.apply([{ type: 'DELETE_ELEMENT', targetId: element.id }], { selectIds: [] })}
              >
                <Trash2 size={13} />
              </IconButton>
            </Tooltip>
          </>
        }
      />

      {(element.type === 'text' || element.type === 'button') && (
        <>
          <Section label={element.type === 'button' ? 'Label' : 'Content'}>
            <textarea
              value={p.text}
              onChange={(e) => live({ text: e.target.value })}
              onBlur={commit}
              rows={element.type === 'button' ? 1 : 3}
              className="field thin-scroll h-auto resize-none py-1.5 leading-relaxed"
            />
          </Section>

          <Section label="Typography">
            <SelectField value={p.fontFamily} options={FONTS.map((f) => ({ value: f.value, label: f.label }))} onChange={(fontFamily) => set({ fontFamily })} />
            <Row>
              <NumberField label="Size" value={p.fontSize} min={4} max={800} onChange={(fontSize) => live({ fontSize })} onCommit={commit} />
              <SelectField value={String(p.fontWeight)} options={WEIGHTS} onChange={(w) => set({ fontWeight: Number(w) })} />
            </Row>
            {element.type === 'text' && (
              <Row>
                <NumberField label="LH" value={p.lineHeight} step={0.05} min={0.5} max={4} onChange={(lineHeight) => live({ lineHeight })} onCommit={commit} />
                <NumberField label="LS" value={p.letterSpacing} step={0.5} min={-20} max={80} onChange={(letterSpacing) => live({ letterSpacing })} onCommit={commit} />
              </Row>
            )}
            <Segmented
              className="w-full"
              value={p.align}
              onChange={(align) => set({ align })}
              options={[
                { value: 'left', title: 'Align left', icon: AlignStartVertical },
                { value: 'center', title: 'Align centre', icon: AlignCenterVertical },
                { value: 'right', title: 'Align right', icon: AlignEndVertical },
              ]}
            />
            <ColorField label="Text" value={p.color} onChange={(color) => live({ color })} onCommit={commit} />
          </Section>
        </>
      )}

      {element.type === 'button' && (
        <Section label="Shape">
          <ColorField label="Fill" value={p.background} onChange={(background) => live({ background })} onCommit={commit} />
          <NumberField label="R" value={p.borderRadius} min={0} max={400} onChange={(borderRadius) => live({ borderRadius })} onCommit={commit} />
        </Section>
      )}

      {element.type === 'image' && (
        <Section label="Image">
          <div className="flex gap-1.5">
            <button
              onClick={() => onPickImage?.(element.id)}
              className="h-8 flex-1 rounded border border-line bg-raised text-[13px] text-ink transition-colors hover:border-line-strong"
            >
              {p.src ? 'Replace' : 'Choose image'}
            </button>
            <button
              onClick={() => onEditImage?.(element.id)}
              disabled={!p.src}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-line bg-raised text-[13px] text-ink transition-colors hover:border-line-strong disabled:opacity-40"
            >
              <SlidersHorizontal size={13} /> Adjust
            </button>
          </div>
          <SelectField label="Fit" value={p.fit} options={['cover', 'contain', 'fill']} onChange={(fit) => set({ fit })} />
          <NumberField label="R" value={p.borderRadius} min={0} max={4000} onChange={(borderRadius) => live({ borderRadius })} onCommit={commit} />
        </Section>
      )}

      {(element.type === 'rectangle' || element.type === 'circle') && (
        <Section label="Fill">
          <ColorField value={p.fill} onChange={(fill) => live({ fill })} onCommit={commit} />
          {element.type === 'rectangle' && (
            <NumberField label="R" value={p.borderRadius} min={0} max={4000} onChange={(borderRadius) => live({ borderRadius })} onCommit={commit} />
          )}
          <Row>
            <ColorField label="Border" value={p.borderColor || '#000000'} onChange={(borderColor) => live({ borderColor })} onCommit={commit} />
            <NumberField label="W" value={p.borderWidth} min={0} max={200} onChange={(borderWidth) => live({ borderWidth })} onCommit={commit} />
          </Row>
        </Section>
      )}

      {element.type === 'line' && (
        <Section label="Stroke">
          <ColorField value={p.stroke} onChange={(stroke) => live({ stroke })} onCommit={commit} />
          <NumberField label="W" value={p.strokeWidth} min={1} max={200} onChange={(strokeWidth) => live({ strokeWidth })} onCommit={commit} />
        </Section>
      )}

      {element.type === 'icon' && (
        <Section label="Icon">
          <IconPicker value={p.name} onChange={(name) => set({ name })} />
          <Row>
            <NumberField label="Size" value={p.size} min={8} max={800} onChange={(size) => live({ size, width: size, height: size })} onCommit={commit} />
            <NumberField label="Line" value={p.strokeWidth} step={0.25} min={0.5} max={4} onChange={(strokeWidth) => live({ strokeWidth })} onCommit={commit} />
          </Row>
          <ColorField label="Colour" value={p.color} onChange={(color) => live({ color })} onCommit={commit} />
        </Section>
      )}

      <Section label="Frame">
        <Row>
          <NumberField label="X" value={element.x} onChange={(x) => live({ x })} onCommit={commit} />
          <NumberField label="Y" value={element.y} onChange={(y) => live({ y })} onCommit={commit} />
        </Row>
        <Row>
          <NumberField label="W" value={element.width} min={1} onChange={(width) => live({ width })} onCommit={commit} />
          <NumberField label="H" value={element.height} min={1} onChange={(height) => live({ height })} onCommit={commit} />
        </Row>
        <Row>
          <NumberField label="°" value={element.rotation} onChange={(rotation) => live({ rotation })} onCommit={commit} />
          <div />
        </Row>
        <SliderField
          label="Opacity"
          value={Math.round((element.opacity ?? 1) * 100)}
          min={0}
          max={100}
          display={`${Math.round((element.opacity ?? 1) * 100)}%`}
          onChange={(v) => live({ opacity: v / 100 })}
          onCommit={commit}
        />
      </Section>

      <Section label="Align to canvas" last>
        <AlignGrid onAlign={(mode) => actions.apply(alignOperations([element], state.document.canvas, mode))} />
      </Section>
    </>
  );
}

/* ---------------------------- multi selection ---------------------------- */

function ArrangePanel({ selection }) {
  const { state, actions } = useEditor();
  const box = boundsOf(selection);
  const ids = selection.map((el) => el.id);

  return (
    <>
      <PanelHeader title={`${selection.length} layers`} meta="Selected" />

      <Section label="Align">
        <AlignGrid onAlign={(mode) => actions.apply(alignOperations(selection, state.document.canvas, mode))} />
        <div className="flex gap-1.5">
          <ArrangeButton
            label="Space horizontally"
            icon={AlignHorizontalSpaceAround}
            disabled={selection.length < 3}
            onClick={() => actions.apply(distributeOperations(selection, 'x'))}
          />
          <ArrangeButton
            label="Space vertically"
            icon={AlignVerticalSpaceAround}
            disabled={selection.length < 3}
            onClick={() => actions.apply(distributeOperations(selection, 'y'))}
          />
        </div>
      </Section>

      <Section label="Group">
        <div className="flex gap-1.5">
          <ArrangeButton label="Group" icon={Group} onClick={() => actions.apply([{ type: 'GROUP_ELEMENTS', targetIds: ids }])} />
          <ArrangeButton
            label="Ungroup"
            icon={Ungroup}
            disabled={!selection.some((el) => el.type === 'group')}
            onClick={() =>
              actions.apply(
                selection.filter((el) => el.type === 'group').map((el) => ({ type: 'UNGROUP_ELEMENTS', targetId: el.id }))
              )
            }
          />
        </div>
      </Section>

      <Section label="Bounds">
        <dl className="space-y-1.5">
          <Stat label="Position" value={`${Math.round(box.x)}, ${Math.round(box.y)}`} />
          <Stat label="Size" value={`${Math.round(box.width)} × ${Math.round(box.height)}`} />
        </dl>
      </Section>

      <Section label="Layers" last>
        <div className="flex gap-1.5">
          <ArrangeButton
            label="Duplicate"
            icon={Copy}
            onClick={() => actions.apply(ids.map((id) => ({ type: 'DUPLICATE_ELEMENT', targetId: id })))}
          />
          <ArrangeButton
            label="Delete"
            icon={Trash2}
            danger
            onClick={() => actions.apply(ids.map((id) => ({ type: 'DELETE_ELEMENT', targetId: id })), { selectIds: [] })}
          />
        </div>
      </Section>
    </>
  );
}

/* -------------------------------- pieces -------------------------------- */

function PanelHeader({ title, meta, icon: Icon, actions }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
      {Icon && <Icon size={14} className="shrink-0 text-ink-3" />}
      <h2 className="flex-1 truncate text-[13px] font-medium text-ink">{title}</h2>
      {meta && <span className="num text-2xs text-ink-3">{meta}</span>}
      {actions && <div className="flex items-center gap-0.5">{actions}</div>}
    </header>
  );
}

function Section({ label, children, last }) {
  return (
    <section className={cx('space-y-2.5 px-3 py-3.5', !last && 'border-b border-line')}>
      <p className="label">{label}</p>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num text-xs text-ink-2">{value}</dd>
    </div>
  );
}

const ALIGN_BUTTONS = [
  { mode: 'left', label: 'Align left', icon: AlignStartVertical },
  { mode: 'center', label: 'Align centre', icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', icon: AlignStartHorizontal },
  { mode: 'middle', label: 'Align middle', icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
];

function AlignGrid({ onAlign }) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {ALIGN_BUTTONS.map(({ mode, label, icon: Icon }) => (
        <Tooltip key={mode} label={label} side="bottom">
          <button
            onClick={() => onAlign(mode)}
            aria-label={label}
            className="flex h-8 w-full items-center justify-center rounded border border-line bg-raised text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            <Icon size={14} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function ArrangeButton({ label, icon: Icon, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-line bg-raised text-xs transition-colors duration-150',
        'hover:border-line-strong disabled:opacity-40',
        danger ? 'text-danger' : 'text-ink-2 hover:text-ink'
      )}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function IconPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const Current = getIcon(value);
  const names = ICON_NAMES.filter((n) => n.toLowerCase().includes(query.toLowerCase()));

  return (
    <Popover
      panelClassName="w-[15.5rem] p-2"
      button={({ toggle }) => (
        <button
          onClick={toggle}
          className="flex h-8 w-full items-center gap-2 rounded border border-line bg-raised px-2 text-[13px] text-ink transition-colors hover:border-line-strong"
        >
          <Current size={14} className="text-ink-2" />
          <span className="flex-1 truncate text-left">{value}</span>
        </button>
      )}
    >
      {({ close }) => (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons"
            className="field mb-2"
          />
          <div className="thin-scroll grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
            {names.map((name) => {
              const Icon = getIcon(name);
              return (
                <button
                  key={name}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    close();
                  }}
                  className={cx(
                    'flex h-8 w-full items-center justify-center rounded transition-colors duration-150',
                    name === value ? 'bg-raised text-accent-text' : 'text-ink-2 hover:bg-raised hover:text-ink'
                  )}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </Popover>
  );
}
