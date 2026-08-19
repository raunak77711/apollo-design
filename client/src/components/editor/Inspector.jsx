import { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronRight,
  Copy,
  Crop,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  FolderPlus,
  Italic,
  Link2,
  Link2Off,
  Lock,
  LockOpen,
  PenTool,
  Plus,
  Repeat2,
  SlidersHorizontal,
  Trash2,
  Underline,
  Ungroup,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useLocalState } from '../../lib/useLocalState.js';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { useLayerActions } from '../../state/useLayerActions.js';
import { alignOperations, boundsOf, distributeOperations } from '../../design/arrange.js';
import { childrenOf } from '../../design/tree.js';
import { TYPE_META, layerLabel, typeLabel } from '../../design/layers.js';
import { cssGradient, joinAlpha, splitAlpha } from '../../design/color.js';
import { FONTS } from '../../design/fonts.js';
import { ICON_LIBRARIES, getIcon, iconNames } from '../../design/icons.js';
import { PRESETS, presetLabel, ratioLabel } from '../../design/presets.js';
import { BLEND_MODES, CHART_TYPES, DEFAULT_SHADOW, STROKE_STYLES } from '../../design/schema.js';
import {
  ActionButton,
  ColorField,
  IconToggle,
  NumberField,
  PropRow,
  Row,
  SelectField,
  Segmented,
  SliderRow,
  TextField,
  Toggle,
} from '../../ui/fields.jsx';
import { IconButton, Tooltip } from '../../ui/primitives.jsx';
import { MenuItem, Popover } from '../../ui/overlay.jsx';

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

const HAS_RADIUS = new Set(['rectangle', 'image', 'button']);
const HAS_FILL = new Set(['rectangle', 'circle', 'polygon', 'star']);
const HAS_STROKE = new Set(['rectangle', 'circle', 'polygon', 'star', 'line', 'button']);

/**
 * The properties inspector. It only ever shows controls for what is actually
 * selected — document settings when nothing is, arrangement when several things
 * are — and leads with whatever matters most for the type in hand.
 */
export default function Inspector({ onEditImage, onPickImage, onDraw }) {
  const selection = useSelection();

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
      {selection.length === 0 && <DesignPanel />}
      {selection.length === 1 && (
        <ElementPanel element={selection[0]} onEditImage={onEditImage} onPickImage={onPickImage} onDraw={onDraw} />
      )}
      {selection.length > 1 && <ArrangePanel selection={selection} />}
    </div>
  );
}

/* ------------------------------ no selection ----------------------------- */

