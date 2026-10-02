import { cx } from '../../lib/cx.js';
import { formatTime } from '../../lib/time.js';

const LABELS = { not_started: 'Not started', processing: 'Processing', complete: 'Complete', failed: 'Failed' };

function Dot({ status }) {
  return (
    <span
      className={cx(
        'mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full',
        status === 'complete' && 'bg-accent',
        status === 'processing' && 'animate-pulse bg-ink',
        status === 'failed' && 'bg-danger',
        status === 'not_started' && 'bg-ink-3/50'
      )}
    />
  );
}

function Row({ label, status, detail }) {
  return (
    <li className="flex gap-3 py-2">
      <Dot status={status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-ink">{label}</span>
          <span className={cx('font-mono text-2xs uppercase tracking-[0.14em]', status === 'failed' ? 'text-danger' : 'text-ink-3')}>{LABELS[status]}</span>
        </div>
        {detail && <p className={cx('mt-0.5 text-xs leading-relaxed', status === 'failed' ? 'text-danger' : 'text-ink-3')}>{detail}</p>}
      </div>
    </li>
  );
}

/** Transcription, board tally, analysis and shorts, one line each. */
export default function StatusList({ session }) {
  const t = session.transcription;
  const tally = session.tally;
  const c = session.counts;

  const transcriptionDetail =
    t.status === 'processing'
      ? `${Math.round((t.progress || 0) * 100)}%`
      : t.status === 'failed'
        ? t.error
        : t.status === 'complete'
          ? [
              t.duration ? formatTime(t.duration) : null,
              t.words ? `${t.words.toLocaleString()} words` : null,
              t.model ? `${t.model} on ${t.device}` : null,
              t.cached ? 'from cache' : null,
            ]
              .filter(Boolean)
              .join(' - ')
          : null;

  const tallyDetail =
    tally.status === 'complete'
      ? `${tally.sectionsFound} of ${tally.sectionsTotal} board sections found in the video`
      : session.board
        ? 'Runs after transcription'
        : 'Link a board to tally it against the video';

  return (
    <ul className="divide-y divide-line">
      <Row label="Transcription" status={t.status} detail={transcriptionDetail} />
      <Row label="Board tally" status={tally.status} detail={tallyDetail} />
      <Row label="Analysis" status={session.analysis.status} detail="Finding shorts and retakes comes in the next step" />
      <li className="flex gap-3 py-2">
        <Dot status={c.candidates ? 'complete' : 'not_started'} />
        <div className="flex flex-1 items-baseline justify-between gap-3">
          <span className="text-[13px] text-ink">Shorts</span>
          <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">
            {c.candidates} candidates - {c.approved} approved - {c.rejected} rejected
          </span>
        </div>
      </li>
    </ul>
  );
}
