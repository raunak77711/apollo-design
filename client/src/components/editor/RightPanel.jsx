import { Layers } from 'lucide-react';
import { useEditor } from '../../state/EditorContext.jsx';
import { PanelHeader } from '../../ui/primitives.jsx';
import LayersPanel from './LayersPanel.jsx';

/**
 * The right dock. Now holds only Layers — Properties moved to the left with
 * the rest of the contextual tool panels, and Apollo takes this exact slot on
 * its own turn (see EditorPage's rightPanel state), so this component never
 * has to choose between tabs itself.
 */
export default function RightDock({ renamingId, onRenaming, onClose }) {
  const { state } = useEditor();

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-l border-line bg-surface">
      <PanelHeader
        icon={Layers}
        title="Layers"
        action={<span className="num shrink-0 pl-1 text-2xs font-normal normal-case tracking-normal text-ink-3">{state.document.elements.length}</span>}
        onClose={onClose}
      />
      <LayersPanel renamingId={renamingId} onRename={onRenaming} />
    </aside>
  );
}
