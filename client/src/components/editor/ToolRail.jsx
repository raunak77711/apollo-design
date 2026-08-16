import {
  Brush,
  Circle,
  Contrast,
  Crop,
  Hand,
  Hexagon,
  ImageIcon,
  Layers,
  LayoutTemplate,
  Minus,
  MousePointer2,
  Pipette,
  RectangleHorizontal,
  Shapes,
  SlidersHorizontal,
  Square,
  Star,
  Sticker,
  Triangle,
  Type,
  Upload,
  Wand2,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { Tooltip } from '../../ui/primitives.jsx';
import { Spark } from '../../ui/brand.jsx';

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
 * The rail is the editor's spine: every major tool hangs off it, in the order
 * work actually happens — point at something, make something, adjust it.
 *
 * Properties sits with the rest of the contextual tool panels (Text, Shapes,
 * Crop, ...) and opens on the left next to the rail, right where Select's own
 * tab belongs. Layers and Apollo share the right dock instead, as two states
 * of one slot: Apollo's own button doubles as the way back to Layers once
 * it's open, so its label reads "Show layers" rather than closing outright.
 *
 * Two kinds of button live here and they behave differently on purpose:
 * arming tools (Select, Hand) change what a canvas click does, while panel
 * tools open a flyout and leave the canvas alone.
 */
export default function ToolRail({
  panel,
  onPanel,
  rightPanel,
  onShowLayers,
  onToggleApollo,
  onRetouch,
  onDraw,
  onSampleColour,
}) {
  const { state, actions } = useEditor();

  return (
    <nav
      aria-label="Tools"
      className="z-20 flex w-12 shrink-0 flex-col items-center border-r border-line bg-surface"
    >
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-px overflow-y-auto py-2">
        <RailButton
          label="Select"
          hint="V"
          icon={MousePointer2}
          active={state.tool === 'select'}
          onClick={() => actions.setTool('select')}
        />
        <RailButton
          label="Pan"
          hint="H"
          icon={Hand}
          active={state.tool === 'hand'}
          onClick={() => actions.setTool(state.tool === 'hand' ? 'select' : 'hand')}
        />

        <Divider />

        <RailButton
          label="Properties"
          hint="F8"
          icon={SlidersHorizontal}
          active={panel === 'properties'}
          onClick={() => onPanel('properties')}
        />

        <Divider />

        <RailButton
          label="Text"
          hint="T"
          icon={Type}
          active={panel === 'texts' || state.tool === 'text'}
          onClick={() => onPanel('texts')}
        />
        <RailButton label="Shapes" hint="M" icon={Shapes} active={panel === 'shapes'} onClick={() => onPanel('shapes')} />
        <RailButton label="Images" icon={ImageIcon} active={panel === 'images'} onClick={() => onPanel('images')} />
        <RailButton label="Upload" icon={Upload} active={panel === 'uploads'} onClick={() => onPanel('uploads')} />
        <RailButton label="Draw" icon={Brush} onClick={onDraw} />
        <RailButton
          label="Templates"
          icon={LayoutTemplate}
          active={panel === 'templates'}
          onClick={() => onPanel('templates')}
        />

        <Divider />

        <RailButton label="Crop" icon={Crop} active={panel === 'crop'} onClick={() => onPanel('crop')} />
        <RailButton label="Effects" icon={Contrast} active={panel === 'filters'} onClick={() => onPanel('filters')} />
        <RailButton label="Retouch" icon={Wand2} onClick={onRetouch} />
        {onSampleColour && <RailButton label="Pick a colour" hint="C" icon={Pipette} onClick={onSampleColour} />}
      </div>

      {/* Pinned dock: who else can change the design, and what it's made of.
          One toggle, two faces — Apollo's button becomes the way back to
          Layers the moment Apollo is the one showing. */}
      <div className="flex shrink-0 flex-col items-center gap-px border-t border-line py-2">
        <RailButton
          label={rightPanel === 'ai' ? 'Show layers' : 'Ask Apollo'}
          hint="⌘J"
          icon={rightPanel === 'ai' ? Layers : Spark}
          active={rightPanel === 'ai'}
          onClick={onToggleApollo}
          iconClassName={cx(rightPanel !== 'ai' && 'text-accent')}
        />
        <RailButton
          label="Layers"
          hint="F7"
          icon={Layers}
          active={rightPanel === 'layers'}
          onClick={onShowLayers}
        />
      </div>
    </nav>
  );
}

const Divider = () => <span className="my-1.5 h-px w-5 shrink-0 bg-line" />;

function RailButton({ label, hint, icon: Icon, active, iconClassName, onClick, ...props }) {
  return (
    <Tooltip label={label} hint={hint} side="right">
      <button
        onClick={onClick}
        aria-label={label}
        aria-pressed={Boolean(active)}
        className="rail-btn"
        {...props}
      >
        <Icon size={16} strokeWidth={1.75} className={iconClassName} />
      </button>
    </Tooltip>
  );
}
