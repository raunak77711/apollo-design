import { useRef } from 'react';
import { Crop, X } from 'lucide-react';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { SliderField, Segmented } from '../../ui/fields.jsx';
import { EmptyState, IconButton } from '../../ui/primitives.jsx';

/**
 * Crop, on its own — the same focal-point-plus-zoom model as the Properties
 * panel's crop pad, but full-width and reachable straight from the rail so it
 * doesn't require opening the whole inspector first.
 */
export default function CropPanel({ onClose }) {
  const { actions } = useEditor();
  const selection = useSelection();
  const element = selection.length === 1 && selection[0].type === 'image' ? selection[0] : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Crop size={14} className="text-ink-3" />
        <h2 className="flex-1 text-[13px] font-medium text-ink">Crop</h2>
        <IconButton onClick={onClose} aria-label="Close crop"><X size={14} /></IconButton>
      </header>

      {!element ? (
        <EmptyState icon={Crop} title="Select an image" body="Pick an image layer on the canvas to crop it." />
      ) : (
        <CropControls element={element} actions={actions} />
      )}
    </div>
  );
}

function CropControls({ element, actions }) {
  const p = element.properties;
  const padRef = useRef(null);

  const live = (changes) => actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes }]);
  const set = (changes) => actions.apply([{ type: 'UPDATE_ELEMENT', targetId: element.id, changes }]);
  const commit = () => actions.commitTransient();

  const pick = (e) => {
    const box = padRef.current.getBoundingClientRect();
    live({
      focalX: Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))),
      focalY: Math.round(Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100))),
    });
  };

  return (
    <div className="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <div>
        <p className="label mb-2">Fit</p>
        <Segmented
          className="w-full"
          value={p.fit}
          onChange={(fit) => set({ fit })}
          options={[
            { value: 'cover', label: 'Fill' },
            { value: 'contain', label: 'Fit' },
            { value: 'fill', label: 'Stretch' },
          ]}
        />
      </div>

      {p.src && p.fit === 'cover' && (
        <div>
          <p className="label mb-2">Focal point</p>
          <span
            ref={padRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pick(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
            }}
            onPointerUp={commit}
            className="relative block aspect-video w-full cursor-crosshair overflow-hidden rounded border border-line-strong"
          >
            <img src={p.src} alt="" draggable={false} className="h-full w-full object-cover" />
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow-pop"
              style={{ left: `${p.focalX ?? 50}%`, top: `${p.focalY ?? 50}%` }}
            />
          </span>
          <p className="mt-1.5 text-2xs text-ink-3">Drag to set what stays in frame.</p>
        </div>
      )}

      {p.fit === 'cover' && (
        <SliderField
          label="Zoom"
          value={Math.round((p.zoom ?? 1) * 100)}
          min={100}
          max={400}
          display={`${Math.round((p.zoom ?? 1) * 100)}%`}
          onChange={(v) => live({ zoom: v / 100 })}
          onCommit={commit}
        />
      )}

      <SliderField
        label="Rotate"
        value={Math.round(element.rotation || 0)}
        min={-180}
        max={180}
        display={`${Math.round(element.rotation || 0)}°`}
        onChange={(rotation) => live({ rotation })}
        onCommit={commit}
      />
      <SliderField
        label="Corner radius"
        value={p.borderRadius ?? 0}
        min={0}
        max={Math.round(Math.min(element.width, element.height) / 2)}
        onChange={(borderRadius) => live({ borderRadius })}
        onCommit={commit}
      />

      <button
        onClick={() => set({ focalX: 50, focalY: 50, zoom: 1, fit: 'cover' })}
        className="h-8 w-full rounded border border-line bg-raised text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
      >
        Reset crop
      </button>
    </div>
  );
}
