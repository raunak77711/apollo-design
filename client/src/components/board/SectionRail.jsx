import { useState } from 'react';
import { RefreshCw, TriangleAlert, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { Button, IconButton, Spinner, Tooltip } from '../../ui/primitives.jsx';

/**
 * Every section, one click away — and a way to ask for a better one. A section
 * DeepSeek could not build shows a warning; "Rebuild" rebuilds just that section
 * (optionally with a note like "make the graph much bigger") and leaves the
 * rest of the board, and everything you drew, alone.
 */
export default function SectionRail({ sections, current, busyIndex, canRegenerate, onGo, onRegenerate, onClose }) {
  const [openNote, setOpenNote] = useState(null);
  const [note, setNote] = useState('');

  return (
    <aside className="absolute bottom-16 right-4 top-16 z-10 flex w-72 flex-col rounded-xl border border-line bg-surface shadow-pop">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="label">Sections</p>
        <IconButton aria-label="Close sections" onClick={onClose}><X size={14} /></IconButton>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {sections.map((section, i) => (
          <li key={section.id} className={cx('rounded-lg', i === current && 'bg-raised')}>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onGo(i)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px] text-ink">
                <span className="w-5 shrink-0 font-mono text-2xs text-ink-3">{i + 1}</span>
                <span className="truncate">{section.title}</span>
                {section.degraded && (
                  <Tooltip label="Apollo couldn't build this one properly" side="left">
                    <TriangleAlert size={12} className="shrink-0 text-danger" />
                  </Tooltip>
                )}
              </button>
              {busyIndex === i ? (
                <Spinner size={12} className="mr-2" />
              ) : (
                <Tooltip label={canRegenerate ? 'Rebuild this section' : 'This board has no brief to rebuild from'} side="left">
                  <IconButton
                    aria-label={`Rebuild section ${i + 1}`}
                    disabled={!canRegenerate || busyIndex !== null}
                    onClick={() => { setOpenNote(openNote === i ? null : i); setNote(''); }}
                  >
                    <RefreshCw size={13} />
                  </IconButton>
                </Tooltip>
              )}
            </div>
            {openNote === i && (
              <form
                className="flex gap-1.5 px-2 pb-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setOpenNote(null);
                  onRegenerate(i, note.trim());
                }}
              >
                <input
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note, e.g. make the graph bigger"
                  maxLength={300}
                  className="field min-w-0 flex-1"
                />
                <Button type="submit" variant="primary" size="sm">Rebuild</Button>
              </form>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
