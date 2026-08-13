import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Sparkles } from 'lucide-react';
import { EditorProvider, useEditor } from '../state/EditorContext.jsx';
import { api } from '../api/client.js';
import Topbar from '../components/Topbar.jsx';
import Toolbar from '../components/Toolbar.jsx';
import Canvas from '../components/Canvas.jsx';
import PropertiesPanel from '../components/PropertiesPanel.jsx';
import BottomDock from '../components/BottomDock.jsx';
import PhotoEditor from '../components/PhotoEditor.jsx';

export default function EditorPage() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}

function EditorShell() {
  const { id } = useParams();
  const location = useLocation();
  const initialPrompt = location.state?.prompt || '';
  const { state, actions } = useEditor();
  const [name, setName] = useState('Untitled Design');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ai');
  const [generating, setGenerating] = useState(false);
  const [photoEditId, setPhotoEditId] = useState(null); // open the Adjust editor for this image
  const didGenerate = useRef(false); // guard against StrictMode double-run

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const project = await api.getProject(id);
        if (!active) return;
        setName(project.name);
        actions.loadDocument(project.document);
        setStatus('ready');

        // Auto-generate from the prompt passed in from the dashboard, once,
        // only if the design is still empty.
        if (initialPrompt && !didGenerate.current && (project.document.elements || []).length === 0) {
          didGenerate.current = true;
          setGenerating(true);
          try {
            const res = await api.aiChat({ message: initialPrompt, document: project.document });
            if (active && res.operations?.length) actions.apply(res.operations);
          } catch (err) {
            if (active) alert(`Apollo couldn't generate that: ${err.message}`);
          } finally {
            if (active) setGenerating(false);
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err.message);
        setStatus('error');
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Global keyboard shortcuts (ignored while typing in a field).
  const onKey = useCallback(
    (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? actions.redo() : actions.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); actions.redo(); return; }
      if (typing) return;
      const sel = state.selectedElementId;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        actions.apply([{ type: 'DELETE_ELEMENT', targetId: sel }], { selectId: null });
      }
      if (mod && e.key.toLowerCase() === 'd' && sel) {
        e.preventDefault();
        actions.apply([{ type: 'DUPLICATE_ELEMENT', targetId: sel }]);
      }
      if (e.key === 'Escape') actions.select(null);
    },
    [actions, state.selectedElementId]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (status === 'loading') {
    return <FullScreen><Loader2 className="animate-spin" /> Loading project…</FullScreen>;
  }
  if (status === 'error') {
    return (
      <FullScreen>
        <div className="text-center space-y-3">
          <p className="text-red-400">Couldn't load this project: {error}</p>
          <Link to="/" className="inline-flex items-center gap-1 text-accent"><ArrowLeft size={16} /> Back to dashboard</Link>
        </div>
      </FullScreen>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Topbar projectId={id} name={name} onRename={setName} />
      <div className="flex-1 flex min-h-0">
        <Toolbar onOpenImages={() => setTab('images')} />
        <Canvas onEditImage={setPhotoEditId} />
        <PropertiesPanel onEditImage={setPhotoEditId} />
      </div>
      <BottomDock projectId={id} activeTab={tab} onTabChange={setTab} />

      {photoEditId && <PhotoEditor elementId={photoEditId} onClose={() => setPhotoEditId(null)} />}

      {generating && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 bg-panel border border-edge rounded-xl px-5 py-4 shadow-2xl">
            <Sparkles size={18} className="text-accent animate-pulse" />
            <span className="text-sm text-neutral-200">Apollo is generating your design…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function FullScreen({ children }) {
  return <div className="h-screen flex items-center justify-center gap-2 text-neutral-400">{children}</div>;
}
