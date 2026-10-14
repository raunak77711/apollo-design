import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { distributionApi } from '../../api/distribution.js';
import { useToast } from '../../lib/toast.jsx';
import { Button, Spinner } from '../../ui/primitives.jsx';
import AssetCard from './AssetCard.jsx';

/**
 * A video pushed straight to connected accounts, bypassing Content Factory and batches
 * entirely: no transcript, no review, no auto-captions - published exactly as uploaded.
 */
export default function QuickUpload({ accounts }) {
  const toast = useToast();
  const fileInput = useRef(null);
  const [assets, setAssets] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(null); // 0..1 while uploading, null otherwise

  const load = () => distributionApi.listUnassignedAssets().then(setAssets).catch(() => setAssets([]));
  useEffect(() => { load(); }, []);

  const pick = () => fileInput.current?.click();
  const upload = async (file) => {
    if (!file) return;
    setProgress(0);
    try {
      await distributionApi.uploadAsset(file, { title, description, onProgress: setProgress });
      toast.success('Uploaded — schedule it below whenever you like.');
      setTitle('');
      setDescription('');
      await load();
    } catch (e) {
      toast.error("Couldn't upload that", e.message);
    } finally {
      setProgress(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (asset) => {
    if (!window.confirm(`Remove "${asset.title}"? This deletes the uploaded file.`)) return;
    try {
      await distributionApi.deleteAsset(asset.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch (e) {
      toast.error("Couldn't remove that", e.message);
    }
  };

  return (
    <section>
      <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Quick upload</h2>
      <p className="mt-1.5 text-xs text-ink-3">Already have a finished video? Push it straight to a connected account — no transcript, review or auto-captions, published exactly as uploaded.</p>

      <div className="mt-3 rounded-xl border border-line bg-surface p-3.5">
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" disabled={progress != null} className="h-8 rounded-md border border-line bg-void px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-50" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Caption / description (optional)" disabled={progress != null} className="h-8 rounded-md border border-line bg-void px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-50" />
        </div>
        <input ref={fileInput} type="file" accept="video/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <div className="mt-2.5 flex items-center gap-3">
          <Button size="sm" variant="secondary" onClick={pick} disabled={progress != null}>
            {progress != null ? <Spinner size={13} /> : <Upload size={13} />} {progress != null ? `Uploading… ${Math.round(progress * 100)}%` : 'Choose a video'}
          </Button>
          {progress != null && (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {assets === null && <div className="mt-3"><Spinner size={14} /></div>}
      {assets?.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => <AssetCard key={a.id} asset={a} accounts={accounts} onScheduled={load} onDelete={remove} />)}
        </ul>
      )}
    </section>
  );
}
