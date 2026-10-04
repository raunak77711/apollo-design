import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { distributionApi } from '../../api/distribution.js';
import { cx } from '../../lib/cx.js';
import { useToast } from '../../lib/toast.jsx';

const STATUS_STYLE = {
  draft: 'text-ink-3', queued_local: 'text-ink-2', native_scheduled: 'text-accent-text', publishing: 'text-ink-2',
  published: 'text-accent-text', needs_review: 'text-danger', failed: 'text-danger', cancelled: 'text-ink-3',
};
const STATUS_LABEL = {
  draft: 'Draft', queued_local: 'Queued (local)', native_scheduled: 'Scheduled on platform', publishing: 'Publishing…',
  published: 'Published', needs_review: 'Needs review', failed: 'Failed', cancelled: 'Cancelled',
};

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled');

/** The calendar: every publish attempt for this batch, what will happen and when, and where a human needs to step in. */
export default function Calendar({ batchId, assetsById, accountsById }) {
  const toast = useToast();
  const [pubs, setPubs] = useState(null);

  const load = () => distributionApi.listPublications({ batchId }).then((list) => setPubs([...list].sort((a, b) => new Date(a.scheduledFor || a.createdAt) - new Date(b.scheduledFor || b.createdAt))));
  useEffect(() => { load(); }, [batchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, id, verb) => {
    try {
      await fn(id);
      load();
    } catch (e) {
      toast.error(`Couldn't ${verb} that`, e.message);
    }
  };

  if (!pubs) return null;

  return (
    <section>
      <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Calendar</h2>
      {pubs.length === 0 && <p className="mt-3 text-sm text-ink-3">Nothing scheduled yet.</p>}
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
        {pubs.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="w-32 shrink-0 font-mono text-2xs text-ink-3">{when(p.scheduledFor)}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{assetsById[p.assetId]?.title || p.assetId}</span>
            <span className="w-20 shrink-0 truncate text-2xs text-ink-3">{accountsById[p.accountId]?.accountName || p.platform}</span>
            <span className={cx('w-32 shrink-0 font-mono text-2xs', STATUS_STYLE[p.status])} title={p.lastError}>{STATUS_LABEL[p.status]}</span>
            {p.publicUrl && <a href={p.publicUrl} target="_blank" rel="noreferrer" className="shrink-0 text-2xs text-ink-2 underline hover:text-ink">view</a>}
            {['draft', 'queued_local'].includes(p.status) && (
              <button type="button" onClick={() => act((id) => distributionApi.cancelPublication(id), p.id, 'cancel')} className="shrink-0 text-ink-3 hover:text-danger" aria-label="Cancel">
                <X size={13} />
              </button>
            )}
            {['failed', 'needs_review'].includes(p.status) && (
              <button type="button" onClick={() => act((id) => distributionApi.retryPublication(id), p.id, 'retry')} className="shrink-0 text-ink-3 hover:text-ink" aria-label="Retry">
                <RefreshCw size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