function DesignPanel() {
  const { state, actions } = useEditor();
  const canvas = state.document.canvas;
  const view = state.view;
  const setCanvas = (changes) => actions.apply([{ type: 'SET_CANVAS', changes }]);
  // Scrubbing a canvas dimension is one gesture, so it should be one history step.
  const liveCanvas = (changes) => actions.applyTransient([{ type: 'SET_CANVAS', changes }]);

  return (
    <>
      <Section id="canvas" label="Canvas">
        <Row>
          <NumberField
            label="W"
            name="Canvas width"
            value={canvas.width}
            min={16}
            max={8000}
            onChange={(width) => liveCanvas({ width })}
            onCommit={actions.commitTransient}
          />
          <NumberField
            label="H"
            name="Canvas height"
            value={canvas.height}
            min={16}
            max={8000}
            onChange={(height) => liveCanvas({ height })}
            onCommit={actions.commitTransient}
          />
        </Row>
        <div className="flex gap-1.5">
          <Popover
            align="start"
            className="min-w-0 flex-1"
            panelClassName="w-56 max-h-64 overflow-y-auto thin-scroll"
            button={({ toggle }) => (
              <button
                onClick={toggle}
                className="flex h-7 w-full items-center justify-between gap-1.5 rounded border border-line bg-raised px-2 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
              >
                <span className="truncate">Resize to preset</span>
                <Repeat2 size={12} className="shrink-0" />
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
          <Tooltip label="Swap orientation" side="bottom" className="shrink-0">
            <IconToggle
              icon={FlipHorizontal2}
              label="Swap orientation"
              onClick={() => setCanvas({ width: canvas.height, height: canvas.width })}
            />
          </Tooltip>
        </div>
        <Stat label="Ratio" value={ratioLabel(canvas.width, canvas.height)} />
      </Section>

      <Section id="background" label="Background">
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

      <Section id="grid" label="Grid">
        <SwitchRow label="Show" hint="Grid lines" checked={view.grid} onChange={(grid) => actions.setView({ grid })} />
        <PropRow label="Size">
          <NumberField
            name="Grid size"
            value={view.gridSize}
            min={4}
            max={400}
            suffix="px"
            onChange={(gridSize) => actions.setView({ gridSize })}
            className="w-full"
          />
        </PropRow>
      </Section>

      <Section id="snapping" label="Snapping">
        <SwitchRow
          label="Objects"
          hint="Edges and centres"
          checked={view.snapObjects}
          onChange={(snapObjects) => actions.setView({ snapObjects })}
        />
        <SwitchRow label="Grid" checked={view.snapGrid} onChange={(snapGrid) => actions.setView({ snapGrid })} />
      </Section>

      <Section id="document" label="Document" defaultOpen={false}>
        <Stat label="Layers" value={state.document.elements.length} />
        <Stat label="History" value={`${state.past.length} step${state.past.length === 1 ? '' : 's'}`} />
      </Section>

      <p className="px-2.5 py-3 text-2xs leading-relaxed text-ink-3">
        Select a layer to edit it, or drag a box on the canvas to select several.
      </p>
    </>
  );
}

/* ---------------------------- single selection --------------------------- */

function ElementPanel({ element, onEditImage, onPickImage, onDraw }) {
  const { state, actions } = useEditor();
  const layers = useLayerActions();
  const p = element.properties;
  const isGroup = element.type === 'group';
  const inherited = inheritedState(state.document.elements, element);
  const frozen = element.locked || inherited.locked;

  const set = (changes) => actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes }]);
  const live = (changes) => actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes }]);
  const commit = () => actions.commitTransient();

  const text = element.type === 'text' || element.type === 'button';

  return (
    <>
      <LayerHeader element={element} layers={layers} inherited={inherited} />

      {/* A locked layer still shows everything about itself; it just cannot be
          edited until it is unlocked from the header above. */}
      <div className={cx(frozen && 'pointer-events-none select-none opacity-45')}>
        {text && (
          <Section id="text" label={element.type === 'button' ? 'Label' : 'Text'}>
            <textarea
              value={p.text}
              onChange={(e) => live({ text: e.target.value })}
              onBlur={commit}
              rows={element.type === 'button' ? 1 : 3}
              aria-label="Text content"
              className="field thin-scroll h-auto resize-none py-1.5 leading-relaxed"
            />
            <SelectField name="Font family" value={p.fontFamily} options={FONTS.map((f) => ({ value: f.value, label: f.label }))} onChange={(fontFamily) => set({ fontFamily })} />
            <Row>
              <NumberField label="Size" name="Font size" value={p.fontSize} min={4} max={800} onChange={(fontSize) => live({ fontSize })} onCommit={commit} />
              <SelectField name="Font weight" value={String(p.fontWeight)} options={WEIGHTS} onChange={(w) => set({ fontWeight: Number(w) })} />
            </Row>
            <Row>
              <NumberField label="LH" name="Line height" value={p.lineHeight ?? 1.2} step={0.05} min={0.5} max={4} onChange={(lineHeight) => live({ lineHeight })} onCommit={commit} />
              <NumberField label="LS" name="Letter spacing" value={p.letterSpacing ?? 0} step={0.5} min={-20} max={80} onChange={(letterSpacing) => live({ letterSpacing })} onCommit={commit} />
            </Row>
            <div className="flex gap-1.5">
              <Segmented
                className="flex-1"
                value={p.align}
                onChange={(align) => set({ align })}
                options={[
                  { value: 'left', title: 'Align left', icon: AlignLeft },
                  { value: 'center', title: 'Align centre', icon: AlignCenter },
                  { value: 'right', title: 'Align right', icon: AlignRight },
                ]}
              />
              <IconToggle icon={Italic} label="Italic" active={p.italic} onClick={() => set({ italic: !p.italic })} />
              <IconToggle icon={Underline} label="Underline" active={p.underline} onClick={() => set({ underline: !p.underline })} />
            </div>
            <PropRow label="Case">
              <SelectField
                name="Text case"
                className="w-full"
                value={p.textCase || 'none'}
                options={[
                  { value: 'none', label: 'As typed' },
                  { value: 'uppercase', label: 'UPPERCASE' },
                  { value: 'lowercase', label: 'lowercase' },
                  { value: 'capitalize', label: 'Title Case' },
                ]}
                onChange={(textCase) => set({ textCase })}
              />
            </PropRow>
            <ColorField label="Colour" value={p.color} onChange={(color) => live({ color })} onCommit={commit} />
          </Section>
        )}

        {element.type === 'image' && (
          <ImageSection element={element} set={set} live={live} commit={commit} onEditImage={onEditImage} onPickImage={onPickImage} onDraw={onDraw} />
        )}

        {element.type === 'icon' && (
          <Section id="icon" label="Icon">
            <Segmented
              className="w-full"
              size="sm"
              value={p.library || 'lucide'}
              onChange={(library) => set({ library, name: iconNames(library)[0] })}
              options={ICON_LIBRARIES.map((l) => ({ value: l.id, label: l.label }))}
            />
            <IconPicker value={p.name} library={p.library || 'lucide'} onChange={(name) => set({ name })} />
            <Row>
              <NumberField label="Size" name="Icon size" value={p.size} min={8} max={800} onChange={(size) => live({ size, width: size, height: size })} onCommit={commit} />
              {(p.library || 'lucide') === 'lucide' && (
                <NumberField label="Line" name="Icon line weight" value={p.strokeWidth} step={0.25} min={0.5} max={4} onChange={(strokeWidth) => live({ strokeWidth })} onCommit={commit} />
              )}
            </Row>
            <ColorField label="Colour" value={p.color} onChange={(color) => live({ color })} onCommit={commit} />
          </Section>
        )}

        {(element.type === 'polygon' || element.type === 'star') && (
          <Section id="shape" label="Shape">
            {element.type === 'polygon' ? (
              <SliderRow
                label="Sides"
                value={p.sides ?? 3}
                min={3}
                max={12}
                display={String(p.sides ?? 3)}
                onChange={(sides) => live({ sides })}
                onCommit={commit}
              />
            ) : (
              <>
                <SliderRow
                  label="Points"
                  value={p.points ?? 5}
                  min={3}
                  max={16}
                  display={String(p.points ?? 5)}
                  onChange={(points) => live({ points })}
                  onCommit={commit}
                />
                <SliderRow
                  label="Depth"
                  value={Math.round((p.depth ?? 0.45) * 100)}
                  min={5}
                  max={95}
                  display={`${Math.round((p.depth ?? 0.45) * 100)}%`}
                  onChange={(v) => live({ depth: v / 100 })}
                  onCommit={commit}
                />
              </>
            )}
          </Section>
        )}

        {element.type === 'chart' && <ChartSection p={p} live={live} set={set} commit={commit} />}

        {(HAS_FILL.has(element.type) || HAS_STROKE.has(element.type)) && (
          <Section id="fill" label="Fill & stroke">
            {HAS_FILL.has(element.type) && (
              <>
                {/* A gradient paints over the flat fill, so it is shown here
                    rather than left to silently override the colour above. */}
                {p.gradient && <GradientRow gradient={p.gradient} onClear={() => set({ gradient: null })} />}
                <ColorField label="Fill" value={p.fill} onChange={(fill) => live({ fill })} onCommit={commit} />
                <SliderRow
                  label="Fill %"
                  value={Math.round((p.fillOpacity ?? 1) * 100)}
                  display={`${Math.round((p.fillOpacity ?? 1) * 100)}%`}
                  onChange={(v) => live({ fillOpacity: v / 100 })}
                  onCommit={commit}
                />
              </>
            )}
            {element.type === 'button' && (
              <ColorField label="Fill" value={p.background} onChange={(background) => live({ background })} onCommit={commit} />
            )}
            {element.type === 'line' ? (
              <>
                <ColorField label="Stroke" value={p.stroke} onChange={(stroke) => live({ stroke })} onCommit={commit} />
                <Row>
                  <NumberField label="W" name="Stroke width" value={p.strokeWidth} min={1} max={200} onChange={(strokeWidth) => live({ strokeWidth })} onCommit={commit} />
                  <SelectField name="Stroke style" value={p.strokeStyle || 'solid'} options={STROKE_STYLES.map((style) => ({ value: style, label: style[0].toUpperCase() + style.slice(1) }))} onChange={(strokeStyle) => set({ strokeStyle })} />
                </Row>
              </>
            ) : (
              <>
                <ColorField label="Stroke" value={p.borderColor || '#000000'} onChange={(borderColor) => live({ borderColor })} onCommit={commit} />
                <Row>
                  <NumberField label="W" name="Stroke width" value={p.borderWidth ?? 0} min={0} max={200} onChange={(borderWidth) => live({ borderWidth })} onCommit={commit} />
                  <SelectField name="Stroke style" value={p.strokeStyle || 'solid'} options={STROKE_STYLES.map((style) => ({ value: style, label: style[0].toUpperCase() + style.slice(1) }))} onChange={(strokeStyle) => set({ strokeStyle })} />
                </Row>
              </>
            )}
            {HAS_RADIUS.has(element.type) && (
              <PropRow label="Radius">
                <NumberField
                  name="Corner radius"
                  value={p.borderRadius ?? 0}
                  min={0}
                  max={4000}
                  suffix="px"
                  className="w-full"
                  onChange={(borderRadius) => live({ borderRadius })}
                  onCommit={commit}
                />
              </PropRow>
            )}
          </Section>
        )}

        <TransformSection element={element} live={live} set={set} commit={commit} />

        <Section id="appearance" label="Appearance">
          <SliderRow
            label="Opacity"
            value={Math.round((element.opacity ?? 1) * 100)}
            display={`${Math.round((element.opacity ?? 1) * 100)}%`}
            onChange={(v) => live({ opacity: v / 100 })}
            onCommit={commit}
          />
          {!isGroup && (
            <>
              <PropRow label="Blend">
                <SelectField
                  name="Blend mode"
                  className="w-full"
                  value={element.blendMode || 'normal'}
                  options={BLEND_MODES.map((mode) => ({ value: mode, label: blendLabel(mode) }))}
                  onChange={(blendMode) => set({ blendMode })}
                />
              </PropRow>
              <SliderRow
                label="Blur"
                value={element.layerBlur || 0}
                max={40}
                step={0.5}
                display={`${element.layerBlur || 0}px`}
                onChange={(layerBlur) => live({ layerBlur })}
                onCommit={commit}
              />
              <ShadowControls element={element} set={set} live={live} commit={commit} />
            </>
          )}
        </Section>

        {isGroup && (
          <Section id="contents" label="Contents">
            <Stat label="Layers inside" value={childrenOf(state.document.elements, element.id).length} />
            <div className="flex gap-1.5">
              <ActionButton icon={Ungroup} label="Ungroup" onClick={() => layers.ungroup([element.id])} />
            </div>
          </Section>
        )}

        <Section id="align-single" label="Align to canvas" defaultOpen={false}>
          <AlignGrid onAlign={(mode) => actions.apply(alignOperations([element], state.document.canvas, mode, 'canvas'))} />
        </Section>
      </div>
    </>
  );
}

