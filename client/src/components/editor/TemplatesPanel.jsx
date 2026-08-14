import { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { TEMPLATES, TEMPLATE_CATEGORIES, documentFromTemplate } from '../../design/templates.js';
import { presetLabel } from '../../design/presets.js';
import { Chip, PanelHeader } from '../../ui/primitives.jsx';
import DesignPreview from '../DesignPreview.jsx';

const FILTERS = ['All', ...TEMPLATE_CATEGORIES];

/**
 * Starting points, applied into the design you already have open. Everything
 * arrives as ordinary editable layers, and the swap is a single history step —
 * so trying one on is never a commitment.
 */
export default function TemplatesPanel({ onClose }) {
  const { state, actions } = useEditor();
  const [filter, setFilter] = useState('All');
  const [confirming, setConfirming] = useState(null);

  const occupied = state.document.elements.length > 0;
  const shown = TEMPLATES.filter((t) => filter === 'All' || t.category === filter);

  const apply = (template) => {
    const next = documentFromTemplate(template);
    actions.apply(
      [
        { type: 'SET_CANVAS', changes: next.canvas },
        ...state.document.elements.map((el) => ({ type: 'DELETE_ELEMENT', targetId: el.id })),
        ...next.elements.map((element) => ({ type: 'CREATE_ELEMENT', element })),
      ],
      { selectIds: [] }
    );
    setConfirming(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader icon={LayoutTemplate} title="Templates" onClose={onClose} />

      {/* Chips wrap; a segmented control would clip its last category at this width. */}
      <div className="flex flex-wrap gap-1.5 border-b border-line p-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </Chip>
        ))}
      </div>

      <div className="thin-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2">
        {shown.map((template) => {
          const asking = confirming === template.id;
          return (
            <div key={template.id} className="group">
              <button
                onClick={() => (occupied ? setConfirming(asking ? null : template.id) : apply(template))}
                className={cx(
                  'block w-full overflow-hidden rounded border transition-colors duration-150',
                  asking ? 'border-accent' : 'border-line group-hover:border-line-strong'
                )}
              >
                <DesignPreview document={{ canvas: template.canvas, elements: previewElements(template) }} />
              </button>

              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{template.name}</span>
                <span className="num shrink-0 text-2xs text-ink-3">{presetLabel(template.canvas)}</span>
              </div>

              {asking && (
                <div className="mt-1.5 flex items-center gap-1.5 rounded border border-line bg-raised px-2 py-1.5">
                  <span className="flex-1 truncate text-2xs text-ink-3">Replace this design?</span>
                  <button
                    onClick={() => setConfirming(null)}
                    className="rounded px-1.5 py-0.5 text-2xs text-ink-3 transition-colors hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => apply(template)}
                    className="rounded bg-ink px-2 py-0.5 text-2xs font-medium text-void transition-opacity hover:opacity-90"
                  >
                    Replace
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="border-t border-line px-3 py-2 text-2xs leading-relaxed text-ink-3">
        Templates land as editable layers. Undo puts your design back.
      </p>
    </div>
  );
}

/** Previews need id-stamped elements; the template's raw specs have none. */
function previewElements(template) {
  return template.elements.map((spec, i) => ({
    id: `${template.id}-${i}`,
    rotation: 0,
    opacity: 1,
    ...spec,
    zIndex: i + 1,
  }));
}
