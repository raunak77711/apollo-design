import { useState } from 'react';
import { Search, Upload, Loader2 } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';
import { api } from '../api/client.js';
import { defaultPropertiesFor } from '../design/schema.js';

export default function ImagesPanel({ projectId }) {
  const { state, actions } = useEditor();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.searchImages(query.trim());
      setResults(res.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const placeImage = (src, alt) => {
    const selected = state.document.elements.find((e) => e.id === state.selectedElementId);
    if (selected?.type === 'image') {
      actions.apply([{ type: 'UPDATE_ELEMENT', targetId: selected.id, changes: { src, alt } }]);
      return;
    }
    const w = 480;
    const h = 320;
    actions.apply([
      {
        type: 'CREATE_ELEMENT',
        element: {
          type: 'image',
          x: Math.round(state.document.canvas.width / 2 - w / 2),
          y: Math.round(state.document.canvas.height / 2 - h / 2),
          width: w, height: h,
          properties: { ...defaultPropertiesFor('image'), src, alt },
        },
      },
    ]);
  };

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (projectId) form.append('projectId', projectId);
      const asset = await api.uploadAsset(form);
      placeImage(asset.url, file.name);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="p-3 h-full flex flex-col">
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2 top-2.5 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search stock photos…"
            className="input mt-0 pl-7"
          />
        </div>
        <label className="px-3 rounded bg-panel2 border border-edge hover:bg-edge cursor-pointer flex items-center gap-1 text-sm text-neutral-300">
          <Upload size={14} /> Upload
          <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
        </label>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <div className="flex-1 overflow-y-auto thin-scroll">
        {busy && <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={14} className="animate-spin" /> Loading…</div>}
        {!busy && results.length === 0 && (
          <p className="text-xs text-neutral-500">Search for photos, or upload your own. Select an image layer first to replace it; otherwise a new image is added.</p>
        )}
        <div className="grid grid-cols-4 gap-2">
          {results.map((r) => (
            <button key={r.id} onClick={() => placeImage(r.url, r.photographer)} title={`Photo by ${r.photographer}`}
              className="aspect-square overflow-hidden rounded border border-edge hover:border-accent">
              <img src={r.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
