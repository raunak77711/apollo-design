import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { cx } from '../../../lib/cx.js';
import { Button, IconButton, Spinner } from '../../../ui/primitives.jsx';

/**
 * The command bar. Plain English in, edits out — no regenerating, and the whole
 * instruction undoes with one Ctrl+Z. Opens with `/` or Ctrl/Cmd+K; Escape closes it.
 */
export default function DirectBar({ open, ready, onClose, onRun }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setReply('');
    setError('');
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await onRun(message);
      setReply(result.message);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute bottom-6 left-1/2 z-20 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2">
      <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-pop">
        <Sparkles size={16} className="ml-2 shrink-0 text-accent-text" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            }
          }}
          disabled={!ready || busy}
          maxLength={600}
          aria-label="Direct mode instruction"
          placeholder={ready ? 'Tell Apollo what to change — e.g. make “$5 CLICK” huge and put the graph under it' : 'Direct mode needs a DeepSeek key'}
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
        />
        {busy ? <Spinner size={14} className="mr-2" /> : <Button type="submit" variant="primary" size="sm" disabled={!ready || !text.trim()}>Do it</Button>}
        <IconButton aria-label="Close Direct mode" onClick={onClose}><X size={14} /></IconButton>
      </form>
      {(reply || error) && (
        <p className={cx('mt-2 rounded-lg border bg-surface px-3 py-2 text-[13px]', error ? 'border-danger/40 text-danger' : 'border-line text-ink-2')}>
          {error || reply}
          {!error && <span className="ml-2 text-ink-3">Ctrl+Z undoes it.</span>}
        </p>
      )}
    </div>
  );
}
