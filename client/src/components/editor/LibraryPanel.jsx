import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Search, Upload, X } from 'lucide-react';
import { api } from '../../api/client.js';
import { cx } from '../../lib/cx.js';
import { useToast } from '../../lib/toast.jsx';
import { useEditor } from '../../state/EditorContext.jsx';
import { defaultPropertiesFor } from '../../design/schema.js';
import { inkFor } from '../../design/color.js';
import { ICON_LIBRARIES, getIcon, iconNames } from '../../design/icons.js';
import { EmptyState, IconButton, Spinner } from '../../ui/primitives.jsx';
import { Segmented } from '../../ui/fields.jsx';

/**
 * Left flyout for everything you drop onto the canvas. With an image layer
 * selected, picking a photo replaces it in place — otherwise a new layer lands
 * in the middle of the canvas.
 */
export default function LibraryPanel({ projectId, onClose }) {
  const toast = useToast();
  const { state, actions } = useEditor();
  const [tab, setTab] = useState('photos');

  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoState, setPhotoState] = useState('idle');

  const [iconLibrary, setIconLibrary] = useState('lucide');
  const [iconQuery, setIconQuery] = useState('');

  const [uploads, setUploads] = useState([]);
  const [uploadState, setUploadState] = useState('loading');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const canvas = state.document.canvas;
  const selected = state.document.elements.find((el) => state.selectedIds.includes(el.id) && el.type === 'image');

  useEffect(() => {
    if (tab !== 'uploads' || uploadState !== 'loading') return;
    (async () => {
      try {
        setUploads(await api.listAssets());
        setUploadState('ready');
      } catch {
        setUploadState('error');
      }
    })();
  }, [tab, uploadState]);

  const search = async () => {
    if (!query.trim()) return;
    setPhotoState('loading');
    try {
      const res = await api.searchImages(query.trim());
      setPhotos(res.results || []);
      setPhotoState('ready');
    } catch (err) {
      setPhotoState('idle');
      toast.error('Photo search failed', err.message);
    }
  };

  const placeImage = (src, alt) => {
    if (selected) {
      actions.apply([{ type: 'UPDATE_ELEMENT', targetId: selected.id, changes: { src, alt } }]);
      return;
    }
    const width = Math.round(Math.min(canvas.width * 0.6, 720));
    const height = Math.round(width * 0.66);
    const id = `image-${Date.now().toString(36)}`;
    actions.apply(
      [
        {
          type: 'CREATE_ELEMENT',
          element: {
            id,
            type: 'image',
            x: Math.round(canvas.width / 2 - width / 2),
            y: Math.round(canvas.height / 2 - height / 2),
            width,
            height,
            properties: { ...defaultPropertiesFor('image'), src, alt },
          },
        },
      ],
      { selectIds: [id] }
    );
  };

  const placeIcon = (name, library) => {
    const id = `icon-${Date.now().toString(36)}`;
    const size = Math.round(Math.min(canvas.width, canvas.height) * 0.12);
    actions.apply(
      [
        {
          type: 'CREATE_ELEMENT',
          element: {
            id,
            type: 'icon',
            x: Math.round(canvas.width / 2 - size / 2),
            y: Math.round(canvas.height / 2 - size / 2),
            width: size,
            height: size,
            properties: { ...defaultPropertiesFor('icon'), name, library, size, color: inkFor(canvas.background) },
          },
        },
      ],
      { selectIds: [id] }
    );
  };

  const upload = async (files) => {
    const list = [...(files || [])].filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setUploading(true);
    try {
      const created = [];
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        if (projectId) form.append('projectId', projectId);
        created.push(await api.uploadAsset(form));
      }
      setUploads((current) => [...created.reverse(), ...current]);
      setUploadState('ready');
      placeImage(created[0].url, created[0].filename);
    } catch (err) {
      toast.error('Upload failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <h2 className="flex-1 text-[13px] font-medium text-ink">Library</h2>
        <IconButton onClick={onClose} aria-label="Close library">
          <X size={14} />
        </IconButton>
      </header>

      <div className="border-b border-line p-2.5">
        <Segmented
          size="sm"
          className="w-full"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'photos', label: 'Photos' },
            { value: 'uploads', label: 'Uploads' },
            { value: 'icons', label: 'Icons' },
          ]}
        />
        {selected && (
          <p className="mt-2 text-2xs leading-relaxed text-ink-3">
            Replacing the selected image layer.
          </p>
        )}
      </div>

      {tab === 'photos' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative p-2.5">
            <Search size={13} className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search photos"
              className="field pl-7"
            />
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
            {photoState === 'idle' && photos.length === 0 && (
              <EmptyState icon={Search} title="Find a photo" body="Try “dark gym”, “pasta”, or “city at night”." />
            )}
            {photoState === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-ink-3">
                <Spinner /> Searching…
              </div>
            )}
            {photoState === 'ready' && photos.length === 0 && (
              <EmptyState icon={Search} title="Nothing found" body="Try a broader description." />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => placeImage(photo.url, photo.photographer)}
                  title={photo.photographer ? `Photo by ${photo.photographer}` : 'Stock photo'}
                  className="overflow-hidden rounded border border-line transition-all duration-150 hover:border-accent"
                >
                  <img src={photo.thumbnail} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'uploads' && (
        <div
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
        >
          <div className="p-2.5">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded border border-dashed border-line text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {uploading ? <Spinner /> : <Upload size={13} />} Upload image
            </button>
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
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2.5 pb-2.5">
            {uploadState === 'loading' && (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-ink-3">
                <Spinner /> Loading…
              </div>
            )}
            {uploadState === 'ready' && uploads.length === 0 && (
              <EmptyState icon={ImageIcon} title="No uploads yet" body="Drop an image here to use it in this design." />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {uploads.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => placeImage(asset.url, asset.filename)}
                  className="overflow-hidden rounded border border-line transition-all duration-150 hover:border-accent"
                >
                  <img src={asset.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'icons' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-2 p-2.5 pb-0">
            <Segmented
              size="sm"
              className="w-full"
              value={iconLibrary}
              onChange={(lib) => setIconLibrary(lib)}
              options={ICON_LIBRARIES.map((l) => ({ value: l.id, label: l.label }))}
            />
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder="Search icons"
                className="field pl-7"
              />
            </div>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
            <div className="grid grid-cols-5 gap-1">
              {iconNames(iconLibrary)
                .filter((name) => name.toLowerCase().includes(iconQuery.toLowerCase()))
                .map((name) => {
                  const Icon = getIcon(name, iconLibrary);
                  return (
                    <button
                      key={name}
                      title={name}
                      onClick={() => placeIcon(name, iconLibrary)}
                      className={cx(
                        'flex h-10 items-center justify-center rounded text-ink-2 transition-colors duration-150',
                        'hover:bg-raised hover:text-ink'
                      )}
                    >
                      <Icon size={17} strokeWidth={iconLibrary === 'lucide' ? 1.75 : undefined} />
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
