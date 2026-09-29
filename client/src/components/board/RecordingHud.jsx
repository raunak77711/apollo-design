import { Maximize, Minus, Plus } from 'lucide-react';
import { IconButton } from '../../ui/primitives.jsx';
import { scrollThumb } from './engine/viewportMath.js';

export function ZoomControls({ zoom, onIn, onOut, onReset }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-pop">
      <IconButton aria-label="Zoom out" onClick={onOut}><Minus size={14} /></IconButton>
      <span className="w-10 text-center font-mono text-2xs text-ink-2">{Math.round(zoom * 100)}%</span>
      <IconButton aria-label="Zoom in" onClick={onIn}><Plus size={14} /></IconButton>
      <IconButton aria-label="Reset view" onClick={onReset}><Maximize size={14} /></IconButton>
    </div>
  );
}

/** A hairline down the right edge: how far through the board you are. Display only. */
export function ScrollIndicator({ view, worldH }) {
  const { top, size } = scrollThumb(view, window.innerHeight, worldH);
  return (
    <div aria-hidden className="pointer-events-none absolute bottom-16 right-1.5 top-16 z-10 w-1 rounded-full bg-ink/10">
      <div className="absolute inset-x-0 rounded-full bg-ink/35" style={{ top: `${top * 100}%`, height: `${size * 100}%` }} />
    </div>
  );
}

/** "4 / 12 — YOU PAID FOR THE CLICK": where you are, at a glance, on the recording. */
export function SectionPill({ index, total, title }) {
  return (
    <div className="max-w-[46vw] truncate rounded-full bg-ink px-3.5 py-1.5 font-mono text-xs text-void shadow-pop">
      {index + 1} / {total} — {title}
    </div>
  );
}