/* ------------------------------ layer header ----------------------------- */

function LayerHeader({ element, layers, inherited }) {
  const meta = TYPE_META[element.type] || TYPE_META.rectangle;
  const Icon = meta.icon;
  const [draft, setDraft] = useState(layerLabel(element));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(layerLabel(element));
  }, [element.id, element.name, element.properties]);

  return (
    <header className="border-b border-line bg-void/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-raised text-ink-2">
          <Icon size={13} />
        </span>
        <input
          value={draft}
          aria-label="Layer name"
          onFocus={() => {
            editing.current = true;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            editing.current = false;
            layers.rename(element.id, draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(layerLabel(element));
              e.currentTarget.blur();
            }
          }}
          className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-[13px] font-medium text-ink outline-none transition-colors hover:border-line focus:border-accent/70 focus:bg-raised"
        />
      </div>

      <div className="mt-1.5 flex items-center gap-0.5">
        <span className="label flex-1 truncate">{typeLabel(element)}</span>
        <Tooltip label={element.locked ? 'Unlock' : 'Lock'} hint="⇧⌘L" side="bottom">
          <IconButton
            aria-label={element.locked ? 'Unlock layer' : 'Lock layer'}
            active={element.locked}
            onClick={() => layers.toggleLocked([element.id])}
          >
            {element.locked || inherited.locked ? <Lock size={13} /> : <LockOpen size={13} />}
          </IconButton>
        </Tooltip>
        <Tooltip label={element.hidden ? 'Show' : 'Hide'} hint="⇧⌘H" side="bottom">
          <IconButton
            aria-label={element.hidden ? 'Show layer' : 'Hide layer'}
            active={element.hidden}
            onClick={() => layers.toggleHidden([element.id])}
          >
            {element.hidden || inherited.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </IconButton>
        </Tooltip>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <Tooltip label="Bring forward" hint="]" side="bottom">
          <IconButton aria-label="Bring forward" onClick={() => layers.arrange('forward', [element.id])}>
            <ArrowUp size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Send backward" hint="[" side="bottom">
          <IconButton aria-label="Send backward" onClick={() => layers.arrange('backward', [element.id])}>
            <ArrowDown size={13} />
          </IconButton>
        </Tooltip>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <Tooltip label="Duplicate" hint="⌘D" side="bottom">
          <IconButton aria-label="Duplicate layer" onClick={() => layers.duplicate([element.id])}>
            <Copy size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Delete" hint="⌫" side="bottom">
          <IconButton aria-label="Delete layer" variant="danger" onClick={() => layers.remove([element.id])}>
            <Trash2 size={13} />
          </IconButton>
        </Tooltip>
      </div>

      {inherited.locked && !element.locked && (
        <p className="mt-2 rounded border border-line bg-raised px-2 py-1.5 text-2xs text-ink-3">
          Locked by its group — unlock the group to edit this layer.
        </p>
      )}
    </header>
  );
}

/* -------------------------------- transform ------------------------------ */

function TransformSection({ element, live, set, commit }) {
  const ratio = element.width / Math.max(1, element.height);
  const locked = Boolean(element.lockAspect);

  const setSize = (key, value) => {
    if (!locked) return live({ [key]: value });
    return key === 'width'
      ? live({ width: value, height: Math.max(1, Math.round(value / ratio)) })
      : live({ height: value, width: Math.max(1, Math.round(value * ratio)) });
  };

  return (
    <Section id="transform" label="Transform">
      <Row>
        <NumberField label="X" name="X position" value={Math.round(element.x)} onChange={(x) => live({ x })} onCommit={commit} />
        <NumberField label="Y" name="Y position" value={Math.round(element.y)} onChange={(y) => live({ y })} onCommit={commit} />
      </Row>
      <div className="flex items-center gap-1.5">
        <NumberField label="W" name="Width" className="min-w-0 flex-1" value={Math.round(element.width)} min={1} onChange={(width) => setSize('width', width)} onCommit={commit} />
        <Tooltip label={locked ? 'Aspect ratio locked' : 'Lock aspect ratio'} side="left">
          <IconToggle
            icon={locked ? Link2 : Link2Off}
            label="Lock aspect ratio"
            active={locked}
            onClick={() => set({ lockAspect: !locked })}
          />
        </Tooltip>
        <NumberField label="H" name="Height" className="min-w-0 flex-1" value={Math.round(element.height)} min={1} onChange={(height) => setSize('height', height)} onCommit={commit} />
      </div>
      <div className="flex items-center gap-1.5">
        <NumberField
          label="°"
          name="Rotation"
          className="min-w-0 flex-1"
          value={Math.round(element.rotation || 0)}
          min={-360}
          max={360}
          onChange={(rotation) => live({ rotation })}
          onCommit={commit}
        />
        <ScaleField element={element} onScale={(factor) => set({ width: Math.max(1, Math.round(element.width * factor)), height: Math.max(1, Math.round(element.height * factor)) })} />
        <IconToggle icon={FlipHorizontal2} label="Flip horizontally" active={element.flipH} onClick={() => set({ flipH: !element.flipH })} />
        <IconToggle icon={FlipVertical2} label="Flip vertically" active={element.flipV} onClick={() => set({ flipV: !element.flipV })} />
      </div>
    </Section>
  );
}

/** Scales the frame by a percentage, then returns to 100 — a relative control. */
function ScaleField({ element, onScale }) {
  const [draft, setDraft] = useState('100');

  useEffect(() => setDraft('100'), [element.id]);

  const commit = () => {
    const value = parseFloat(draft);
    if (Number.isFinite(value) && value > 0 && value !== 100) onScale(Math.min(1000, value) / 100);
    setDraft('100');
  };

  return (
    <Tooltip label="Scale by" side="bottom">
      <span className="flex h-7 w-16 items-center rounded border border-line bg-raised transition-colors focus-within:border-accent/70 hover:border-line-strong">
        <span className="flex h-full w-5 shrink-0 select-none items-center justify-center font-mono text-2xs uppercase text-ink-3">S</span>
        <input
          value={draft}
          inputMode="decimal"
          aria-label="Scale by percentage"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-full min-w-0 bg-transparent font-mono text-xs tabular-nums text-ink outline-none"
        />
        <span className="pr-2 font-mono text-2xs text-ink-3">%</span>
      </span>
    </Tooltip>
  );
}

/* -------------------------------- shadow --------------------------------- */

function ShadowControls({ element, set, live, commit }) {
  const shadow = element.shadow;
  const { hex, alpha } = splitAlpha(shadow?.color || DEFAULT_SHADOW.color);

  return (
    <>
      <SwitchRow
        label="Shadow"
        checked={Boolean(shadow)}
        onChange={(on) => set({ shadow: on ? { ...DEFAULT_SHADOW } : null })}
      />
      {shadow && (
        <div className="space-y-2 border-l border-line pl-2.5">
          <Row>
            <NumberField label="X" name="Shadow offset X" value={shadow.x} min={-200} max={200} onChange={(x) => live({ shadow: { ...shadow, x } })} onCommit={commit} />
            <NumberField label="Y" name="Shadow offset Y" value={shadow.y} min={-200} max={200} onChange={(y) => live({ shadow: { ...shadow, y } })} onCommit={commit} />
          </Row>
          <PropRow label="Blur">
            <NumberField
              name="Shadow blur"
              className="w-full"
              value={shadow.blur}
              min={0}
              max={200}
              suffix="px"
              onChange={(blur) => live({ shadow: { ...shadow, blur } })}
              onCommit={commit}
            />
          </PropRow>
          <ColorField
            label="Colour"
            value={hex}
            onChange={(next) => live({ shadow: { ...shadow, color: joinAlpha(next, alpha) } })}
            onCommit={commit}
          />
          <SliderRow
            label="Strength"
            value={Math.round(alpha * 100)}
            display={`${Math.round(alpha * 100)}%`}
            onChange={(v) => live({ shadow: { ...shadow, color: joinAlpha(hex, v / 100) } })}
            onCommit={commit}
          />
        </div>
      )}
    </>
  );
}

/* --------------------------------- image --------------------------------- */

function ImageSection({ element, set, live, commit, onEditImage, onPickImage, onDraw }) {
  const p = element.properties;

  return (
    <>
      <Section id="image" label="Image">
        <div className="flex gap-1.5">
          <ActionButton label={p.src ? 'Replace' : 'Choose image'} onClick={() => onPickImage?.(element.id)} />
          <ActionButton icon={SlidersHorizontal} label="Adjust" disabled={!p.src} onClick={() => onEditImage?.(element.id)} />
        </div>
        <ActionButton icon={PenTool} label="Draw" onClick={() => onDraw?.(element.id)} />
        <PropRow label="Fit">
          <Segmented
            className="w-full"
            value={p.fit}
            onChange={(fit) => set({ fit })}
            options={[
              { value: 'cover', label: 'Fill' },
              { value: 'contain', label: 'Fit' },
              { value: 'fill', label: 'Stretch' },
            ]}
          />
        </PropRow>
        {p.src && p.fit === 'cover' && (
          <>
            <PropRow label="Crop" align="start">
              <CropPad element={element} onChange={(next) => live(next)} onCommit={commit} />
              <p className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-3">Drag to set the focal point.</p>
            </PropRow>
            <SliderRow
              label="Zoom"
              value={Math.round((p.zoom ?? 1) * 100)}
              min={100}
              max={400}
              display={`${Math.round((p.zoom ?? 1) * 100)}%`}
              onChange={(v) => live({ zoom: v / 100 })}
              onCommit={commit}
            />
          </>
        )}
        <PropRow label="Radius">
          <NumberField
            name="Corner radius"
            className="w-full"
            value={p.borderRadius ?? 0}
            min={0}
            max={4000}
            suffix="px"
            onChange={(borderRadius) => live({ borderRadius })}
            onCommit={commit}
          />
        </PropRow>
      </Section>

      {p.src && (
        <Section id="adjust" label="Adjustments" defaultOpen={false}>
          <SliderRow label="Bright" value={p.brightness ?? 100} max={200} display={signed((p.brightness ?? 100) - 100)} onChange={(brightness) => live({ brightness })} onCommit={commit} />
          <SliderRow label="Contrast" value={p.contrast ?? 100} max={200} display={signed((p.contrast ?? 100) - 100)} onChange={(contrast) => live({ contrast })} onCommit={commit} />
          <SliderRow label="Saturate" value={p.saturation ?? 100} max={200} display={signed((p.saturation ?? 100) - 100)} onChange={(saturation) => live({ saturation })} onCommit={commit} />
          <SliderRow label="Mono" value={p.grayscale ?? 0} max={100} display={`${p.grayscale ?? 0}%`} onChange={(grayscale) => live({ grayscale })} onCommit={commit} />
          <SliderRow label="Blur" value={p.blur ?? 0} max={20} step={0.5} display={`${p.blur ?? 0}px`} onChange={(blur) => live({ blur })} onCommit={commit} />
          <ActionButton
            label="Reset adjustments"
            onClick={() => set({ brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0, hue: 0 })}
          />
        </Section>
      )}
    </>
  );
}

/** Chart type, colours and the dataset itself — every number here is hand-editable, not just AI-authored. */
function ChartSection({ p, live, set, commit }) {
  const data = p.data || [];

  const updateRow = (i, changes) => {
    const next = data.map((row, idx) => (idx === i ? { ...row, ...changes } : row));
    live({ data: next });
  };
  const removeRow = (i) => {
    if (data.length <= 2) return; // a chart needs at least two points to mean anything
    set({ data: data.filter((_, idx) => idx !== i) });
  };
  const addRow = () => {
    const n = data.length + 1;
    set({ data: [...data, { label: `Point ${n}`, value: Math.round((data[data.length - 1]?.value ?? 10) * 0.8) }] });
  };

  return (
    <Section id="chart" label="Chart">
      <PropRow label="Type">
        <Segmented
          className="w-full"
          value={p.chartType || 'bar'}
          onChange={(chartType) => set({ chartType })}
          options={CHART_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
        />
      </PropRow>
      <ColorField label="Colour" value={p.color} onChange={(color) => live({ color })} onCommit={commit} />
      <ColorField label="Labels" value={p.labelColor} onChange={(labelColor) => live({ labelColor })} onCommit={commit} />
      <SwitchRow label="Show values" checked={p.showValues !== false} onChange={(showValues) => set({ showValues })} />

      <div className="space-y-1.5 pt-1">
        {data.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <TextField
              className="min-w-0 flex-1"
              value={row.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              onBlur={commit}
            />
            <NumberField
              name={`Value ${i + 1}`}
              className="w-20"
              value={row.value}
              min={0}
              max={1000000}
              onChange={(value) => updateRow(i, { value })}
              onCommit={commit}
            />
            <IconButton size="sm" onClick={() => removeRow(i)} disabled={data.length <= 2} aria-label="Remove point">
              <Trash2 size={13} />
            </IconButton>
          </div>
        ))}
        <ActionButton icon={Plus} label="Add point" onClick={addRow} />
      </div>
    </Section>
  );
}

/** A focal point, dragged directly on a thumbnail of the image. */
function CropPad({ element, onChange, onCommit }) {
  const p = element.properties;
  const ref = useRef(null);

  const pick = (e) => {
    const box = ref.current.getBoundingClientRect();
    onChange({
      focalX: Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))),
      focalY: Math.round(Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100))),
    });
  };

  return (
    <span
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
      onPointerUp={() => onCommit?.()}
      className="relative block h-14 w-14 shrink-0 cursor-crosshair overflow-hidden rounded border border-line-strong"
      title="Focal point"
    >
      <img src={p.src} alt="" draggable={false} className="h-full w-full object-cover" />
      <span
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow-pop"
        style={{ left: `${p.focalX ?? 50}%`, top: `${p.focalY ?? 50}%` }}
      />
      <Crop size={10} className="pointer-events-none absolute bottom-0.5 right-0.5 text-surface/80" />
    </span>
  );
}

