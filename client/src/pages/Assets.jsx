import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Link2, Search, Sparkles, Upload } from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { useToast } from '../lib/toast.jsx';
import { useCreateDesign } from '../lib/useCreateDesign.js';
import { createEmptyDocument, makeElement } from '../design/schema.js';
import { Button, EmptyState, Spinner } from '../ui/primitives.jsx';
import { Segmented } from '../ui/fields.jsx';
import AppHeader from '../components/AppHeader.jsx';

export default function Assets() {
  const toast = useToast();
  const { create } = useCreateDesign();
  const [tab, setTab] = useState('uploads');

  const [uploads, setUploads] = useState([]);
  const [uploadState, setUploadState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const [query, setQuery] = useState('');
  const [stock, setStock] = useState([]);
  const [stockState, setStockState] = useState('idle');

  useEffect(() => {
    (async () => {
      try {
        setUploads(await api.listAssets());
        setUploadState('ready');
      } catch {
        setUploadState('error');
      }
    })();
  }, []);

  const upload = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setBusy(true);
    try {
      const created = [];
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        created.push(await api.uploadAsset(form));
      }
      setUploads((current) => [...created.reverse(), ...current]);
      setUploadState('ready');
      toast.success(created.length === 1 ? 'Image uploaded' : `${created.length} images uploaded`);
    } catch (err) {
      toast.error('Upload failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setStockState('loading');
    try {
      const res = await api.searchImages(query.trim());
      setStock(res.results || []);
      setStockState('ready');
    } catch (err) {
      setStockState('error');
      toast.error('Photo search failed', err.message);
    }
  };

  const startDesign = (src, alt) => {
    const doc = createEmptyDocument({ width: 1080, height: 1080, background: '#0A0A0B' });
    doc.elements = [makeElement('image', { x: 0, y: 0, width: 1080, height: 1080, zIndex: 1, src, alt: alt || '' })];
    create({ name: alt ? `Design · ${alt.slice(0, 32)}` : 'Design from image', document: doc });
  };

  const copyLink = async (src) => {
    const url = src.startsWith('http') ? src : `${window.location.origin}${src}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 sm:px-8">
        <header className="pt-12 sm:pt-16">
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.035em] sm:text-[38px]">Assets</h1>
          <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-2">
            Your uploads and the stock library, in one place. Everything here can be dropped straight onto a canvas.
          </p>
        </header>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'uploads', label: 'Uploads' },
              { value: 'stock', label: 'Stock photos' },
            ]}
          />
          <div className="flex-1" />
          {tab === 'uploads' ? (
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Spinner /> : <Upload size={14} />} Upload
            </Button>
          ) : (
            <div className="relative w-full sm:w-72">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="Search photos — “dark gym”, “pasta”…"
                className="field pl-8"
              />
            </div>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />

        {tab === 'uploads' && (
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              upload(e.dataTransfer.files);
            }}
            className={cx(
              'mt-6 rounded-xl border border-dashed transition-colors duration-150',
              dragging ? 'border-accent bg-accent/5' : 'border-line'
            )}
          >
            {uploadState === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-3">
                <Spinner /> Loading your uploads…
              </div>
            )}

            {uploadState === 'error' && (
              <EmptyState icon={ImageIcon} title="Uploads unavailable" body="Apollo couldn’t reach the server. Start the backend and reload." />
            )}

            {uploadState === 'ready' && uploads.length === 0 && (
              <EmptyState
                icon={Upload}
                title="Drop images here"
                body="PNG, JPG or WebP up to 10 MB. Uploads are re-encoded and kept alongside your designs."
                action={
                  <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                    Choose files
                  </Button>
                }
              />
            )}

            {uploadState === 'ready' && uploads.length > 0 && (
              <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4 lg:grid-cols-6">
                {uploads.map((asset) => (
                  <AssetTile
                    key={asset.id}
                    src={asset.url}
                    label={asset.metadata?.width ? `${asset.metadata.width}×${asset.metadata.height}` : 'Image'}
                    onUse={() => startDesign(asset.url, asset.filename)}
                    onCopy={() => copyLink(asset.url)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'stock' && (
          <section className="mt-6">
            {stockState === 'idle' && (
              <EmptyState
                icon={Search}
                title="Search the photo library"
                body="Describe the shot you need — Apollo pulls from the stock provider configured on the server."
              />
            )}
            {stockState === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-ink-3">
                <Spinner /> Searching…
              </div>
            )}
            {stockState === 'ready' && stock.length === 0 && (
              <EmptyState icon={Search} title="No photos found" body="Try a broader description." />
            )}
            {stockState === 'ready' && stock.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {stock.map((photo) => (
                  <AssetTile
                    key={photo.id}
                    src={photo.thumbnail}
                    label={photo.photographer || 'Stock'}
                    onUse={() => startDesign(photo.url, photo.photographer)}
                    onCopy={() => copyLink(photo.url)}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function AssetTile({ src, label, onUse, onCopy }) {
  return (
    <figure className="group relative overflow-hidden rounded-lg border border-line bg-workspace">
      <img src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
      <figcaption className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/10 to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            onClick={onUse}
            className="flex h-7 flex-1 items-center justify-center gap-1.5 rounded bg-white/95 px-2 text-xs font-medium text-black transition-colors hover:bg-white"
          >
            <Sparkles size={12} /> New design
          </button>
          <button
            onClick={onCopy}
            aria-label="Copy link"
            className="flex h-7 w-7 items-center justify-center rounded bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/35"
          >
            <Link2 size={12} />
          </button>
        </div>
        <span className="num mt-1.5 truncate text-2xs text-white/70">{label}</span>
      </figcaption>
    </figure>
  );
}
