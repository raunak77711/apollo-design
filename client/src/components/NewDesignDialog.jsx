import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { PRESETS, PRESET_GROUPS, presetLabel } from '../design/presets.js';
import { Modal } from '../ui/overlay.jsx';
import { Button, IconButton, Spinner } from '../ui/primitives.jsx';
import { FormatFrame } from '../ui/frame.jsx';
import { NumberField } from '../ui/fields.jsx';
import { useCreateDesign } from '../lib/useCreateDesign.js';

/** Format picker for "New design". Sizes are shown, not just listed. */
export default function NewDesignDialog({ open, onClose, prompt = '' }) {
  const { create, creating } = useCreateDesign();
  const [custom, setCustom] = useState({ width: 1080, height: 1080 });

  const start = (canvas, name) =>
    create({
      name: prompt ? prompt.slice(0, 60) : name,
      canvas: { width: canvas.width, height: canvas.height, background: '#0A0A0B' },
      prompt,
    });

  return (
    <Modal open={open} onClose={onClose} className="max-w-[46rem]" labelledBy="new-design-title">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 id="new-design-title" className="font-display text-base font-semibold tracking-[-0.02em]">
            New design
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {prompt ? `Apollo will draw “${prompt.slice(0, 52)}${prompt.length > 52 ? '…' : ''}”` : 'Pick a canvas to start on.'}
          </p>
        </div>
        <IconButton onClick={onClose} aria-label="Close">
          <X size={15} />
        </IconButton>
      </header>

      <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">
        {PRESET_GROUPS.map((group) => (
          <section key={group} className="mb-5 last:mb-0">
            <p className="label mb-2.5">{group}</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {PRESETS.filter((p) => p.group === group).map((preset) => (
                <button
                  key={preset.id}
                  disabled={creating}
                  onClick={() => start(preset, `${preset.name}`)}
                  className="group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors duration-150 hover:border-line hover:bg-raised disabled:opacity-50"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center text-ink-3 transition-colors group-hover:text-accent">
                    <FormatFrame width={preset.width} height={preset.height} box={34} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">{preset.name}</span>
                    <span className="num block text-2xs text-ink-3">{presetLabel(preset)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3">
        <span className="label">Custom</span>
        <NumberField
          label="W"
          value={custom.width}
          min={16}
          max={8000}
          onChange={(width) => setCustom((c) => ({ ...c, width }))}
          className="w-24"
        />
        <span className="text-ink-3">×</span>
        <NumberField
          label="H"
          value={custom.height}
          min={16}
          max={8000}
          onChange={(height) => setCustom((c) => ({ ...c, height }))}
          className="w-24"
        />
        <Button variant="secondary" disabled={creating} onClick={() => start(custom, 'Custom design')}>
          Create
        </Button>
        <div className="flex-1" />
        {creating ? (
          <span className="flex items-center gap-2 text-[13px] text-ink-3">
            <Spinner /> Creating…
          </span>
        ) : (
          <Link
            to="/templates"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded text-[13px] text-ink-2 transition-colors hover:text-ink"
          >
            Browse templates <ArrowRight size={13} />
          </Link>
        )}
      </footer>
    </Modal>
  );
}
