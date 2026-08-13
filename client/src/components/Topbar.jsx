import { useState } from 'react';
import { Undo2, Redo2, Download, Save, ZoomIn, ZoomOut, Check, Loader2 } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';
import { api } from '../api/client.js';

export default function Topbar({ projectId, name, onRename }) {
  const { state, actions } = useEditor();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [format, setFormat] = useState('png');

  const save = async () => {
    if (!projectId) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.updateProject(projectId, { name, document: state.document });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const res = await api.exportDesign({ projectId, document: state.document, format });
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="h-12 bg-panel border-b border-edge flex items-center px-3 gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-white text-sm font-bold">A</div>
        <span className="font-semibold tracking-tight">Apollo</span>
      </div>

      <div className="w-px h-6 bg-edge" />

      <input
        value={name}
        onChange={(e) => onRename(e.target.value)}
        className="bg-transparent text-sm text-neutral-200 outline-none border border-transparent focus:border-edge rounded px-2 py-1 w-56"
      />

      <div className="flex items-center gap-1 ml-2">
        <IconBtn title="Undo" disabled={state.past.length === 0} onClick={actions.undo}><Undo2 size={16} /></IconBtn>
        <IconBtn title="Redo" disabled={state.future.length === 0} onClick={actions.redo}><Redo2 size={16} /></IconBtn>
      </div>

      <div className="flex items-center gap-1 ml-2 text-neutral-400">
        <IconBtn title="Zoom out" onClick={() => actions.setZoom(state.zoom - 0.1)}><ZoomOut size={16} /></IconBtn>
        <span className="text-xs w-10 text-center tabular-nums">{Math.round(state.zoom * 100)}%</span>
        <IconBtn title="Zoom in" onClick={() => actions.setZoom(state.zoom + 0.1)}><ZoomIn size={16} /></IconBtn>
      </div>

      <div className="flex-1" />

      <select value={format} onChange={(e) => setFormat(e.target.value)} className="bg-panel2 border border-edge rounded text-sm px-2 py-1 text-neutral-300">
        <option value="png">PNG</option>
        <option value="jpg">JPG</option>
        <option value="webp">WebP</option>
      </select>

      <button onClick={doExport} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel2 border border-edge hover:bg-edge text-sm disabled:opacity-50">
        {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Export
      </button>

      <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent hover:bg-accent/90 text-white text-sm disabled:opacity-50">
        {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Save size={15} />}
        {saved ? 'Saved' : 'Save'}
      </button>
    </header>
  );
}

function IconBtn({ children, onClick, title, disabled }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className="w-8 h-8 rounded flex items-center justify-center text-neutral-300 hover:bg-panel2 disabled:opacity-30 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}
