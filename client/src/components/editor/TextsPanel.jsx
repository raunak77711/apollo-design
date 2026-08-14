import { Type, X } from 'lucide-react';
import { useEditor } from '../../state/EditorContext.jsx';
import { defaultPropertiesFor } from '../../design/schema.js';
import { newElementId } from '../../design/operations.js';
import { CREATION_TOOLS } from './ToolRail.jsx';
import { IconButton } from '../../ui/primitives.jsx';

const TEXT_TOOL_IDS = ['heading', 'subheading', 'body', 'eyebrow', 'text'];

/**
 * One click drops a ready-styled text layer in the middle of the canvas —
 * no drag-to-place needed. The same five styles the rail's Text slot cycles
 * through (Heading/Subheading/Body/Eyebrow/plain Text), just always visible.
 */
export default function TextsPanel({ onClose }) {
  const { state, actions } = useEditor();
  const canvas = state.document.canvas;

  const add = (toolId) => {
    const tool = CREATION_TOOLS.find((t) => t.id === toolId);
    const type = tool.type || tool.id;
    const id = newElementId(type);
    actions.apply(
      [
        {
          type: 'CREATE_ELEMENT',
          element: {
            id,
            type,
            x: Math.round(canvas.width / 2 - tool.size.width / 2),
            y: Math.round(canvas.height / 2 - tool.size.height / 2),
            ...tool.size,
            properties: { ...defaultPropertiesFor(type), ...(tool.props || {}) },
          },
        },
      ],
      { selectIds: [id] }
    );
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Type size={14} className="text-ink-3" />
        <h2 className="flex-1 text-[13px] font-medium text-ink">Texts</h2>
        <IconButton onClick={onClose} aria-label="Close texts"><X size={14} /></IconButton>
      </header>

      <div className="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <p className="label mb-1">Quick add</p>
        {TEXT_TOOL_IDS.map((id) => {
          const tool = CREATION_TOOLS.find((t) => t.id === id);
          return (
            <button
              key={id}
              onClick={() => add(id)}
              className="flex w-full items-center gap-2.5 rounded border border-line bg-raised px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-panel2"
            >
              <Type size={15} className="shrink-0 text-ink-3" />
              <span
                className="min-w-0 flex-1 truncate text-ink"
                style={{
                  fontSize: Math.min(20, tool.props?.fontSize ? tool.props.fontSize / 3 : 15),
                  fontWeight: tool.props?.fontWeight || 500,
                  textTransform: tool.props?.textCase === 'uppercase' ? 'uppercase' : 'none',
                }}
              >
                {tool.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
