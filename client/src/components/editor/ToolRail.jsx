import { useRef, useState } from 'react';
import {
  Circle,
  Hand,
  Hexagon,
  ImageIcon,
  Layers,
  LayoutTemplate,
  Minus,
  MousePointer2,
  Pipette,
  RectangleHorizontal,
  Square,
  Star,
  Sticker,
  Triangle,
  Type,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useLocalState } from '../../lib/useLocalState.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { Tooltip } from '../../ui/primitives.jsx';
import { ContextMenu, MenuItem } from '../../ui/overlay.jsx';

/**
 * Everything the rail can place. `size` is the footprint a click drops on the
 * canvas; `props` seeds the element's own properties.
 */
export const CREATION_TOOLS = [
  { id: 'text', label: 'Text', hint: 'T', icon: Type, size: { width: 420, height: 72 }, props: { text: 'Your text', fontSize: 48 } },
  { id: 'heading', label: 'Heading', type: 'text', icon: Type, size: { width: 620, height: 108 }, props: { text: 'Headline', fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 } },
  { id: 'subheading', label: 'Subheading', type: 'text', icon: Type, size: { width: 520, height: 44 }, props: { text: 'Supporting line', fontSize: 28, fontWeight: 600, lineHeight: 1.25 } },
  { id: 'body', label: 'Body text', type: 'text', icon: Type, size: { width: 460, height: 72 }, props: { text: 'Body copy goes here.', fontSize: 18, fontWeight: 400, lineHeight: 1.55 } },
  { id: 'eyebrow', label: 'Eyebrow', type: 'text', icon: Type, size: { width: 380, height: 22 }, props: { text: 'SECTION LABEL', fontSize: 13, fontWeight: 600, letterSpacing: 4.5, textCase: 'uppercase' } },

  { id: 'rectangle', label: 'Rectangle', hint: 'R', icon: Square, size: { width: 320, height: 200 } },
  { id: 'circle', label: 'Ellipse', hint: 'O', icon: Circle, size: { width: 220, height: 220 } },
  { id: 'triangle', label: 'Triangle', type: 'polygon', icon: Triangle, size: { width: 240, height: 210 }, props: { sides: 3 } },
  { id: 'polygon', label: 'Polygon', hint: 'P', type: 'polygon', icon: Hexagon, size: { width: 220, height: 220 }, props: { sides: 6 } },
  { id: 'star', label: 'Star', hint: 'S', icon: Star, size: { width: 220, height: 220 }, props: { points: 5, depth: 0.45 } },
  { id: 'line', label: 'Line', hint: 'L', icon: Minus, size: { width: 320, height: 12 } },

  { id: 'button', label: 'Button', hint: 'B', icon: RectangleHorizontal, size: { width: 220, height: 56 }, props: { text: 'Button' } },
  { id: 'icon', label: 'Icon', hint: 'I', icon: Sticker, size: { width: 56, height: 56 } },
];

export const toolById = (id) => CREATION_TOOLS.find((t) => t.id === id) || null;
/** The document element a tool produces — several tools share one type. */
export const typeOfTool = (id) => toolById(id)?.type || id;

const TEXT_TOOLS = ['text', 'heading', 'subheading', 'body', 'eyebrow'];
const SHAPE_TOOLS = ['rectangle', 'circle', 'triangle', 'polygon', 'star', 'line'];

/**
 * Tool rail. Picking a tool arms it — the next click on the canvas places the
 * element there, so nothing lands somewhere you didn't choose. Related tools
 * share one slot: the slot keeps whichever you used last, and a press-and-hold
 * (or right-click) opens the rest.
 */
