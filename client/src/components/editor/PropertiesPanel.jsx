import { SlidersHorizontal } from 'lucide-react';
import { useSelection } from '../../state/EditorContext.jsx';
import { typeLabel } from '../../design/layers.js';
import { PanelHeader } from '../../ui/primitives.jsx';
import Inspector from './Inspector.jsx';

/**
 * Properties, on the left with every other contextual tool panel — what's
 * selected right now, one click from the rail via Select's own tab, the same
 * way Text, Shapes and Crop already work. Layers and Apollo share the right
 * dock instead; Properties never goes there.
 */
export default function PropertiesPanel({ onClose, onEditImage, onPickImage, onDraw }) {
  const selection = useSelection();
  const summary =
    selection.length === 0 ? 'Canvas' : selection.length === 1 ? typeLabel(selection[0]) : `${selection.length} layers`;

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        icon={SlidersHorizontal}
        title="Properties"
        action={<span className="num shrink-0 pl-1 text-2xs font-normal normal-case tracking-normal text-ink-3">{summary}</span>}
        onClose={onClose}
      />
      <Inspector onEditImage={onEditImage} onPickImage={onPickImage} onDraw={onDraw} />
    </div>
  );
}
