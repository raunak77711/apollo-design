import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronsRight, Italic, Underline } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { ColorField, IconToggle, NumberField, PropRow, Segmented, SelectField } from '../../ui/fields.jsx';
import { FONT_FAMILIES, TONE_COLORS } from './engine/theme.js';
import { describeSelection } from './propertyModel.js';
import { resolveColor } from './state/styleMap.js';

const DRAWING_TOOLS = ['pen', 'highlighter', 'arrow', 'line', 'rectangle', 'circle', 'text'];
const TONES = ['problem', 'ink', 'money', 'movement', 'tech'];

/** The six board colours as one-click swatches, then a free picker. `value` may be a tone name or CSS colour. */
function Swatches({ value, onPick }) {
  const current = String(resolveColor(value) || '').toLowerCase();
  return (
    <div className="flex items-center gap-1.5">
      {TONES.map((tone) => {
        const hex = TONE_COLORS[tone];
        const active = current === hex.toLowerCase();
        return (
          <button
            key={tone}
            type="button"
            aria-label={tone}
            title={tone}
            onClick={() => onPick(tone)}
            className={cx('h-5 w-5 rounded-full border transition-transform hover:scale-110', active ? 'border-ink ring-2 ring-accent/60' : 'border-line-strong')}
            style={{ background: hex }}
          />
        );
      })}
    </div>
  );
}

const Group = ({ children }) => <div className="space-y-2">{children}</div>;

function TextControls({ v, apply }) {
  return (
    <Group>
      <SelectField name="Font" value={v.fontFamily} options={FONT_FAMILIES} onChange={(fontFamily) => apply({ fontFamily })} />
      <PropRow label="Size">
        <NumberField name="Font size" label="Aa" value={v.fontSize} min={8} max={400} onChange={(fontSize) => apply({ fontSize })} className="flex-1" />
        <IconToggle icon={Bold} label="Bold" active={v.bold} onClick={() => apply({ fontWeight: v.bold ? 'normal' : 'bold' })} />
        <IconToggle icon={Italic} label="Italic" active={v.italic} onClick={() => apply({ italic: !v.italic })} />
        <IconToggle icon={Underline} label="Underline" active={v.underline} onClick={() => apply({ underline: !v.underline })} />
      </PropRow>
      <PropRow label="Colour"><Swatches value={v.color} onPick={(color) => apply({ color })} /></PropRow>
      <ColorField label="Custom" value={v.color} onChange={(color) => apply({ color })} />
      <PropRow label="Align">
        <Segmented
          value={v.align}
          onChange={(align) => apply({ align })}
          options={[
            { value: 'left', icon: AlignLeft, title: 'Left' },
            { value: 'center', icon: AlignCenter, title: 'Centre' },
            { value: 'right', icon: AlignRight, title: 'Right' },
          ]}
        />
      </PropRow>
      <PropRow label="Spacing">
        <NumberField name="Line height percent" label="LH" value={Math.round((v.lineHeight || 1.1) * 100)} min={60} max={300} onChange={(n) => apply({ lineHeight: n / 100 })} className="flex-1" />
        <NumberField name="Letter spacing" label="LS" value={v.letterSpacing || 0} min={-100} max={800} onChange={(letterSpacing) => apply({ letterSpacing })} className="flex-1" />
      </PropRow>
    </Group>
  );
}

function ShapeControls({ v, apply }) {
  return (
    <Group>
      <PropRow label="Border"><Swatches value={v.stroke} onPick={(stroke) => apply({ stroke })} /></PropRow>
      <ColorField label="Fill" value={v.fill} onChange={(fill) => apply({ fill })} />
      <ColorField label="Border" value={v.stroke} onChange={(stroke) => apply({ stroke })} />
      <PropRow label="Width">
        <NumberField name="Border width" label="W" value={v.strokeWidth} min={0} max={40} onChange={(strokeWidth) => apply({ strokeWidth })} className="flex-1" />
        {v.isRect && <NumberField name="Corner radius" label="R" value={v.radius || 0} min={0} max={200} onChange={(radius) => apply({ radius })} className="flex-1" />}
      </PropRow>
      <PropRow label="Opacity">
        <NumberField name="Opacity percent" label="%" value={Math.round(v.opacity * 100)} min={0} max={100} onChange={(n) => apply({ opacity: n / 100 })} className="flex-1" />
      </PropRow>
    </Group>
  );
}

