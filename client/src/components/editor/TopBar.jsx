import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Download, Ellipsis, Keyboard, Moon, Redo2, SlidersHorizontal, Sun, Undo2 } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useTheme } from '../../lib/theme.jsx';
import { useEditor } from '../../state/EditorContext.jsx';
import { Button, IconButton, Spinner, Tooltip } from '../../ui/primitives.jsx';
import { MenuItem, Popover } from '../../ui/overlay.jsx';
import { ApolloMark, Spark } from '../../ui/brand.jsx';

const FORMATS = [
  { value: 'png', label: 'PNG', note: 'Lossless, transparent' },
  { value: 'jpg', label: 'JPG', note: 'Smallest file' },
  { value: 'webp', label: 'WebP', note: 'Balanced' },
];

const SAVE_COPY = {
  saving: 'Saving…',
  saved: 'Saved',
  dirty: 'Unsaved changes',
  error: 'Save failed',
};

export default function TopBar({
  name,
  onRename,
  saveState,
  exporting,
  onExport,
  onAskApollo,
  aiOpen,
  onShortcuts,
  onToggleInspector,
  compact,
}) {
  const { state, actions } = useEditor();
  const { theme, toggle } = useTheme();
  const [editingName, setEditingName] = useState(false);
  const canvas = state.document.canvas;

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2.5">
      <Tooltip label="All designs" side="bottom">
        <Link
          to="/"
          className="flex h-8 items-center gap-1 rounded pl-1 pr-2 text-ink transition-colors hover:bg-raised"
          aria-label="Back to all designs"
        >
          <ChevronLeft size={15} className="text-ink-3" />
          <ApolloMark size={18} />
        </Link>
      </Tooltip>

      <span className="h-5 w-px bg-line" />

      <div className="flex min-w-0 items-center gap-2.5">
        <input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          onFocus={() => setEditingName(true)}
          onBlur={() => setEditingName(false)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Design name"
          className={cx(
            'h-8 min-w-0 max-w-[8rem] rounded border px-2 text-[13px] font-medium text-ink outline-none transition-colors duration-150 sm:max-w-[15rem]',
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
          {saveState === 'saving' && <Spinner size={11} />}
          {SAVE_COPY[saveState] || ''}
        </span>
      </div>

      <div className="flex-1" />

      <span className="num hidden text-2xs text-ink-3 md:block">
        {canvas.width} × {canvas.height}
      </span>

      <span className="mx-1 hidden h-5 w-px bg-line md:block" />

      <div className="flex items-center">
        <Tooltip label="Undo" hint="⌘Z" side="bottom">
          <IconButton size="lg" disabled={state.past.length === 0} onClick={actions.undo} aria-label="Undo">
            <Undo2 size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Redo" hint="⇧⌘Z" side="bottom">
          <IconButton size="lg" disabled={state.future.length === 0} onClick={actions.redo} aria-label="Redo">
            <Redo2 size={15} />
          </IconButton>
        </Tooltip>
      </div>

      <span className="mx-1 h-5 w-px bg-line" />

      <Button
        variant={aiOpen ? 'secondary' : 'ghost'}
        onClick={onAskApollo}
        className={cx(aiOpen && 'border-line-strong')}
        aria-pressed={aiOpen}
      >
        <Spark size={13} className="text-accent" />
        <span className="hidden sm:inline">Ask Apollo</span>
      </Button>

      <Popover
        align="end"
        panelClassName="w-52"
        button={({ toggle: open, open: isOpen }) => (
          <Button variant="primary" onClick={open} aria-expanded={isOpen} disabled={exporting}>
            {exporting ? <Spinner size={13} /> : <Download size={14} />}
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
        <Tooltip label="Properties" side="bottom">
          <IconButton size="lg" onClick={onToggleInspector} aria-label="Toggle properties">
            <SlidersHorizontal size={15} />
          </IconButton>
        </Tooltip>
      )}

      <Popover
        align="end"
        panelClassName="w-48"
        button={({ toggle: open }) => (
          <IconButton size="lg" onClick={open} aria-label="More">
            <Ellipsis size={16} />
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
