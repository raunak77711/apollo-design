import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Columns3, Undo2 } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { IconButton, Spinner } from '../../ui/primitives.jsx';
import { Spark } from '../../ui/brand.jsx';
import DesignPreview from '../DesignPreview.jsx';

/**
 * The conversation itself — transcript, alternative directions, prompt chips
 * and the composer. Shared by the editor's Apollo panel and the homepage
 * assistant so the two never drift apart in voice or behaviour; each caller
 * brings its own chrome around it and fills the slots it needs.
 */
export default function ApolloConversation({
  chat,
  intro,
  suggestions = [],
  placeholder = 'Ask Apollo…',
  onUndo,
  canExplore = true,
  leading,
  footer,
  autoFocus = false,
  className,
}) {
  const [input, setInput] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const { messages, busy, directions, lastBrief, lastAppliedIndex } = chat;
  const showExplore = canExplore && Boolean(lastBrief) && !directions;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, directions]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const send = (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    if (text === undefined) {
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
    chat.send(message);
  };

  return (
    <div className={cx('flex min-h-0 flex-1 flex-col', className)}>
      <div ref={listRef} className="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.length === 0 && intro}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p
              key={i}
              className="ml-auto w-fit max-w-[86%] rounded-lg rounded-br-sm bg-raised px-2.5 py-2 text-[13px] leading-relaxed text-ink"
            >
              {m.text}
            </p>
          ) : (
            <div key={i} className="animate-fade-in">
              <div className="flex gap-2">
                <Spark size={12} className={cx('mt-1 shrink-0', m.error ? 'text-danger' : 'text-accent')} />
                <p className={cx('text-[13px] leading-relaxed', m.error ? 'text-danger' : 'text-ink-2')}>{m.text}</p>
              </div>
              {m.direction && <DirectionNote direction={m.direction} />}
              {m.applied > 0 && (
                <div className="mt-1.5 flex items-center gap-2 pl-5">
                  <span className="num text-2xs text-ink-3">
                    {m.applied} change{m.applied === 1 ? '' : 's'}
                    {m.rejected > 0 && ` · ${m.rejected} rejected`}
                  </span>
                  {onUndo && i === lastAppliedIndex && (
                    <button
                      onClick={onUndo}
                      className="flex items-center gap-1 rounded text-2xs text-ink-3 transition-colors hover:text-ink"
                    >
                      <Undo2 size={11} /> Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {directions?.length > 0 && (
          <div className="animate-fade-in space-y-2">
            <p className="label">Three directions</p>
            <div className="space-y-2">
              {directions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => chat.chooseDirection(d)}
                  className="group block w-full overflow-hidden rounded-md border border-line text-left transition-colors hover:border-line-strong"
                >
                  <DesignPreview document={d.preview} className="w-full" />
                  <span className="flex items-baseline justify-between gap-2 border-t border-line bg-raised px-2 py-1.5">
                    <span className="text-xs font-medium text-ink">{d.label}</span>
                    <span className="truncate text-2xs text-ink-3">{d.layout}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <Spinner size={12} /> Apollo is working…
          </div>
        )}
      </div>

      {!busy && (showExplore || suggestions.length > 0) && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line px-3 py-2.5">
          {showExplore && (
            <button
              onClick={chat.explore}
              className="flex items-center gap-1.5 rounded border border-line bg-raised px-2 py-1 text-xs text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              <Columns3 size={11} /> Three directions
            </button>
          )}
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded border border-line bg-raised px-2 py-1 text-left text-xs text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {footer}

      <div className="shrink-0 border-t border-line p-2.5">
        <div className="flex items-end gap-1.5 rounded-lg border border-line bg-raised p-1.5 transition-colors focus-within:border-line-strong">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={placeholder}
            className="thin-scroll max-h-[7.5rem] min-h-[1.75rem] flex-1 resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
          />
          <IconButton
            size="lg"
            variant="primary"
            aria-label="Send to Apollo"
            disabled={!input.trim() || busy}
            onClick={() => send()}
          >
            <ArrowUp size={14} />
          </IconButton>
        </div>
        {leading && <div className="mt-2 flex items-center gap-2">{leading}</div>}
      </div>
    </div>
  );
}

/**
 * The art direction behind a generated design, shown rather than hidden: the
 * palette Apollo chose, the structure it used, and how its own review went.
 */
function DirectionNote({ direction }) {
  const swatches = ['background', 'surface', 'accent', 'primary']
    .map((key) => direction.palette?.[key])
    .filter(Boolean);

  return (
    <div className="mt-2 space-y-1.5 pl-5">
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5">
          {swatches.map((color, i) => (
            <span key={`${color}-${i}`} className="h-3 w-3 rounded-sm border border-line" style={{ background: color }} />
          ))}
        </span>
        <span className="truncate text-2xs text-ink-3">
          {direction.style} · {direction.layout?.replace(/-/g, ' ')}
        </span>
      </div>
      {direction.fixed?.length > 0 && (
        <p className="text-2xs leading-relaxed text-ink-3">
          Review: {direction.fixed.length} refinement{direction.fixed.length === 1 ? '' : 's'} applied
        </p>
      )}
      {direction.outstanding?.length > 0 && (
        <p className="text-2xs leading-relaxed text-ink-3">Worth a look: {direction.outstanding[0]}</p>
      )}
    </div>
  );
}
