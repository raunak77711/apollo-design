import { useEffect, useState } from 'react';
import { Check, ChevronRight, Film, Play, Scissors, X } from 'lucide-react';
import { contentApi } from '../../api/content.js';
import { cx } from '../../lib/cx.js';
import { formatTime } from '../../lib/time.js';
import { Button, Spinner } from '../../ui/primitives.jsx';

/**
 * The shorts Apollo found in the recording, and the restarts it cut to get them.
 *
 * Each card shows the editorial case (hook, why, scores), the edit it decided on (a bar of what is kept and
 * what is cut, with the cut words struck through so nothing is removed unseen), and which board visuals
 * were on screen while it was said. Review actions (approve, reject, edit) arrive in the next milestone;
 * every time here is a link that jumps the video.
 */

const CUT_LABELS = {
  restart_marker: 'restart announcement',
  abandoned_take: 'abandoned take',
  repeated_take: 'repeated take',
  false_start: 'false start',
  stutter: 'stutter',
  filler_burst: 'fillers',
  dead_air: 'dead air',
  aside: 'aside',
  cut: 'cut',
};

const SCORE_LABELS = [
  ['hook', 'Hook'],
  ['clarity', 'Clarity'],
  ['value', 'Value'],
  ['audienceRelevance', 'Fit'],
];

function SeekChip({ at, children, onSeek }) {
  return (
    <button type="button" onClick={() => onSeek(at)} className="rounded border border-line px-1.5 py-0.5 font-mono text-2xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink">
      {children}
    </button>
  );
}

/** What the edit does, to scale: solid where speech is kept, hatched where it is cut. */
function EditBar({ segments, onSeek }) {
  const start = segments[0].start;
  const span = Math.max(0.1, segments[segments.length - 1].end - start);
  return (
    <div className="flex h-5 overflow-hidden rounded border border-line bg-raised" role="img" aria-label="Kept and cut parts of this short">
      {segments.map((s) => (
        <button
          key={s.from}
          type="button"
          onClick={() => onSeek(s.start)}
          title={`${s.action === 'keep' ? 'Kept' : `Cut: ${CUT_LABELS[s.reason] || s.reason}`} ${formatTime(s.start)}-${formatTime(s.end)}`}
          className={cx('h-full transition-opacity hover:opacity-80', s.action === 'keep' ? 'bg-ink/80' : 'opacity-70')}
          style={{
            width: `${((s.end - s.start) / span) * 100}%`,
            ...(s.action === 'discard' ? { backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--c-line-strong)) 0 2px, transparent 2px 5px)' } : {}),
          }}
        />
      ))}
    </div>
  );
}

