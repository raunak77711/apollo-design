import { Check } from 'lucide-react';
import { Button, Spinner } from '../../ui/primitives.jsx';

/**
 * What Apollo is doing while a board is generated: the sections the outline
 * found, ticked off as each one arrives. Sections finish out of order (four run
 * at once), so this shows a set of finished ids, not a counter.
 */
export default function GenerateProgress({ outline, done, onCancel }) {
  const total = outline?.sections.length || 0;
  return (
    <div className="mt-8 rounded-xl border border-line bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">
            {outline ? `Drafting section ${Math.min(done.size + 1, total)} of ${total}` : 'Reading your brief'}
          </p>
          <h2 className="mt-1 truncate font-display text-xl text-ink">{outline?.title || 'Finding the chapters…'}</h2>
        </div>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {outline && (
        <ol className="mt-5 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {outline.sections.map((section, i) => (
            <li key={section.id} className="flex items-center gap-2.5 text-[13px]">
              {done.has(section.id) ? <Check size={14} className="shrink-0 text-accent-text" /> : <Spinner size={12} className="shrink-0" />}
              <span className={done.has(section.id) ? 'truncate text-ink' : 'truncate text-ink-3'}>
                {i + 1}. {section.title}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-5 text-xs text-ink-3">A full board can take a couple of minutes. Nothing is lost if a section needs a second try.</p>
    </div>
  );
}
