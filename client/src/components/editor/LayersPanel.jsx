import {
  Circle,
  Copy,
  Eye,
  EyeOff,
  Group,
  ImageIcon,
  Layers as LayersIcon,
  Minus,
  RectangleHorizontal,
  Square,
  Star,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { EmptyState, IconButton, Tooltip } from '../../ui/primitives.jsx';

const TYPE_ICON = {
  text: Type,
  image: ImageIcon,
  icon: Star,
  rectangle: Square,
  circle: Circle,
  line: Minus,
  button: RectangleHorizontal,
  group: Group,
};

/** Stacking order, front to back. Shift-click builds a multi-selection. */
export default function LayersPanel({ onClose }) {
  const { state, actions } = useEditor();
  const { document: doc, selectedIds } = state;
  const layers = [...doc.elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="flex-1 text-[13px] font-medium text-ink">Layers</h2>
        <span className="num text-2xs text-ink-3">{layers.length}</span>
        <IconButton onClick={onClose} aria-label="Close layers">
          <X size={14} />
        </IconButton>
      </header>

      {layers.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          title="No layers yet"
          body="Place something from the tool rail, or ask Apollo to draw a first draft."
        />
      ) : (
        <div className="thin-scroll flex-1 overflow-y-auto p-1.5">
          {layers.map((el) => {
            const Icon = TYPE_ICON[el.type] || Square;
            const selected = selectedIds.includes(el.id);
            return (
              <div
                key={el.id}
                onClick={(e) => (e.shiftKey ? actions.toggleSelect(el.id) : actions.select(el.id))}
                className={cx(
                  'group flex h-8 cursor-default items-center gap-2 rounded px-2 text-[13px] transition-colors duration-100',
                  selected ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised/60',
                  el.hidden && 'opacity-50'
                )}
              >
                <Icon size={13} className={cx('shrink-0', selected ? 'text-accent-text' : 'text-ink-3')} />
                <span className="flex-1 truncate">{labelFor(el)}</span>

                <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Tooltip label="Duplicate" side="left">
                    <IconButton
                      size="sm"
                      aria-label="Duplicate layer"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.apply([{ type: 'DUPLICATE_ELEMENT', targetId: el.id }]);
                      }}
                    >
                      <Copy size={12} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip label="Delete" side="left">
                    <IconButton
                      size="sm"
                      variant="danger"
                      aria-label="Delete layer"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.apply([{ type: 'DELETE_ELEMENT', targetId: el.id }], { selectIds: [] });
                      }}
                    >
                      <Trash2 size={12} />
                    </IconButton>
                  </Tooltip>
                </span>

                <IconButton
                  size="sm"
                  aria-label={el.hidden ? 'Show layer' : 'Hide layer'}
                  className={cx(!el.hidden && 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100')}
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.apply([{ type: 'UPDATE_ELEMENT', targetId: el.id, changes: { hidden: !el.hidden } }]);
                  }}
                >
                  {el.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </IconButton>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function labelFor(el) {
  if (el.type === 'text' || el.type === 'button') return el.properties.text?.split('\n')[0] || el.type;
  if (el.type === 'icon') return el.properties.name;
  if (el.type === 'image') return el.properties.src ? el.properties.alt || 'Image' : 'Empty image';
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}
