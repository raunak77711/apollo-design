import { useState } from 'react';
import { Contrast } from 'lucide-react';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { EFFECT_CATEGORIES, effectsInCategory } from '../../design/effects.js';
import { cssImageFilter } from '../../design/imageFilters.js';
import { SIGNED_ADJUST_KEYS, UNSIGNED_ADJUST_KEYS } from '../../design/schema.js';
import { Chip, EmptyState, PanelHeader } from '../../ui/primitives.jsx';

const NEUTRAL = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0, grayscale: 0, blur: 0,
  ...Object.fromEntries([...SIGNED_ADJUST_KEYS, ...UNSIGNED_ADJUST_KEYS].map((k) => [k, 0])),
};

/**
 * The Effects library, reachable directly from the rail rather than only
 * inside the full photo editor. One click applies a preset to the selected
 * image as a single undoable step — for the full slider-by-slider control,
 * open Adjust/Retouch from the image's properties.
 */
export default function FiltersPanel({ onClose }) {
  const { actions } = useEditor();
  const selection = useSelection();
  const element = selection.length === 1 && selection[0].type === 'image' ? selection[0] : null;
  const [category, setCategory] = useState('All');

  const apply = (effect) => {
    actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes: { ...NEUTRAL, ...effect.values } }]);
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHeader icon={Contrast} title="Effects" onClose={onClose} />

      {!element ? (
        <EmptyState className="flex-1" icon={Contrast} title="Select an image" body="Pick an image layer on the canvas to filter it." />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-line p-2">
            {['All', ...EFFECT_CATEGORIES].map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}
          </div>
          <div className="thin-scroll grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto p-2">
            {effectsInCategory(category).map((effect) => (
              <button key={effect.id} onClick={() => apply(effect)} className="group flex flex-col items-center gap-1.5">
                <span className="w-full overflow-hidden rounded border border-line transition-colors group-hover:border-accent">
                  <img
                    src={element.properties.src}
                    alt=""
                    className="aspect-square w-full object-cover"
                    style={{ filter: cssImageFilter({ ...NEUTRAL, ...effect.values }) }}
                  />
                </span>
                <span className="truncate text-2xs text-ink-3 transition-colors group-hover:text-ink">{effect.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
