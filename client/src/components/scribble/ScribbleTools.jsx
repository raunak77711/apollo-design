import { Eraser, Highlighter, Pen, Redo2, Trash2, Undo2 } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { IconButton, Tooltip } from '../../ui/primitives.jsx';

/**
 * The sketching toolbar.
 *
 * Three tools, one size, a few inks. A scribble is a means to an end — every
 * control here has to earn its place against the possibility of just drawing
 * the thing, so there is no pen-mode menu, no opacity, no fill. Apollo's own
 * Draw studio has all of that for when someone actually wants to paint.
 */

const TOOLS = [
  { id: 'pen', label: 'Pen', icon: Pen, hint: 'B' },
  { id: 'marker', label: 'Marker', icon: Highlighter, hint: 'M' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, hint: 'E' },
];

/**
 * Inks, not colours. Graphite to draw with, then a small set to separate one
 * kind of mark from another — "this block is the photo, this one is the type".
 * Apollo reads position and shape, so these carry meaning for the person
 * drawing rather than for the design that comes out.
 */
const INKS = ['#111111', '#2B6CF6', '#E4322B', '#1F9D55', '#B8860B'];

const SIZES = [
  { id: 'fine', value: 3, label: 'Fine' },
  { id: 'medium', value: 7, label: 'Medium' },
  { id: 'bold', value: 14, label: 'Bold' },
  { id: 'heavy', value: 26, label: 'Heavy' },
];

export default function ScribbleTools({
  tool,
  onTool,
  color,
  onColor,
  size,
  onSize,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo,
  isEmpty,
  disabled = false,
  className,
}) {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-disabled={disabled || undefined}
      className={cx(
        'flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg border border-line bg-surface px-1.5 py-1.5 shadow-pop',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      {/* Tools */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map(({ id, label, icon: Icon, hint }) => (
          <Tooltip key={id} label={label} hint={hint}>
            <button
              type="button"
              onClick={() => onTool(id)}
              aria-pressed={tool === id}
              aria-label={label}
              className="rail-btn"
            >
              <Icon size={15} />
            </button>
          </Tooltip>
        ))}
      </div>

      <Divider />

      {/* Size. Four steps rather than a slider — a sketch does not need 200
          widths, and discrete buttons are far easier to hit on a phone. */}
      <div className="flex items-center gap-0.5" role="group" aria-label="Brush size">
        {SIZES.map(({ id, value, label }) => (
          <Tooltip key={id} label={label}>
            <button
              type="button"
              onClick={() => onSize(value)}
              aria-pressed={size === value}
              aria-label={`${label} brush`}
              className="rail-btn"
            >
              <span
                className="rounded-full bg-current transition-all duration-150 ease-out"
                style={{ width: 3 + value * 0.42, height: 3 + value * 0.42 }}
              />
            </button>
          </Tooltip>
        ))}
      </div>

      <Divider />

      {/* Ink */}
      <div className="flex items-center gap-1 px-1" role="group" aria-label="Ink colour">
        {INKS.map((ink) => (
          <button
            key={ink}
            type="button"
            onClick={() => {
              onColor(ink);
              // Picking up an ink means you want to draw with it, not erase.
              if (tool === 'eraser') onTool('pen');
            }}
            aria-label={`Ink ${ink}`}
            aria-pressed={color === ink && tool !== 'eraser'}
            className={cx(
              'h-5 w-5 rounded-full transition-transform duration-150 ease-out hover:scale-110',
              color === ink && tool !== 'eraser'
                ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface'
                : 'ring-1 ring-line-strong'
            )}
            style={{ background: ink }}
          />
        ))}
      </div>

      <Divider />

      {/* History */}
      <div className="flex items-center gap-0.5">
        <Tooltip label="Undo" hint="⌘Z">
          <IconButton size="lg" onClick={onUndo} disabled={!canUndo} aria-label="Undo">
            <Undo2 size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Redo" hint="⌘⇧Z">
          <IconButton size="lg" onClick={onRedo} disabled={!canRedo} aria-label="Redo">
            <Redo2 size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Clear canvas">
          <IconButton size="lg" onClick={onClear} disabled={isEmpty} aria-label="Clear canvas">
            <Trash2 size={15} />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />;
