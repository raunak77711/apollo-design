import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Download, Ellipsis, Keyboard, Moon, Redo2, SlidersHorizontal, Sun, Undo2 } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useTheme } from '../../lib/theme.jsx';
import { useEditor } from '../../state/EditorContext.jsx';
import { Button, IconButton, Spinner, Tooltip } from '../../ui/primitives.jsx';
import { MenuItem, Popover } from '../../ui/overlay.jsx';
import { ApolloMark } from '../../ui/brand.jsx';

const FORMATS = [
  { value: 'png', label: 'PNG', note: 'Lossless, transparent' },
  { value: 'jpg', label: 'JPG', note: 'Smallest file' },
  { value: 'webp', label: 'WebP', note: 'Balanced' },
];

const SAVE_COPY = {
  saving: 'Saving',
  saved: 'Saved',
  dirty: 'Unsaved',
  error: 'Save failed',
};

/**
 * The document bar. It answers "which design am I in, and is it safe?" and
 * nothing else — every tool moved to the rail and every property to the dock,
 * which is what lets this strip stay 40px tall.
 */
export default function TopBar({
  name,
  onRename,
  saveState,
  exporting,
  onExport,
  onShortcuts,
  onToggleInspector,
  compact,
}) {
  const { state, actions } = useEditor();
  const { theme, toggle } = useTheme();
  const [editingName, setEditingName] = useState(false);
  const canvas = state.document.canvas;

  return (
    <header className="z-30 flex h-10 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2">
      <Tooltip label="All designs" side="bottom">
        <Link
          to="/"
          className="flex h-7 items-center gap-0.5 rounded pl-0.5 pr-1.5 text-ink transition-colors hover:bg-raised"
          aria-label="Back to all designs"
        >
          <ChevronLeft size={14} className="text-ink-3" />
          <ApolloMark size={17} />
        </Link>
      </Tooltip>

      <span className="h-4 w-px bg-line" />

      <input
        value={name}
        onChange={(e) => onRename(e.target.value)}
        onFocus={() => setEditingName(true)}
        onBlur={() => setEditingName(false)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Design name"
        className={cx(
          'h-7 min-w-0 max-w-[8rem] rounded border px-1.5 text-[13px] font-medium text-ink outline-none transition-colors duration-150 sm:max-w-[15rem]',
          editingName ? 'border-line bg-raised' : 'border-transparent bg-transparent hover:border-line'
        )}
        style={{ width: `${Math.min(Math.max(name.length + 2, 10), 26)}ch` }}
      />

      <span
        className={cx(
          'hidden shrink-0 items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.1em] sm:flex',
          saveState === 'error' ? 'text-danger' : 'text-ink-3'
        )}
      >
        {saveState === 'saving' && <Spinner size={10} />}
        {SAVE_COPY[saveState] || ''}
      </span>

      <div className="flex-1" />

      <span className="num hidden text-2xs text-ink-3 md:block">
        {canvas.width} × {canvas.height}
      </span>

      <span className="mx-1 hidden h-4 w-px bg-line md:block" />

      <Tooltip label="Undo" hint="⌘Z" side="bottom">
        <IconButton disabled={state.past.length === 0} onClick={actions.undo} aria-label="Undo">
          <Undo2 size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label="Redo" hint="⇧⌘Z" side="bottom">
        <IconButton disabled={state.future.length === 0} onClick={actions.redo} aria-label="Redo">
          <Redo2 size={14} />
        </IconButton>
      </Tooltip>

      <span className="mx-1 h-4 w-px bg-line" />

      <Popover
        align="end"
        panelClassName="w-52"
        button={({ toggle: open, open: isOpen }) => (
          <Button size="sm" variant="primary" onClick={open} aria-expanded={isOpen} disabled={exporting}>
            {exporting ? <Spinner size={12} /> : <Download size={13} />}
            <span className="hidden sm:inline">Export</span>
          </Button>
        )}
      >
        {({ close }) => (
          <>
            <p className="label px-2 pb-1 pt-1.5">Download as</p>
            {FORMATS.map((format) => (
              <MenuItem
                key={format.value}
                hint={format.label}
                onClick={() => {
                  close();
                  onExport(format.value);
                }}
              >
                {format.note}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>

      {compact && (
        <Tooltip label="Panels" side="bottom">
          <IconButton onClick={onToggleInspector} aria-label="Toggle panels">
            <SlidersHorizontal size={14} />
          </IconButton>
        </Tooltip>
      )}

      <Popover
        align="end"
        panelClassName="w-48"
        button={({ toggle: open }) => (
          <IconButton onClick={open} aria-label="More">
            <Ellipsis size={15} />
          </IconButton>
        )}
      >
        {({ close }) => (
          <>
            <MenuItem
              icon={theme === 'dark' ? Sun : Moon}
              onClick={() => {
                toggle();
                close();
              }}
            >
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </MenuItem>
            <MenuItem
              icon={Keyboard}
              hint="?"
              onClick={() => {
                close();
                onShortcuts();
              }}
            >
              Shortcuts
            </MenuItem>
          </>
        )}
      </Popover>
    </header>
  );
}
