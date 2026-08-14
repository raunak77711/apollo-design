import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Undo2, X } from 'lucide-react';
import { api } from '../../api/client.js';
import { cx } from '../../lib/cx.js';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { IconButton, Spinner } from '../../ui/primitives.jsx';
import { Spark } from '../../ui/brand.jsx';

/**
 * Apollo AI, scoped to the design you are looking at. It never returns markup —
 * it returns operations, which are validated and applied as a single undoable
 * step, so anything it makes stays editable by hand.
 */
export default function AIPanel({ onClose }) {
  const { state, actions } = useEditor();
  const selection = useSelection();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);

  const target = selection.length === 1 ? selection[0] : null;
  const empty = state.document.elements.length === 0;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await api.aiChat({
        message,
        document: state.document,
        selectedElementId: target?.id || null,
      });
      if (res.operations?.length) actions.apply(res.operations);
      setMessages((m) => [
        ...m,
        {
          role: 'apollo',
          text: res.message || 'Done.',
          applied: res.operations?.length || 0,
          rejected: res.skipped?.length || 0,
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'apollo', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const lastAppliedIndex = messages.reduce((last, m, i) => (m.applied > 0 ? i : last), -1);

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Spark size={13} className="text-accent" />
        <h2 className="flex-1 text-[13px] font-medium text-ink">Apollo</h2>
        <IconButton onClick={onClose} aria-label="Close Apollo">
          <X size={14} />
        </IconButton>
      </header>

      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="label shrink-0">Context</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-2">
          {target ? `${target.type} · ${labelFor(target)}` : selection.length > 1 ? `${selection.length} layers` : 'Whole design'}
        </span>
      </div>

      <div ref={listRef} className="thin-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-[13px] leading-relaxed text-ink-2">
              {empty
                ? 'Describe the design you want and Apollo will draw the first draft in editable layers.'
                : 'Ask for a change to the whole design, or select a layer first to work on just that.'}
            </p>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="ml-auto w-fit max-w-[86%] rounded-lg rounded-br-sm bg-raised px-2.5 py-2 text-[13px] leading-relaxed text-ink">
              {m.text}
            </p>
          ) : (
            <div key={i} className="animate-fade-in">
              <div className="flex gap-2">
                <Spark size={12} className={cx('mt-1 shrink-0', m.error ? 'text-danger' : 'text-accent')} />
                <p className={cx('text-[13px] leading-relaxed', m.error ? 'text-danger' : 'text-ink-2')}>{m.text}</p>
              </div>
              {m.applied > 0 && (
                <div className="mt-1.5 flex items-center gap-2 pl-5">
                  <span className="num text-2xs text-ink-3">
                    {m.applied} change{m.applied === 1 ? '' : 's'}
                    {m.rejected > 0 && ` · ${m.rejected} rejected`}
                  </span>
                  {i === lastAppliedIndex && (
                    <button
                      onClick={actions.undo}
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

        {busy && (
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <Spinner size={12} /> Apollo is working…
          </div>
        )}
      </div>

      {!busy && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5">
          {suggestionsFor(target, empty).map((s) => (
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

      <div className="border-t border-line p-2.5">
        <div className="flex items-end gap-1.5 rounded-lg border border-line bg-raised p-1.5 transition-colors focus-within:border-line-strong">
          <textarea
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
            placeholder={target ? `Change this ${target.type}…` : 'Ask Apollo…'}
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
      </div>
    </aside>
  );
}

/** Prompts that fit what is selected — and that Apollo can actually act on. */
function suggestionsFor(target, empty) {
  if (empty) return ['Design a premium gym banner', 'Create a bold sale poster'];
  if (!target) return ['Make the headline bigger', 'Change the button colour to blue'];
  if (target.type === 'text') return ['Make this bigger', 'Make it bolder and more premium'];
  if (target.type === 'button') return ['Change the colour to blue', 'Make it bigger'];
  if (target.type === 'image') return ['Move it right', 'Make it bigger'];
  return ['Make it bigger', 'Change the colour to gold'];
}

function labelFor(el) {
  if (el.type === 'text' || el.type === 'button') return el.properties.text?.split('\n')[0]?.slice(0, 28) || 'Empty';
  if (el.type === 'icon') return el.properties.name;
  return el.id.split('-')[0];
}