export default function ToolRail({ libraryOpen, onLibrary, templatesOpen, onTemplates, layersOpen, onLayers, onSampleColour }) {
  const { state, actions } = useEditor();
  const [lastText, setLastText] = useLocalState('apollo.tool.text', 'text');
  const [lastShape, setLastShape] = useLocalState('apollo.tool.shape', 'rectangle');
  const [flyout, setFlyout] = useState(null);

  const arm = (id) => {
    if (TEXT_TOOLS.includes(id)) setLastText(id);
    if (SHAPE_TOOLS.includes(id)) setLastShape(id);
    actions.setTool(state.tool === id ? 'select' : id);
  };

  const group = (ids, active) => ({
    ids,
    active,
    onPick: (id) => {
      if (TEXT_TOOLS.includes(id)) setLastText(id);
      if (SHAPE_TOOLS.includes(id)) setLastShape(id);
      actions.setTool(id);
    },
  });

  return (
    <nav className="z-20 flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2.5">
      <RailButton
        label="Select"
        hint="V"
        icon={MousePointer2}
        active={state.tool === 'select'}
        onClick={() => actions.setTool('select')}
      />
      <RailButton
        label="Hand"
        hint="H"
        icon={Hand}
        active={state.tool === 'hand'}
        onClick={() => actions.setTool(state.tool === 'hand' ? 'select' : 'hand')}
      />

      <Divider />

      <RailGroup
        tools={TEXT_TOOLS}
        current={TEXT_TOOLS.includes(state.tool) ? state.tool : lastText}
        armed={state.tool}
        onArm={arm}
        onFlyout={setFlyout}
        group={group}
      />
      <RailGroup
        tools={SHAPE_TOOLS}
        current={SHAPE_TOOLS.includes(state.tool) ? state.tool : lastShape}
        armed={state.tool}
        onArm={arm}
        onFlyout={setFlyout}
        group={group}
      />

      {['button', 'icon'].map((id) => {
        const tool = toolById(id);
        return (
          <RailButton
            key={id}
            label={tool.label}
            hint={tool.hint}
            icon={tool.icon}
            active={state.tool === id}
            onClick={() => arm(id)}
          />
        );
      })}

      <Divider />

      <RailButton label="Images" hint="M" icon={ImageIcon} active={libraryOpen} onClick={onLibrary} />
      <RailButton label="Templates" icon={LayoutTemplate} active={templatesOpen} onClick={onTemplates} />

      <div className="flex-1" />

      {onSampleColour && (
        <RailButton label="Pick a colour" hint="C" icon={Pipette} onClick={onSampleColour} />
      )}
      <RailButton label="Layers" icon={Layers} active={layersOpen} onClick={onLayers} />

      {flyout && (
        <ContextMenu x={flyout.x} y={flyout.y} onClose={() => setFlyout(null)} className="w-44">
          {flyout.ids.map((id) => {
            const tool = toolById(id);
            const Icon = tool.icon;
            return (
              <MenuItem
                key={id}
                icon={Icon}
                hint={tool.hint}
                className={cx(id === flyout.active && 'text-ink')}
                onClick={() => {
                  flyout.onPick(id);
                  setFlyout(null);
                }}
              >
                {tool.label}
              </MenuItem>
            );
          })}
        </ContextMenu>
      )}
    </nav>
  );
}

const Divider = () => <span className="my-1 h-px w-6 bg-line" />;

/** One rail slot standing in for a family of tools. */
function RailGroup({ tools, current, armed, onArm, onFlyout, group }) {
  const tool = toolById(current) || toolById(tools[0]);
  const ref = useRef(null);
  const hold = useRef(null);

  const open = () => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onFlyout({ x: box.right + 8, y: box.top - 4, ...group(tools, current) });
  };

  return (
    <span ref={ref} className="relative flex">
      <RailButton
        label={tool.label}
        hint={tool.hint}
        icon={tool.icon}
        active={tools.includes(armed)}
        more
        onContextMenu={(e) => {
          e.preventDefault();
          open();
        }}
        onPointerDown={() => {
          hold.current = setTimeout(open, 240);
        }}
        onPointerUp={() => clearTimeout(hold.current)}
        onPointerLeave={() => clearTimeout(hold.current)}
        onClick={() => {
          clearTimeout(hold.current);
          // A second click on the armed slot reveals its siblings.
          if (armed === current) open();
          else onArm(current);
        }}
      />
    </span>
  );
}

function RailButton({ label, hint, icon: Icon, active, more, onClick, ...props }) {
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
        {...props}
      >
        <Icon size={17} strokeWidth={1.75} />
        {active && <span className="absolute -left-2.5 h-4 w-[2px] rounded-full bg-accent" />}
        {more && (
          <span
            aria-hidden="true"
            className={cx(
              'absolute bottom-[3px] right-[3px] h-0 w-0 border-b-[4px] border-l-[4px] border-b-current border-l-transparent',
              active ? 'opacity-70' : 'opacity-40'
            )}
          />
        )}
      </button>
    </Tooltip>
  );
}
