import { useCallback, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useLocalState } from '../../lib/useLocalState.js';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { typeLabel } from '../../design/layers.js';
import { IconButton } from '../../ui/primitives.jsx';
import Inspector from './Inspector.jsx';
import LayersPanel from './LayersPanel.jsx';

const MIN_SECTION = 120; // px — below this a panel stops being usable
const DEFAULT_LAYERS_HEIGHT = 260;

/**
 * The right dock. Properties and Layers are stacked rather than tabbed, so the
 * two questions a designer asks constantly — "what is this?" and "where is it
 * in the stack?" — can be answered without trading one view for the other.
 * Either can be folded away from its own header or from the rail, and when
 * both are shut the dock disappears and the canvas takes the width back.
 */
export default function RightDock({
  show,
  onToggle,
  renamingId,
  onRenaming,
  onEditImage,
  onPickImage,
  onDraw,
  onClose,
}) {
  const { state } = useEditor();
  const selection = useSelection();
  const columnRef = useRef(null);
  const [stored, setStored] = useLocalState('apollo.dock.layersHeight', DEFAULT_LAYERS_HEIGHT);
  const [dragHeight, setDragHeight] = useState(null);

  const both = show.properties && show.layers;
  const layersHeight = dragHeight ?? stored;

  /* The splitter resizes Layers from the bottom up; Properties absorbs the
     rest, which is what keeps the taller of the two controls in view. The
     preference is written once on release rather than on every frame. */
  const onSplitterDown = useCallback(
    (e) => {
      e.preventDefault();
      const column = columnRef.current;
      if (!column) return;
      const { bottom, height } = column.getBoundingClientRect();
      const limit = height - MIN_SECTION;
      let next = null;

      const move = (ev) => {
        next = Math.round(Math.min(limit, Math.max(MIN_SECTION, bottom - ev.clientY)));
        setDragHeight(next);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDragHeight(null);
        if (next != null) setStored(next);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [setStored]
  );

  const summary =
    selection.length === 0
      ? 'Canvas'
      : selection.length === 1
        ? typeLabel(selection[0])
        : `${selection.length} layers`;

  return (
    <aside ref={columnRef} className="flex h-full w-[292px] shrink-0 flex-col border-l border-line bg-surface">
      {show.properties && (
        <section className="flex min-h-0 flex-1 flex-col">
          <DockHeader label="Properties" note={summary} onCollapse={() => onToggle('properties')} onClose={onClose} />
          <Inspector onEditImage={onEditImage} onPickImage={onPickImage} onDraw={onDraw} />
        </section>
      )}

      {both && (
        <span
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize layers panel"
          onPointerDown={onSplitterDown}
          className="dock-splitter"
        />
      )}

      {show.layers && (
        <section
          className="flex min-h-0 flex-col"
          style={both ? { height: layersHeight, flexShrink: 0 } : { flex: 1 }}
        >
          <DockHeader
            label="Layers"
            note={`${state.document.elements.length}`}
            onCollapse={() => onToggle('layers')}
            onClose={show.properties ? undefined : onClose}
          />
          <LayersPanel renamingId={renamingId} onRename={onRenaming} />
        </section>
      )}
    </aside>
  );
}

function DockHeader({ label, note, action, onCollapse, onClose }) {
  return (
    <header className="flex h-8 shrink-0 items-center border-b border-line pr-1">
      <button onClick={onCollapse} className="dock-title group min-w-0 flex-1" title={`Hide ${label.toLowerCase()}`}>
        <ChevronDown size={12} className="shrink-0 text-ink-3 transition-colors group-hover:text-ink-2" />
        <span className="truncate">{label}</span>
        {note && <span className="num shrink-0 pl-1 text-2xs font-normal normal-case tracking-normal text-ink-3">{note}</span>}
      </button>
      {action}
      {onClose && (
        <IconButton size="sm" onClick={onClose} aria-label="Close panel">
          <X size={13} />
        </IconButton>
      )}
    </header>
  );
}
