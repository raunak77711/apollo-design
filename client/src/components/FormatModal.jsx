import { X, Loader2, Sparkles } from 'lucide-react';
import { PRESETS, presetLabel } from '../design/presets.js';

/**
 * Format picker shown after a user submits a prompt (or clicks "New design").
 * Selecting a format creates the canvas at that size and continues into the editor.
 */
export default function FormatModal({ prompt, onSelect, onClose, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-panel border border-edge rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-edge">
          <div>
            <h2 className="text-lg font-semibold">Choose a format</h2>
            {prompt ? (
              <p className="text-sm text-neutral-400 mt-1 flex items-center gap-1.5">
                <Sparkles size={14} className="text-accent" /> “{prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt}”
              </p>
            ) : (
              <p className="text-sm text-neutral-500 mt-1">Pick a canvas size to start with.</p>
            )}
          </div>
          <button onClick={onClose} className="text-neutral-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              disabled={busy}
              className="group rounded-xl border border-edge bg-panel2 hover:border-accent p-4 text-left transition-colors disabled:opacity-50"
            >
              <div className="h-20 mb-3 flex items-center justify-center">
                <div
                  className="border border-neutral-600 group-hover:border-accent bg-neutral-800/60 rounded"
                  style={ratioBox(p.width, p.height)}
                />
              </div>
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-neutral-500">{presetLabel(p)}</p>
            </button>
          ))}
        </div>

        {busy && (
          <div className="px-5 pb-5 flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 size={15} className="animate-spin" /> Creating your design…
          </div>
        )}
      </div>
    </div>
  );
}

// Fit the preview into a ~64px box while preserving aspect ratio.
function ratioBox(w, h) {
  const max = 64;
  const scale = max / Math.max(w, h);
  return { width: Math.max(12, Math.round(w * scale)), height: Math.max(12, Math.round(h * scale)) };
}