function ShortCard({ c, onSeek, onReview, onQuick }) {
  const [open, setOpen] = useState(false);
  const cuts = c.discarded || [];
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg leading-snug text-ink">{c.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            <SeekChip at={c.sourceStart} onSeek={onSeek}>
              {formatTime(c.sourceStart)}-{formatTime(c.sourceEnd)}
            </SeekChip>
            <span>{Math.round(c.keptDuration)}s</span>
            <span>-</span>
            <span>{c.topic.replace(/-/g, ' ')}</span>
            {c.stale && <span className="text-danger">no longer found</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md bg-ink px-2 py-1 font-mono text-xs text-void" title="Overall score">{c.score}</span>
          <Button size="sm" variant="secondary" onClick={() => onSeek(c.sourceStart)}>
            <Play size={12} /> Play
          </Button>
        </div>
      </div>

      <p className="mt-3 text-[14px] leading-relaxed text-ink">"{c.hook}"</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{c.reason}</p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {SCORE_LABELS.map(([key, label]) => (
          <div key={key}>
            <div className="flex items-baseline justify-between font-mono text-2xs uppercase tracking-[0.12em] text-ink-3">
              <span>{label}</span>
              <span className="text-ink-2">{c.scores[key]}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-ink/70" style={{ width: `${c.scores[key] * 10}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <EditBar segments={c.sourceSegments} onSeek={onSeek} />
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
          <Scissors size={11} />
          {cuts.length ? `${cuts.length} cut${cuts.length > 1 ? 's' : ''}: ${[...new Set(cuts.map((d) => CUT_LABELS[d.reason] || d.reason))].join(', ')}` : 'Plays straight through, no cuts'}
        </p>
      </div>

      {c.boardMatches?.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">Board</span>
          {c.boardMatches.slice(0, 5).map((m) => (
            <SeekChip key={m.blockId} at={m.at} onSeek={onSeek}>
              {m.blockId} {m.type}
            </SeekChip>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" variant="primary" onClick={() => onReview(c.id)}>
          <Film size={13} /> Review edited short
        </Button>
        <Button size="sm" variant={c.status === 'approved' ? 'accent' : 'secondary'} onClick={() => onQuick(c, c.status === 'approved' ? 'pending' : 'approved')}>
          <Check size={13} /> {c.status === 'approved' ? 'Approved' : 'Approve'}
        </Button>
        <Button size="sm" variant={c.status === 'rejected' ? 'danger' : 'ghost'} onClick={() => onQuick(c, c.status === 'rejected' ? 'pending' : 'rejected')}>
          <X size={13} /> {c.status === 'rejected' ? 'Rejected' : 'Reject'}
        </Button>
        {c.render?.status === 'done' && <span className="ml-auto text-xs text-ink-3">Video ready</span>}
        {(c.render?.status === 'rendering' || c.render?.status === 'queued') && <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-3"><Spinner size={11} /> {Math.round((c.render.progress || 0) * 100)}%</span>}
        {c.render?.status === 'failed' && <span className="ml-auto text-xs text-danger">Render failed</span>}
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.16em] text-ink-3 hover:text-ink-2">
        <ChevronRight size={11} className={cx('transition-transform', open && 'rotate-90')} />
        What was said
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-raised p-3 text-[13px] leading-relaxed">
          {c.sourceSegments.map((s) => {
            return (
              <p key={s.from} className={cx(s.action === 'keep' ? 'text-ink' : 'text-ink-3 line-through decoration-ink-3/60')}>
                <button type="button" onClick={() => onSeek(s.start)} className="mr-2 font-mono text-2xs text-ink-3 no-underline hover:text-ink">
                  {formatTime(s.start)}
                </button>
                {s.text}
              </p>
            );
          })}
        </div>
      )}
    </li>
  );
}

function Retakes({ sessionId, onSeek }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!open || data) return undefined;
    let cancelled = false;
    contentApi.analysis(sessionId).then((a) => !cancelled && setData(a)).catch(() => !cancelled && setData({ retakes: [] }));
    return () => { cancelled = true; };
  }, [open, data, sessionId]);

  return (
    <div className="mt-6">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.2em] text-ink-3 hover:text-ink-2">
        <ChevronRight size={12} className={cx('transition-transform', open && 'rotate-90')} />
        Restarts detected
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          {!data && <Spinner />}
          {data && data.retakes.length === 0 && <p className="text-sm text-ink-3">No restarts were detected in this recording.</p>}
          {data?.retakes.length > 0 && (
            <ul className="space-y-1.5">
              {data.retakes.map((r) => (
                <li key={r.start} className="flex items-start gap-3 text-[13px]">
                  <SeekChip at={r.start} onSeek={onSeek}>{formatTime(r.start)}</SeekChip>
                  <span className="min-w-0 flex-1 text-ink-3 line-through decoration-ink-3/50">{r.text}</span>
                  <span className="shrink-0 font-mono text-2xs uppercase tracking-[0.12em] text-ink-3">{r.types.map((t) => CUT_LABELS[t === 'repeated_opening' ? 'false_start' : t] || t).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function ShortsPanel({ session, onSeek, onAnalyze, onReview, onQuick, onRenderApproved }) {
  const a = session.analysis;
  const list = [...(session.candidates || [])].sort((x, y) => y.score - x.score || x.sourceStart - y.sourceStart);
  const working = a.status === 'processing';

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Shorts</h2>
        <div className="flex items-center gap-3">
          {session.counts.approved > 0 && (
            <Button variant="primary" size="sm" onClick={onRenderApproved}>
              <Film size={13} /> Render {session.counts.approved} approved
            </Button>
          )}
          {a.status === 'complete' && (
            <button
              type="button"
              onClick={() => window.confirm('Look for shorts again? Unchanged parts are answered from saved results and cost nothing.') && onAnalyze(true)}
              className="text-xs text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
            >
              Find shorts again
            </button>
          )}
          {(a.status === 'failed' || (a.status === 'not_started' && !a.reason)) && (
            <Button variant="secondary" size="sm" onClick={() => onAnalyze(false)}>Find shorts</Button>
          )}
        </div>
      </div>

      {working && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">
          <Spinner size={13} /> Looking for shorts and retakes... {Math.round((a.progress || 0) * 100)}%
        </p>
      )}
      {a.status === 'failed' && <p className="mt-4 text-sm text-danger">{a.error}</p>}
      {a.status === 'not_started' && a.reason && <p className="mt-4 text-sm text-ink-3">{a.reason}</p>}
      {a.status === 'complete' && list.length === 0 && <p className="mt-4 text-sm text-ink-3">No short in this recording met the bar. The cleanest ideas still need a hook and a payoff.</p>}
      {a.warnings?.length > 0 && <p className="mt-3 text-xs text-ink-3">{a.warnings.join(' ')}</p>}

      {list.length > 0 && (
        <ul className="mt-4 grid gap-4 lg:grid-cols-2">
          {list.map((c) => (
            <ShortCard key={c.id} c={c} onSeek={onSeek} onReview={onReview} onQuick={onQuick} />
          ))}
        </ul>
      )}
      {a.status === 'complete' && <Retakes sessionId={session.id} onSeek={onSeek} />}
    </section>
  );
}