/* ---------------------------- multi selection ---------------------------- */

function ArrangePanel({ selection }) {
  const { state, actions } = useEditor();
  const layers = useLayerActions();
  const [alignTo, setAlignTo] = useLocalState('apollo.alignTo', 'selection');
  const box = boundsOf(selection);
  const ids = selection.map((el) => el.id);
  const opacity = Math.round((selection[0].opacity ?? 1) * 100);

  const nudge = (axis, value) => {
    const delta = value - box[axis];
    actions.applyTransient(
      selection.map((el) => ({ type: 'MOVE_ELEMENT', targetId: el.id, changes: { [axis]: Math.round(el[axis] + delta) } }))
    );
  };

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line bg-void/40 px-2.5 py-2">
        <span className="flex h-6 shrink-0 items-center rounded border border-line bg-raised px-2 text-xs font-medium text-ink">
          {selection.length}
        </span>
        <span className="flex-1 truncate text-xs text-ink-2">layers selected</span>
        <Tooltip label="Lock all" side="bottom">
          <IconButton aria-label="Lock all" onClick={() => layers.toggleLocked(ids)}>
            <Lock size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Hide all" side="bottom">
          <IconButton aria-label="Hide all" onClick={() => layers.toggleHidden(ids)}>
            <EyeOff size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Duplicate" hint="⌘D" side="bottom">
          <IconButton aria-label="Duplicate" onClick={() => layers.duplicate(ids)}>
            <Copy size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Delete" hint="⌫" side="bottom">
          <IconButton aria-label="Delete" variant="danger" onClick={() => layers.remove(ids)}>
            <Trash2 size={13} />
          </IconButton>
        </Tooltip>
      </header>

      <Section id="align" label="Align">
        <Segmented
          className="w-full"
          size="sm"
          value={alignTo}
          onChange={setAlignTo}
          options={[
            { value: 'selection', label: 'Selection' },
            { value: 'canvas', label: 'Canvas' },
          ]}
        />
        <AlignGrid onAlign={(mode) => actions.apply(alignOperations(selection, state.document.canvas, mode, alignTo))} />
        <div className="flex gap-1.5">
          <ActionButton
            label="Space H"
            icon={AlignHorizontalSpaceAround}
            disabled={selection.length < 3}
            title={selection.length < 3 ? 'Select three or more layers' : 'Distribute horizontally'}
            onClick={() => actions.apply(distributeOperations(selection, 'x'))}
          />
          <ActionButton
            label="Space V"
            icon={AlignVerticalSpaceAround}
            disabled={selection.length < 3}
            title={selection.length < 3 ? 'Select three or more layers' : 'Distribute vertically'}
            onClick={() => actions.apply(distributeOperations(selection, 'y'))}
          />
        </div>
      </Section>

      <Section id="multi-arrange" label="Arrange">
        <div className="flex gap-1.5">
          <ActionButton icon={FolderPlus} label="Group" onClick={() => layers.group(ids)} />
          <ActionButton icon={Ungroup} label="Ungroup" disabled={!layers.canUngroup(ids)} onClick={() => layers.ungroup(ids)} />
        </div>
        <div className="flex gap-1.5">
          <ActionButton icon={ArrowUpToLine} label="Front" onClick={() => layers.arrange('front', ids)} />
          <ActionButton icon={ArrowDownToLine} label="Back" onClick={() => layers.arrange('back', ids)} />
        </div>
      </Section>

      <Section id="multi-transform" label="Transform">
        <Row>
          <NumberField label="X" name="X position" value={Math.round(box.x)} onChange={(x) => nudge('x', x)} onCommit={actions.commitTransient} />
          <NumberField label="Y" name="Y position" value={Math.round(box.y)} onChange={(y) => nudge('y', y)} onCommit={actions.commitTransient} />
        </Row>
        <Stat label="Size" value={`${Math.round(box.width)} × ${Math.round(box.height)}`} />
        <SliderRow
          label="Opacity"
          value={opacity}
          display={`${opacity}%`}
          onChange={(v) => actions.applyTransient(ids.map((id) => ({ type: 'UPDATE_ELEMENT', targetId: id, changes: { opacity: v / 100 } })))}
          onCommit={actions.commitTransient}
        />
      </Section>
    </>
  );
}