function LineControls({ v, apply }) {
  return (
    <Group>
      <PropRow label="Colour"><Swatches value={v.color} onPick={(color) => apply({ color })} /></PropRow>
      <ColorField label="Custom" value={v.color} onChange={(color) => apply({ color })} />
      <PropRow label="Width">
        <NumberField name="Line width" label="W" value={v.strokeWidth} min={1} max={40} onChange={(strokeWidth) => apply({ strokeWidth })} className="flex-1" />
        <IconToggle icon={ChevronsRight} label="Dashed" active={v.dashed} onClick={() => apply({ dash: !v.dashed })} />
      </PropRow>
      <PropRow label="Heads">
        <Segmented
          value={`${v.headStart ? 1 : 0}${v.headEnd ? 1 : 0}`}
          onChange={(k) => apply({ headStart: k[0] === '1', headEnd: k[1] === '1' })}
          options={[{ value: '00', label: 'None' }, { value: '01', label: 'End' }, { value: '10', label: 'Start' }, { value: '11', label: 'Both' }]}
        />
      </PropRow>
    </Group>
  );
}

function StrokeControls({ v, apply }) {
  return (
    <Group>
      <PropRow label="Colour"><Swatches value={v.color} onPick={(color) => apply({ color })} /></PropRow>
      <ColorField label="Custom" value={v.color} onChange={(color) => apply({ color })} />
      <PropRow label="Width">
        <NumberField name="Stroke width" label="W" value={v.strokeWidth} min={1} max={80} onChange={(strokeWidth) => apply({ strokeWidth })} className="flex-1" />
        <NumberField name="Opacity percent" label="%" value={Math.round(v.opacity * 100)} min={5} max={100} onChange={(n) => apply({ opacity: n / 100 })} className="flex-1" />
      </PropRow>
    </Group>
  );
}

function PieceControls({ v, apply }) {
  return (
    <Group>
      <ColorField label="Fill" value={v.fill} onChange={(fill) => apply({ fill })} />
      <ColorField label="Border" value={v.stroke} onChange={(stroke) => apply({ stroke })} />
      <ColorField label="Text" value={v.color} onChange={(color) => apply({ color })} />
      <PropRow label="Size">
        <NumberField name="Label size" label="Aa" value={v.fontSize || 22} min={8} max={200} onChange={(fontSize) => apply({ fontSize })} className="flex-1" />
        <NumberField name="Opacity percent" label="%" value={Math.round(v.opacity * 100)} min={0} max={100} onChange={(n) => apply({ opacity: n / 100 })} className="flex-1" />
      </PropRow>
    </Group>
  );
}

/** With nothing selected, a drawing tool's panel edits what the *next* mark will look like. */
function DefaultsControls({ tool, defaults, onDefaults }) {
  const text = tool === 'text';
  return (
    <Group>
      <PropRow label="Colour"><Swatches value={defaults.color} onPick={(color) => onDefaults({ color })} /></PropRow>
      {text ? (
        <>
          <SelectField name="Font" value={defaults.fontFamily} options={FONT_FAMILIES} onChange={(fontFamily) => onDefaults({ fontFamily })} />
          <PropRow label="Size"><NumberField name="Font size" label="Aa" value={defaults.fontSize} min={8} max={400} onChange={(fontSize) => onDefaults({ fontSize })} className="flex-1" /></PropRow>
        </>
      ) : (
        <PropRow label="Width"><NumberField name="Stroke width" label="W" value={defaults.strokeWidth} min={1} max={40} onChange={(strokeWidth) => onDefaults({ strokeWidth })} className="flex-1" /></PropRow>
      )}
    </Group>
  );
}

const TITLES = { text: 'Text', shape: 'Shape', line: 'Line', stroke: 'Stroke', piece: 'Piece', image: 'Image' };

export default function PropertyPanel({ selection, tool, defaults, onApply, onDefaults, compact = false }) {
  const { mode, values } = describeSelection(selection);
  const drawing = DRAWING_TOOLS.includes(tool);
  const showDefaults = mode === 'none' && drawing;
  if (!showDefaults && !TITLES[mode]) return null;

  return (
    <div className={cx('w-[248px] rounded-xl border border-line bg-surface p-3 shadow-pop', compact && 'scale-90')}>
      <p className="label mb-2">{showDefaults ? `New ${tool}` : TITLES[mode]}</p>
      {showDefaults && <DefaultsControls tool={tool} defaults={defaults} onDefaults={onDefaults} />}
      {mode === 'text' && <TextControls v={values} apply={onApply} />}
      {mode === 'shape' && <ShapeControls v={values} apply={onApply} />}
      {mode === 'line' && <LineControls v={values} apply={onApply} />}
      {mode === 'stroke' && <StrokeControls v={values} apply={onApply} />}
      {mode === 'piece' && <PieceControls v={values} apply={onApply} />}
      {mode === 'image' && (
        <PropRow label="Opacity">
          <NumberField name="Opacity percent" label="%" value={Math.round(values.opacity * 100)} min={5} max={100} onChange={(n) => onApply({ opacity: n / 100 })} className="flex-1" />
        </PropRow>
      )}
    </div>
  );
}
