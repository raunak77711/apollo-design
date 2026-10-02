import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { contentApi } from '../../api/content.js';
import { cx } from '../../lib/cx.js';
import { formatTime } from '../../lib/time.js';
import { Spinner } from '../../ui/primitives.jsx';

/** The transcript with timestamps, collapsed until asked for. Click a line to jump the video there. */
export default function TranscriptPanel({ sessionId, ready, onSeek }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
  }, [sessionId, ready]);

  useEffect(() => {
    if (!open || data || !ready) return undefined;
    let cancelled = false;
    contentApi
      .transcript(sessionId)
      .then((t) => !cancelled && setData(t))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, data, ready, sessionId]);

  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.2em] text-ink-3 hover:text-ink-2">
        <ChevronRight size={12} className={cx('transition-transform', open && 'rotate-90')} />
        Transcript
      </button>
      {open && (
        <div className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-line bg-surface p-3">
          {!ready && <p className="text-sm text-ink-3">Process the video to see the transcript.</p>}
          {ready && !data && !error && <Spinner />}
          {error && <p className="text-sm text-danger">{error}</p>}
          {data && (
            <ol className="space-y-1.5">
              {data.segments.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onSeek(s.start)} className="flex w-full gap-3 rounded px-1.5 py-1 text-left hover:bg-raised">
                    <span className="w-12 shrink-0 pt-0.5 font-mono text-2xs text-ink-3">{formatTime(s.start)}</span>
                    <span className="text-[13px] leading-relaxed text-ink-2">{s.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