/* -------------------------------- pieces -------------------------------- */

function Section({ id, label, children, defaultOpen = true }) {
  const [open, setOpen] = useLocalState(`apollo.section.${id}`, defaultOpen);

  return (
    <section className="border-b border-line">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex h-7 w-full items-center gap-1.5 px-2.5 text-left"
      >
        <ChevronRight
          size={11}
          className={cx('shrink-0 text-ink-3 transition-transform duration-150', open && 'rotate-90')}
        />
        <span className="label flex-1 transition-colors group-hover:text-ink-2">{label}</span>
      </button>
      {open && <div className="animate-section-in space-y-1.5 px-2.5 pb-3">{children}</div>}
    </section>
  );
}

/**
 * Apollo paints scrims and colour fields with gradients. This shows the one in
 * play and lets it go — without it, the Fill swatch below would look broken,
 * since a gradient always wins over a flat colour.
 */
function GradientRow({ gradient, onClear }) {
  return (
    <div className="flex items-center gap-2">
      <span className="label w-14 shrink-0">Gradient</span>
      <span
        className="h-5 min-w-0 flex-1 rounded border border-line"
        style={{ backgroundImage: cssGradient(gradient), backgroundColor: '#00000010' }}
      />
      <button
        onClick={onClear}
        title="Remove the gradient and use the flat fill"
        className="shrink-0 rounded border border-line px-1.5 py-0.5 text-2xs text-ink-3 transition-colors hover:border-line-strong hover:text-ink"
      >
        Clear
      </button>
    </div>
  );
}

function SwitchRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="label w-16 shrink-0 truncate">{label}</span>
      <span className="min-w-0 flex-1 truncate text-2xs text-ink-3">{hint}</span>
      <Toggle checked={checked} onChange={onChange} label={hint ? `${label} — ${hint}` : label} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex h-6 items-center justify-between">
      <span className="label">{label}</span>
      <span className="num text-2xs text-ink-2">{value}</span>
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
            className="flex h-7 w-full items-center justify-center rounded border border-line bg-raised text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            <Icon size={13} />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function IconPicker({ value, library, onChange }) {
  const [query, setQuery] = useState('');
  const Current = getIcon(value, library);
  const names = iconNames(library).filter((n) => n.toLowerCase().includes(query.toLowerCase()));

  return (
    <Popover
      panelClassName="w-[15.5rem] p-2"
      button={({ toggle }) => (
        <button
          onClick={toggle}
          className="flex h-7 w-full items-center gap-2 rounded border border-line bg-raised px-2 text-xs text-ink transition-colors hover:border-line-strong"
        >
          <Current size={13} className="text-ink-2" />
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
              const Icon = getIcon(name, library);
              return (
                <button
                  key={name}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    close();
                  }}
                  className={cx(
                    'flex h-7 w-full items-center justify-center rounded transition-colors duration-150',
                    name === value ? 'bg-accent/15 text-accent-text' : 'text-ink-2 hover:bg-raised hover:text-ink'
                  )}
                >
                  <Icon size={14} />
                </button>
              );
            })}
            {names.length === 0 && <p className="col-span-6 py-4 text-center text-xs text-ink-3">No icon matches “{query}”.</p>}
          </div>
        </>
      )}
    </Popover>
  );
}

/** Ancestor lock/hide state, so the panel can explain why a control is inert. */
function inheritedState(elements, element) {
  const byId = new Map(elements.map((el) => [el.id, el]));
  let cursor = element.parentId ? byId.get(element.parentId) : null;
  const seen = new Set([element.id]);
  const out = { locked: false, hidden: false };
  while (cursor && !seen.has(cursor.id)) {
    out.locked = out.locked || Boolean(cursor.locked);
    out.hidden = out.hidden || Boolean(cursor.hidden);
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return out;
}

/** "color-dodge" reads as "Colour dodge" in the panel. */
const blendLabel = (mode) => {
  const words = mode.replace('-', ' ').replace('color', 'colour');
  return words[0].toUpperCase() + words.slice(1);
};

const signed = (n) => (n > 0 ? `+${Math.round(n)}` : String(Math.round(n)));
