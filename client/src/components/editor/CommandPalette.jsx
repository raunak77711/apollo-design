import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEscape } from '../../ui/overlay.jsx';

/**
 * ⌘K. Every editor action in one list, so nothing needs a permanent button on
 * screen just to stay reachable.
 */
export default function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  useEscape(onClose, open);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = commands.filter((c) => !c.disabled);
    if (!q) return available;
    return available.filter((c) => `${c.group} ${c.label}`.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(results.length - 1, 0)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (command) => {
    onClose();
    command.run();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center p-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="scrim absolute inset-0 animate-fade-in" onClick={onClose} />

      <div className="relative flex w-full max-w-lg animate-rise flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Search size={15} className="shrink-0 text-ink-3" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => (i + 1) % Math.max(results.length, 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
              }
              if (e.key === 'Enter' && results[active]) {
                e.preventDefault();
                run(results[active]);
              }
            }}
            placeholder="Search actions…"
            className="h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <div ref={listRef} className="thin-scroll max-h-[22rem] overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-2.5 py-6 text-center text-[13px] text-ink-3">No matching action</p>}

          {results.map((command, i) => {
            const Icon = command.icon;
            const newGroup = i === 0 || results[i - 1].group !== command.group;
            return (
              <div key={command.id}>
                {newGroup && <p className="label px-2.5 pb-1 pt-2.5">{command.group}</p>}
                <button
                  data-active={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(command)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] transition-colors duration-100',
                    i === active ? 'bg-raised text-ink' : 'text-ink-2'
                  )}
                >
                  {Icon && <Icon size={14} className="shrink-0 text-ink-3" />}
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.hint && <span className="font-mono text-2xs text-ink-3">{command.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
