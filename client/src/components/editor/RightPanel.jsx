import { Layers, SlidersHorizontal, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { IconButton } from '../../ui/primitives.jsx';
import Inspector from './Inspector.jsx';
import LayersPanel from './LayersPanel.jsx';

const TABS = [
  { id: 'properties', label: 'Properties', icon: SlidersHorizontal },
  { id: 'layers', label: 'Layers', icon: Layers },
];

/**
 * The right column: one place for everything about the selection. Properties
 * and Layers share it through a switcher rather than a second sidebar, so the
 * canvas keeps the width it deserves.
 */
export default function RightPanel({ tab, onTab, renamingId, onRenaming, onEditImage, onPickImage, onClose }) {
  const { state } = useEditor();
  const count = state.selectedIds.length;

  return (
    <aside className="flex h-full w-[304px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => onTab(id)}
                aria-pressed={active}
                className={cx(
                  'flex h-8 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium transition-colors duration-150',
                  active ? 'bg-raised text-ink' : 'text-ink-3 hover:text-ink-2'
                )}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>

        {count > 1 && tab === 'layers' && <span className="num shrink-0 px-1 text-2xs text-ink-3">{count} selected</span>}
        {onClose && (
          <IconButton onClick={onClose} aria-label="Close panel">
            <X size={14} />
          </IconButton>
        )}
      </header>

      {tab === 'layers' ? (
        <LayersPanel renamingId={renamingId} onRename={onRenaming} />
      ) : (
        <Inspector onEditImage={onEditImage} onPickImage={onPickImage} />
      )}
    </aside>
  );
}
