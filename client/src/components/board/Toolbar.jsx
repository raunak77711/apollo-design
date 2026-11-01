import {
  ArrowUpRight, Circle, Eraser, Hand, Highlighter, ImagePlus, Maximize, Minus, MousePointer2, Pen, Redo2,
  Square, StickyNote, Trash2, Type, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { Tooltip } from '../../ui/primitives.jsx';

const TOOLS = [
  ['select', MousePointer2, 'Select', 'V'],
  ['hand', Hand, 'Hand', 'H'],
  ['pen', Pen, 'Pen', 'P'],
  ['highlighter', Highlighter, 'Highlighter', 'M'],
  ['eraser', Eraser, 'Eraser', 'E'],
  ['arrow', ArrowUpRight, 'Arrow', 'A'],
  ['line', Minus, 'Line', 'L'],
  ['rectangle', Square, 'Rectangle', 'R'],
  ['circle', Circle, 'Circle', 'C'],
  ['text', Type, 'Text', 'T'],
  ['sticky', StickyNote, 'Sticky note', 'N'],
];

function Btn({ label, hint, active, locked, onClick, onDoubleClick, disabled, children }) {
  return (
    <Tooltip label={label} hint={hint} side="right">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        className={cx(
          'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150',
          'disabled:pointer-events-none disabled:opacity-30',
          active ? 'bg-ink text-void' : 'text-ink-2 hover:bg-raised hover:text-ink'
        )}
      >
        {children}
        {locked && <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />}
      </button>
    </Tooltip>
  );
}

const Rule = () => <div className="mx-1 my-1 h-px bg-line" />;

/**
 * The floating tool bar. One click picks a tool; a double click locks it so
 * you can keep drawing arrows without going back to it each time. Tool names,
 * order and shortcuts match the keyboard map in tools/keys.js and the help sheet.
 */
export default function Toolbar({ ui, actions, compact = false }) {
  const { tool, locked, canUndo, canRedo } = ui;
  return (
    <div className="absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col rounded-xl border border-line bg-surface p-1.5 shadow-pop">
      {TOOLS.map(([name, Icon, label, key]) => (
        <Btn
          key={name}
          label={label}
          hint={key}
          active={tool === name}
          locked={tool === name && locked}
          onClick={() => actions.onTool(name, false)}
          onDoubleClick={() => actions.onTool(name, true)}
        >
          <Icon size={17} strokeWidth={1.75} />
        </Btn>
      ))}
      <Btn label="Add image" hint="I" onClick={actions.onImage}>
        <ImagePlus size={17} strokeWidth={1.75} />
      </Btn>
      <Rule />
      <Btn label="Undo" hint="Ctrl Z" disabled={!canUndo} onClick={actions.onUndo}><Undo2 size={17} strokeWidth={1.75} /></Btn>
      <Btn label="Redo" hint="Ctrl Shift Z" disabled={!canRedo} onClick={actions.onRedo}><Redo2 size={17} strokeWidth={1.75} /></Btn>
      {!compact && (
        <Btn label="Clear my annotations" onClick={actions.onClear}><Trash2 size={17} strokeWidth={1.75} /></Btn>
      )}
      <Rule />
      <Btn label="Zoom in" hint="+" onClick={actions.onZoomIn}><ZoomIn size={17} strokeWidth={1.75} /></Btn>
      <Btn label="Zoom out" hint="-" onClick={actions.onZoomOut}><ZoomOut size={17} strokeWidth={1.75} /></Btn>
      <Btn label="Reset view" hint="0" onClick={actions.onReset}><Maximize size={17} strokeWidth={1.75} /></Btn>
    </div>
  );
}
