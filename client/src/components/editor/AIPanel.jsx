import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Columns3, Layers, Undo2, X } from 'lucide-react';
import { api } from '../../api/client.js';
import { cx } from '../../lib/cx.js';
import { useEditor, useSelection } from '../../state/EditorContext.jsx';
import { layerLabel } from '../../design/layers.js';
import { applyOperations } from '../../design/operations.js';
import { IconButton, Spinner, Tooltip } from '../../ui/primitives.jsx';
import { Spark } from '../../ui/brand.jsx';
import DesignPreview from '../DesignPreview.jsx';

/**
 * Apollo AI, scoped to the design you are looking at. It never returns markup —
 * it returns operations, which are validated and applied as a single undoable
 * step, so anything it makes stays editable by hand.
 */
export default function AIPanel({ onClose, onShowLayers }) {
  const { state, actions } = useEditor();
  const selection = useSelection();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [directions, setDirections] = useState(null);
  const listRef = useRef(null);

  const target = selection.length === 1 ? selection[0] : null;
  const empty = state.document.elements.length === 0;
  // The last thing asked for is the brief a set of alternative directions works
  // from, so the button only appears once there is something to reinterpret.
  const lastBrief = [...messages].reverse().find((m) => m.role === 'user')?.text || '';

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, directions]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setDirections(null);
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
          direction: res.direction || null,
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'apollo', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Three complete alternatives — different layout and type voice, not the same
   * design recoloured. Each is previewed live from its own operations, so what
   * you pick is exactly what lands on the canvas.
   */
  const explore = async () => {
    if (!lastBrief || busy) return;
    setBusy(true);
    setDirections(null);
    try {
      const res = await api.aiVariations({ message: lastBrief, document: state.document });
      setDirections(
        (res.directions || []).map((d) => ({ ...d, preview: applyOperations(state.document, d.operations).document }))
      );
    } catch (err) {
      setMessages((m) => [...m, { role: 'apollo', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const lastAppliedIndex = messages.reduce((last, m, i) => (m.applied > 0 ? i : last), -1);

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-line pl-3 pr-1">
        <Spark size={12} className="shrink-0 text-accent" />
        <h2 className="flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">Apollo</h2>
        {onShowLayers && (
          <Tooltip label="Show layers" hint="F7" side="bottom">
            <IconButton size="sm" onClick={onShowLayers} aria-label="Show layers">
              <Layers size={13} />
            </IconButton>
          </Tooltip>
        )}
        <IconButton size="sm" onClick={onClose} aria-label="Close Apollo">
          <X size={13} />
        </IconButton>
      </header>

      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="label shrink-0">Context</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-2">
          {target ? `${target.type} · ${layerLabel(target).slice(0, 28)}` : selection.length > 1 ? `${selection.length} layers` : 'Whole design'}
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
              {m.direction && <DirectionNote direction={m.direction} />}
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

        {directions?.length > 0 && (
          <div className="animate-fade-in space-y-2">
            <p className="label">Three directions</p>
            <div className="space-y-2">
              {directions.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    actions.apply(d.operations);
                    setDirections(null);
                    setMessages((m) => [...m, { role: 'apollo', text: d.message, applied: d.operations.length }]);
                  }}
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

      {!busy && (
        <div className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2.5">
          {lastBrief && !directions && (
            <button
              onClick={explore}
              className="flex items-center gap-1.5 rounded border border-line bg-raised px-2 py-1 text-xs text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              <Columns3 size={11} /> Three directions
            </button>
          )}
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
        <p className="text-2xs leading-relaxed text-ink-3">Review: {direction.fixed.length} refinement{direction.fixed.length === 1 ? '' : 's'} applied</p>
      )}
      {direction.outstanding?.length > 0 && (
        <p className="text-2xs leading-relaxed text-ink-3">Worth a look: {direction.outstanding[0]}</p>
      )}
    </div>
  );
}

/** Prompts that fit what is selected — and that Apollo can actually act on. */
function suggestionsFor(target, empty) {
  if (empty) return ['Instagram post for a gym New Year offer', 'Poster for a jazz night'];
  if (!target) return ['Make the headline bigger', 'Try a different layout'];
  if (target.type === 'text') return ['Make this bigger', 'Make it bolder and more premium'];
  if (target.type === 'button') return ['Change the colour to blue', 'Make it bigger'];
  if (target.type === 'image') return ['Replace this photo', 'Move it right'];
  return ['Make it bigger', 'Change the colour to gold'];
}
