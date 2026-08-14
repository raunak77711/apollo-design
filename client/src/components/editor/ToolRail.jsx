import { Circle, ImageIcon, Layers, Minus, MousePointer2, RectangleHorizontal, Square, Star, Type } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { Tooltip } from '../../ui/primitives.jsx';

export const CREATION_TOOLS = [
  { id: 'text', label: 'Text', hint: 'T', icon: Type, size: { width: 420, height: 72 }, props: { text: 'Your text', fontSize: 48 } },
  { id: 'rectangle', label: 'Rectangle', hint: 'R', icon: Square, size: { width: 320, height: 200 } },
  { id: 'circle', label: 'Ellipse', hint: 'O', icon: Circle, size: { width: 220, height: 220 } },
  { id: 'line', label: 'Line', hint: 'L', icon: Minus, size: { width: 320, height: 12 } },
  { id: 'button', label: 'Button', hint: 'B', icon: RectangleHorizontal, size: { width: 220, height: 56 }, props: { text: 'Button' } },
  { id: 'icon', label: 'Icon', hint: 'I', icon: Star, size: { width: 56, height: 56 } },
];

/**
 * Tool rail. Picking a tool arms it — the next click on the canvas places the
 * element there, so nothing lands somewhere you didn't choose.
 */
export default function ToolRail({ panel, onPanel }) {
  const { state, actions } = useEditor();

  return (
    <nav className="z-20 flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2.5">
      <RailButton
        label="Select"
        hint="V"
        icon={MousePointer2}
        active={state.tool === 'select' && !panel}
        onClick={() => {
          actions.setTool('select');
          onPanel(null);
        }}
      />

      <span className="my-1 h-px w-6 bg-line" />

      {CREATION_TOOLS.map((tool) => (
        <RailButton
          key={tool.id}
          label={tool.label}
          hint={tool.hint}
          icon={tool.icon}
          active={state.tool === tool.id}
          onClick={() => actions.setTool(state.tool === tool.id ? 'select' : tool.id)}
        />
      ))}

      <RailButton
        label="Images"
        hint="M"
        icon={ImageIcon}
        active={panel === 'library'}
        onClick={() => onPanel(panel === 'library' ? null : 'library')}
      />

      <div className="flex-1" />

      <RailButton
        label="Layers"
        icon={Layers}
        active={panel === 'layers'}
        onClick={() => onPanel(panel === 'layers' ? null : 'layers')}
      />
    </nav>
  );
}

function RailButton({ label, hint, icon: Icon, active, onClick }) {
  return (
    <Tooltip label={label} hint={hint} side="right">
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cx(
          'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150',
          active ? 'bg-raised text-ink' : 'text-ink-3 hover:bg-raised/70 hover:text-ink-2'
        )}
      >
        <Icon size={17} strokeWidth={1.75} />
        {active && <span className="absolute -left-2.5 h-4 w-[2px] rounded-full bg-accent" />}
      </button>
    </Tooltip>
  );
}
