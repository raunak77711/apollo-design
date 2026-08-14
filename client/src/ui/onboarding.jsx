import { useEffect, useState } from 'react';
import { Kbd } from './primitives.jsx';
import { Spark } from './brand.jsx';

/**
 * Shown while Apollo draws the first design. Real, working shortcuts only —
 * this is the user's first impression of what the app can do, so nothing here
 * is allowed to be aspirational.
 */
const HINTS = [
  ['Undo anything', '⌘ Z'],
  ['Redo it', '⇧ ⌘ Z'],
  ['Duplicate a layer', '⌘ D'],
  ['Copy a layer', '⌘ C'],
  ['Cut a layer', '⌘ X'],
  ['Paste it back', '⌘ V'],
  ['Group the selection', '⌘ G'],
  ['Delete a layer', '⌫'],
  ['Command palette', '⌘ K'],
  ['Ask Apollo again', '⌘ J'],
];

const ROTATE_MS = 2200;

export default function OnboardingOverlay({ title = 'Apollo is drawing your design', subtitle = 'Every layer will stay editable.' }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % HINTS.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  const [label, keys] = HINTS[index];

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center">
      <div className="scrim absolute inset-0 animate-fade-in" />
      <div className="relative flex w-[22rem] animate-rise flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-6 text-center shadow-pop">
        <div className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
          <Spark size={18} className="text-accent" />
        </div>

        <div>
          <p className="text-[13px] font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>
        </div>

        <div className="flex h-14 w-full flex-col items-center justify-center gap-2 rounded-lg border border-line bg-raised px-3">
          <div key={index} className="flex animate-fade-in items-center gap-2 text-xs text-ink-2">
            <span>{label}</span>
            <Kbd>{keys}</Kbd>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {HINTS.map((_, i) => (
            <span key={i} className={`h-1 w-1 rounded-full transition-colors duration-300 ${i === index ? 'bg-accent' : 'bg-line-strong'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
