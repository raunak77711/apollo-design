import { Eye, EyeOff, Trash2, Copy, ChevronUp, ChevronDown, Type, Image as ImageIcon, Square, Circle, Minus, RectangleHorizontal, Sparkles } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';

const TYPE_ICON = {
  text: Type, image: ImageIcon, icon: Sparkles, rectangle: Square,
  circle: Circle, line: Minus, button: RectangleHorizontal, group: Square,
};

export default function LayersPanel() {
  const { state, actions } = useEditor();
  const { document: doc, selectedElementId } = state;

  // Top of the list = front-most (highest zIndex).
  const layers = [...doc.elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

  if (layers.length === 0) {
    return <div className="p-4 text-sm text-neutral-500">No layers yet. Add elements or ask Apollo AI to create a design.</div>;
  }

  return (
    <div className="p-2 space-y-1 overflow-y-auto thin-scroll h-full">
      {layers.map((el) => {
        const Icon = TYPE_ICON[el.type] || Square;
        const selected = el.id === selectedElementId;
        return (
          <div
            key={el.id}
            onClick={() => actions.select(el.id)}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
              selected ? 'bg-accent/20 text-white' : 'hover:bg-panel2 text-neutral-300'
            }`}
          >
            <Icon size={15} className="shrink-0 text-neutral-400" />
            <span className="flex-1 truncate">{labelFor(el)}</span>

            <button title={el.hidden ? 'Show' : 'Hide'} className="opacity-0 group-hover:opacity-100 hover:text-white"
              onClick={(e) => { e.stopPropagation(); actions.apply([{ type: 'UPDATE_ELEMENT', targetId: el.id, changes: { hidden: !el.hidden } }]); }}>
              {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <button title="Bring forward" className="opacity-0 group-hover:opacity-100 hover:text-white"
              onClick={(e) => { e.stopPropagation(); actions.apply([{ type: 'REORDER_ELEMENT', targetId: el.id, direction: 'front' }]); }}>
              <ChevronUp size={14} />
            </button>
            <button title="Send backward" className="opacity-0 group-hover:opacity-100 hover:text-white"
              onClick={(e) => { e.stopPropagation(); actions.apply([{ type: 'REORDER_ELEMENT', targetId: el.id, direction: 'back' }]); }}>
              <ChevronDown size={14} />
            </button>
            <button title="Duplicate" className="opacity-0 group-hover:opacity-100 hover:text-white"
              onClick={(e) => { e.stopPropagation(); actions.apply([{ type: 'DUPLICATE_ELEMENT', targetId: el.id }]); }}>
              <Copy size={14} />
            </button>
            <button title="Delete" className="opacity-0 group-hover:opacity-100 hover:text-red-400"
              onClick={(e) => { e.stopPropagation(); actions.apply([{ type: 'DELETE_ELEMENT', targetId: el.id }], { selectId: null }); }}>
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function labelFor(el) {
  if (el.type === 'text' || el.type === 'button') return el.properties.text || el.type;
  if (el.type === 'icon') return `Icon · ${el.properties.name}`;
  if (el.type === 'image') return 'Image';
  return el.type.charAt(0).toUpperCase() + el.type.slice(1);
}
