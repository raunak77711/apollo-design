import { useState } from 'react';
import { Calendar as CalendarIcon, Copy, Trash2 } from 'lucide-react';
import { distributionApi } from '../../api/distribution.js';
import { cx } from '../../lib/cx.js';
import { useToast } from '../../lib/toast.jsx';
import { Button, Spinner } from '../../ui/primitives.jsx';

const STAGE_COLOR = { tofu: 'bg-ink-3/15 text-ink-2', mofu: 'bg-accent/15 text-accent-text', bofu: 'bg-danger/15 text-danger' };
const PLATFORM_LABEL = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };

function Badge({ className, children }) {
  return <span className={cx('rounded px-1.5 py-0.5 font-mono text-2xs', className)}>{children}</span>;
}

/**
 * One asset in the pool: its classification (when it has any — a quick upload skips Content
 * Factory entirely, so it has no score, hook or classification), whether it's a duplicate of a
 * stronger one, and a place to schedule it. `onDelete`, if given, is for a quick upload only.
 */
export default function AssetCard({ asset, accounts, onScheduled, onDelete }) {
  const toast = useToast();
  const [schedulingFor, setSchedulingFor] = useState(''); // account id currently showing its datetime picker
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);

  const schedule = async (account) => {
    setBusy(true);
    try {
      const pub = await distributionApi.schedule({ assetId: asset.id, accountId: account.id, platform: account.platform, scheduledFor: when ? new Date(when).toISOString() : null });
      toast.success(pub.status === 'published' ? 'Published' : pub.status === 'native_scheduled' ? `${PLATFORM_LABEL[account.platform]} will publish it at the scheduled time` : 'Queued — Apollo will publish it when it is online at that time');
      setSchedulingFor('');
      setWhen('');
      onScheduled();
    } catch (e) {
      toast.error("Couldn't schedule that", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cx('rounded-xl border bg-surface p-3.5', asset.duplicateOf && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] text-ink">{asset.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {asset.score != null && <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-2xs text-void">{asset.score}</span>}
          {onDelete && (
            <button type="button" onClick={() => onDelete(asset)} aria-label="Remove this upload" className="text-ink-3 hover:text-danger">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {asset.hook && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{asset.hook}</p>}
      {asset.description && !asset.hook && <p className="mt-1 line-clamp-2 text-xs text-ink-3">{asset.description}</p>}

      {asset.classification && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge className={STAGE_COLOR[asset.classification.funnelStage] || 'bg-raised text-ink-3'}>{(asset.classification.funnelStage || '?').toUpperCase()}</Badge>
          <Badge className="bg-raised text-ink-2">{asset.classification.hookType?.replace(/-/g, ' ')}</Badge>
          <Badge className="bg-raised text-ink-2">{asset.classification.archetype?.replace(/-/g, ' ')}</Badge>
        </div>
      )}

      {asset.duplicateOf && (
        <p className="mt-2 flex items-center gap-1.5 text-2xs text-ink-3">
          <Copy size={11} /> Same idea as a stronger short — kept for visibility, not for scheduling
        </p>
      )}

      {!asset.duplicateOf && (
        <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          {accounts.length === 0 && <p className="text-2xs text-ink-3">Connect an account to schedule this.</p>}
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center gap-1.5">
              <span className="w-20 shrink-0 truncate text-2xs text-ink-3">{account.accountName}</span>
              {schedulingFor === account.id ? (
                <>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-7 flex-1 rounded border border-line bg-void px-1.5 text-2xs text-ink outline-none" />
                  <Button size="sm" variant="primary" onClick={() => schedule(account)} disabled={busy}>
                    {busy ? <Spinner size={11} /> : 'Go'}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => schedule(account)} disabled={busy}>
                    Publish now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSchedulingFor(account.id)} disabled={busy}>
                    <CalendarIcon size={11} /> Schedule
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
