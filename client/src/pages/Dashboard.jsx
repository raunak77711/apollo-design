import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Trash2, Loader2, Plus, Clock } from 'lucide-react';
import { api } from '../api/client.js';
import FormatModal from '../components/FormatModal.jsx';

const SUGGESTIONS = [
  'A promotional banner for Aryans Gym, dark and premium',
  'An Instagram post for a clothing store sale',
  'A modern restaurant menu',
  'A YouTube thumbnail about productivity',
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('loading');
  const [prompt, setPrompt] = useState('');
  const [pickerPrompt, setPickerPrompt] = useState(null); // string | null (modal open when non-null)
  const [creating, setCreating] = useState(false);
  const inputRef = useRef(null);

  const load = async () => {
    try {
      setProjects(await api.listProjects());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };
  useEffect(() => { load(); }, []);

  // Submitting a prompt opens the format picker with that prompt.
  const submitPrompt = () => {
    const text = prompt.trim();
    if (!text) return;
    setPickerPrompt(text);
  };

  const createWithFormat = async (preset) => {
    setCreating(true);
    try {
      const name = pickerPrompt ? shorten(pickerPrompt) : `${preset.name} design`;
      const project = await api.createProject({
        name,
        canvas: { width: preset.width, height: preset.height, background: '#0A0A0A' },
      });
      // Pass the prompt into the editor so it auto-generates on arrival.
      navigate(`/editor/${project.id}`, { state: { prompt: pickerPrompt || '' } });
    } catch (err) {
      alert(`Could not create project: ${err.message}`);
      setCreating(false);
      setPickerPrompt(null);
    }
  };

  const remove = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this project?')) return;
    await api.deleteProject(id);
    load();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 flex items-center px-6 gap-2 shrink-0">
        <div className="w-7 h-7 rounded bg-accent flex items-center justify-center text-white font-bold">A</div>
        <span className="font-semibold text-lg tracking-tight">Apollo Design</span>
      </header>

      {/* ChatGPT-style centered prompt area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 -mt-10">
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-semibold text-center mb-2 tracking-tight">What will you design?</h1>
          <p className="text-neutral-500 text-center mb-8">Describe it and Apollo builds an editable design. You stay in control.</p>

          {/* Previous edits — sits directly above the text bar */}
          {status === 'ready' && projects.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-2 px-1">
                <Clock size={12} /> Previous edits
              </div>
              <div className="flex gap-2 overflow-x-auto thin-scroll pb-1">
                {projects.slice(0, 10).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/editor/${p.id}`)}
                    className="group relative shrink-0 w-40 text-left rounded-xl border border-edge bg-panel hover:border-accent p-3 transition-colors"
                  >
                    <div className="w-full aspect-[16/10] rounded-lg bg-panel2 mb-2 flex items-center justify-center overflow-hidden">
                      {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-full h-full object-cover" /> : <span className="text-neutral-700 text-xl font-bold">A</span>}
                    </div>
                    <p className="text-xs font-medium truncate">{p.name}</p>
                    <p className="text-[10px] text-neutral-500">{new Date(p.updatedAt).toLocaleDateString()}</p>
                    <span onClick={(e) => remove(e, p.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-400">
                      <Trash2 size={13} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The text bar */}
          <div className="rounded-2xl border border-edge bg-panel focus-within:border-accent transition-colors p-2 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPrompt(); } }}
              rows={1}
              placeholder="Make me a banner for Aryans Gym…"
              className="flex-1 bg-transparent resize-none outline-none px-2 py-2 text-sm max-h-40 thin-scroll"
            />
            <button
              onClick={submitPrompt}
              disabled={!prompt.trim()}
              className="w-9 h-9 rounded-lg bg-accent text-white flex items-center justify-center disabled:opacity-30 shrink-0"
              title="Generate"
            >
              <ArrowUp size={18} />
            </button>
          </div>

          {/* Suggestions + blank canvas */}
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => { setPrompt(s); setPickerPrompt(s); }}
                className="text-xs text-neutral-400 hover:text-white bg-panel border border-edge hover:border-accent rounded-full px-3 py-1.5 transition-colors">
                {s}
              </button>
            ))}
            <button onClick={() => setPickerPrompt('')}
              className="text-xs text-neutral-300 hover:text-white bg-panel2 border border-edge rounded-full px-3 py-1.5 flex items-center gap-1">
              <Plus size={12} /> Blank canvas
            </button>
          </div>

          {status === 'loading' && (
            <div className="flex items-center justify-center gap-2 text-neutral-500 mt-8"><Loader2 className="animate-spin" size={16} /> Loading…</div>
          )}
          {status === 'error' && (
            <p className="text-red-400 text-sm text-center mt-8">Couldn't reach the server. Is the backend running on port 5010?</p>
          )}
        </div>
      </main>

      {pickerPrompt !== null && (
        <FormatModal
          prompt={pickerPrompt}
          busy={creating}
          onSelect={createWithFormat}
          onClose={() => !creating && setPickerPrompt(null)}
        />
      )}
    </div>
  );
}

function shorten(text) {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 40) + '…' : t;
}
