import { Layers, X } from 'lucide-react';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { layerLabel } from '../../design/layers.js';
import { IconButton, Tooltip } from '../../ui/primitives.jsx';
import { Spark } from '../../ui/brand.jsx';
import ApolloConversation from '../apollo/ApolloConversation.jsx';
import { useApolloChat } from '../apollo/useApolloChat.js';

/**
 * Apollo AI, scoped to the design you are looking at. It never returns markup —
 * it returns operations, which are validated and applied as a single undoable
 * step, so anything it makes stays editable by hand.
 *
 * The conversation itself is shared with the homepage assistant; this file is
 * only the editor's framing of it — the document it works on, and the layer
 * currently under the cursor.
 */
export default function AIPanel({ onClose, onShowLayers }) {
  const { state, actions } = useEditor();
  const selection = useSelection();

  const target = selection.length === 1 ? selection[0] : null;
  const empty = state.document.elements.length === 0;

  const chat = useApolloChat({
    document: state.document,
    selectedElementId: target?.id || null,
    onOperations: actions.apply,
  });

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1">
        <Spark size={12} className="shrink-0 text-accent" />
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">Apollo</h2>
        {onShowLayers && (
          <Tooltip label="Show layers" hint="F7" side="bottom">
            <IconButton size="sm" onClick={onShowLayers} aria-label="Show layers">
              <Layers size={13} />
            </IconButton>
          </Tooltip>
        )}
        <IconButton size="sm" onClick={onClose} aria-label="Close Apollo">
          <X size={13} />
        </IconButton>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="label shrink-0">Context</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-2">
          {target
            ? `${target.type} · ${layerLabel(target).slice(0, 28)}`
            : selection.length > 1
              ? `${selection.length} layers`
              : 'Whole design'}
        </span>
      </div>

      <ApolloConversation
        chat={chat}
        onUndo={actions.undo}
        suggestions={suggestionsFor(target, empty)}
        placeholder={target ? `Change this ${target.type}…` : 'Ask Apollo…'}
        intro={
          <p className="text-[13px] leading-relaxed text-ink-2">
            {empty
              ? 'Describe the design you want and Apollo will draw the first draft in editable layers.'
              : 'Ask for a change to the whole design, or select a layer first to work on just that.'}
          </p>
        }
      />
    </aside>
  );
}

/** Prompts that fit what is selected — and that Apollo can actually act on. */
function suggestionsFor(target, empty) {
  if (empty) return ['Instagram post for a gym New Year offer', 'Poster for a jazz night'];
  if (!target) return ['Make the headline bigger', 'Try a different layout'];
  if (target.type === 'text') return ['Make this bigger', 'Make it bolder and more premium'];
  if (target.type === 'button') return ['Change the colour to blue', 'Make it bigger'];
  if (target.type === 'image') return ['Replace this photo', 'Move it right'];
  return ['Make it bigger', 'Change the colour to gold'];
}
