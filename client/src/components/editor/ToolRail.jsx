import {
  Circle,
  Crop,
  Hand,
  Hexagon,
  Layers,
  LayoutTemplate,
  Minus,
  MousePointer2,
  PenTool,
  Pipette,
  RectangleHorizontal,
  Shapes,
  SlidersHorizontal,
  Square,
  Star,
  Sticker,
  SunDim,
  Triangle,
  Type,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { Tooltip } from '../../ui/primitives.jsx';

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

/**
 * Tool rail: Select, Hand, then the panel tools in the order a photo editor
 * expects them — Crop, Filters, Retouch, Drawing, Texts, Elements. Each of
 * those opens its own panel rather than arming a place-on-click tool, so
 * there's nothing to "drop" — click it and it's already there or already
 * applied. Shape/text/icon keyboard shortcuts (R, O, T, I…) still work from
 * anywhere; this is just what's visible.
 */
export default function ToolRail({
  cropOpen, onCrop,
  filtersOpen, onFilters,
  onRetouch,
  onDraw,
  textsOpen, onTexts,
  elementsOpen, onElements,
  templatesOpen, onTemplates,
  layersOpen, onLayers,
  onSampleColour,
}) {
  const { state, actions } = useEditor();

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

      <RailButton label="Crop" icon={Crop} active={cropOpen} onClick={onCrop} />
      <RailButton label="Filters" icon={SlidersHorizontal} active={filtersOpen} onClick={onFilters} />
      <RailButton label="Retouch" icon={SunDim} onClick={onRetouch} />
      <RailButton label="Drawing" icon={PenTool} onClick={onDraw} />

      <Divider />

      <RailButton label="Texts" hint="T" icon={Type} active={textsOpen} onClick={onTexts} />
      <RailButton label="Elements" hint="M" icon={Shapes} active={elementsOpen} onClick={onElements} />
      <RailButton label="Templates" icon={LayoutTemplate} active={templatesOpen} onClick={onTemplates} />

      <div className="flex-1" />

      {onSampleColour && (
        <RailButton label="Pick a colour" hint="C" icon={Pipette} onClick={onSampleColour} />
      )}
      <RailButton label="Layers" icon={Layers} active={layersOpen} onClick={onLayers} />
    </nav>
  );
}

const Divider = () => <span className="my-1 h-px w-6 bg-line" />;

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
