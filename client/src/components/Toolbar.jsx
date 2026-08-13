import { MousePointer2, Type, Image as ImageIcon, Sparkles, Square, Circle, Minus, RectangleHorizontal } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';
import { defaultPropertiesFor } from '../design/schema.js';

/**
 * Left tool rail. "Select" is the manipulation tool; the others create a new
 * element (centered on the canvas) through the operation system, then hand
 * control back to Select.
 */
export default function Toolbar({ onOpenImages }) {
  const { state, actions } = useEditor();
  const { document: doc, tool } = state;

  const createCentered = (type, size, extraProps = {}) => {
    const x = Math.round(doc.canvas.width / 2 - size.width / 2);
    const y = Math.round(doc.canvas.height / 2 - size.height / 2);
    const element = {
      type, x, y, width: size.width, height: size.height,
      properties: { ...defaultPropertiesFor(type), ...extraProps },
    };
    actions.apply([{ type: 'CREATE_ELEMENT', element }]);
    actions.setTool('select');
  };

  const tools = [
    { id: 'select', label: 'Select', icon: MousePointer2, onClick: () => actions.setTool('select') },
    { id: 'text', label: 'Text', icon: Type, onClick: () => createCentered('text', { width: 300, height: 60 }, { text: 'New text' }) },
    { id: 'image', label: 'Image', icon: ImageIcon, onClick: onOpenImages },
    { id: 'rectangle', label: 'Rectangle', icon: Square, onClick: () => createCentered('rectangle', { width: 200, height: 140 }) },
    { id: 'circle', label: 'Circle', icon: Circle, onClick: () => createCentered('circle', { width: 160, height: 160 }) },
    { id: 'line', label: 'Line', icon: Minus, onClick: () => createCentered('line', { width: 240, height: 20 }) },
    { id: 'button', label: 'Button', icon: RectangleHorizontal, onClick: () => createCentered('button', { width: 200, height: 56 }, { text: 'Button' }) },
    { id: 'icon', label: 'Icon', icon: Sparkles, onClick: () => createCentered('icon', { width: 48, height: 48 }) },
  ];

  return (
    <div className="w-14 bg-panel border-r border-edge flex flex-col items-center py-3 gap-1">
      {tools.map((t) => {
        const Icon = t.icon;
        const active = tool === t.id && t.id === 'select';
        return (
          <button
            key={t.id}
            onClick={t.onClick}
            title={t.label}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              active ? 'bg-accent text-white' : 'text-neutral-400 hover:bg-panel2 hover:text-white'
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
