import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { contentApi } from '../api/content.js';
import { distributionApi } from '../api/distribution.js';
import { useToast } from '../lib/toast.jsx';
import { Button, Spinner } from '../ui/primitives.jsx';
import AppHeader from '../components/AppHeader.jsx';
import AccountsPanel from '../components/distribution/AccountsPanel.jsx';
import AssetCard from '../components/distribution/AssetCard.jsx';
import Calendar from '../components/distribution/Calendar.jsx';
import LearningReport from '../components/distribution/LearningReport.jsx';
import QuickUpload from '../components/distribution/QuickUpload.jsx';

/** Distribution: batches of recordings, the deduplicated asset pool, connected platform accounts, the calendar and performance. */
export default function DistributionPage() {
  const { id } = useParams();
  return (
    <div className="min-h-screen bg-void text-ink">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-10 sm:px-8">{id ? <BatchView key={id} id={id} /> : <BatchList />}</main>
    </div>
  );
}

/* --------------------------------- batch list -------------------------------- */

function BatchList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [batches, setBatches] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState('');
  const [chosen, setChosen] = useState(new Set());
  const [status, setStatus] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const refresh = useCallback(() => distributionApi.listBatches().then(setBatches).catch(() => setBatches([])), []);
  const loadAccounts = useCallback(() => {
    distributionApi.status().then((r) => setStatus(r.platforms)).catch(() => {});
    distributionApi.listAccounts().then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => { refresh(); loadAccounts(); contentApi.list().then(setSessions).catch(() => {}); }, [refresh, loadAccounts]);

  const create = async () => {
    if (!chosen.size) return;
    try {
      const batch = await distributionApi.createBatch(title || `Batch — ${new Date().toLocaleDateString()}`, [...chosen]);
      navigate(`/distribution/${batch.id}`);
    } catch (e) {
      toast.error("Couldn't create the batch", e.message);
    }
  };

  return (
    <>
      <h1 className="font-display text-3xl tracking-tight">Distribution</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-2">
        Group a round of recordings into a batch: deduplicate the shorts across all of them, classify what each one is, and schedule and publish the keepers.
      </p>

      <div className="mt-8">
        <AccountsPanel status={status} accounts={accounts} onChanged={loadAccounts} />
      </div>

      <div className="mt-10">
        <QuickUpload accounts={accounts} />
      </div>

      <h2 className="mt-10 font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Batches</h2>
      {!picking ? (
        <Button variant="primary" size="lg" className="mt-6" onClick={() => setPicking(true)}>
          <Plus size={15} /> New batch
        </Button>
      ) : (
        <div className="mt-6 max-w-lg rounded-xl border border-line bg-surface p-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Batch title" className="w-full rounded-md border border-line bg-void px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3" />
          <p className="mt-3 font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">Recordings to include</p>
          <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto">
            {sessions.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] text-ink-2 hover:bg-raised">
                  <input type="checkbox" checked={chosen.has(s.id)} onChange={(e) => setChosen((prev) => { const next = new Set(prev); e.target.checked ? next.add(s.id) : next.delete(s.id); return next; })} />
                  {s.title}
                </label>
              </li>
            ))}
            {sessions.length === 0 && <li className="text-xs text-ink-3">No Content Factory recordings yet.</li>}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={create} disabled={!chosen.size}>Create batch</Button>
            <Button variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {batches === null && <div className="mt-12"><Spinner /></div>}
      {batches?.length > 0 && (
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((b) => (
            <li key={b.id} className="rounded-xl border border-line bg-surface p-4">
              <button type="button" onClick={() => navigate(`/distribution/${b.id}`)} className="block w-full text-left">
                <p className="truncate font-display text-lg text-ink">{b.title}</p>
                <p className="mt-1 text-xs text-ink-3">{b.sessionIds.length} recording{b.sessionIds.length === 1 ? '' : 's'}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* --------------------------------- batch view --------------------------------- */

function BatchView({ id }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [batch, setBatch] = useState(null);
  const [assets, setAssets] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const [b, a] = await Promise.all([distributionApi.getBatch(id), distributionApi.listAssets(id)]);
    setBatch(b);
    setAssets(a);
  }, [id]);
  useEffect(() => { load().catch(() => {}); distributionApi.listAccounts().then(setAccounts).catch(() => {}); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const { created } = await distributionApi.syncBatch(id);
      toast.success(created ? `${created} new short${created === 1 ? '' : 's'} added` : 'Nothing new to add');
      await load();
    } catch (e) {
      toast.error("Couldn't sync", e.message);
    } finally {
      setSyncing(false);
    }
  };

  if (!batch || !assets) return <Spinner />;
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const assetsById = Object.fromEntries(assets.map((a) => [a.id, a]));

  return (
    <>
      <button type="button" onClick={() => navigate('/distribution')} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> All batches
      </button>
      <h1 className="mt-6 font-display text-3xl tracking-tight">{batch.title}</h1>
      <p className="mt-1 text-xs text-ink-3">{batch.sessionIds.length} recordings — {batch.counts.unique} unique shorts ready ({batch.counts.assets - batch.counts.unique} duplicates folded in)</p>

      <div className="mt-4">
        <Button variant="primary" onClick={sync} disabled={syncing}>
          {syncing ? <Spinner size={14} /> : <RefreshCw size={14} />}
          Sync new shorts
        </Button>
      </div>

      <div className="mt-10">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Shorts ({assets.length})</h2>
        {assets.length === 0 && <p className="mt-3 text-sm text-ink-3">Approve and render shorts in Content Factory, then sync this batch. No connected accounts yet? Connect them from the main Distribution page.</p>}
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} accounts={accounts} onScheduled={load} />
          ))}
        </ul>
      </div>

      <div className="mt-10">
        <Calendar batchId={id} assetsById={assetsById} accountsById={accountsById} />
      </div>

      <div className="mt-10">
        <LearningReport batchId={id} />
      </div>
    </>
  );
}
