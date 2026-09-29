import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LayoutTemplate, Trash2, TriangleAlert } from 'lucide-react';
import { boardApi } from '../api/board.js';
import { useToast } from '../lib/toast.jsx';
import { Button, IconButton } from '../ui/primitives.jsx';
import AppHeader from '../components/AppHeader.jsx';
import GenerateProgress from '../components/board/GenerateProgress.jsx';
import NewBoardForm from '../components/board/NewBoardForm.jsx';
import { boardStore } from '../components/board/boardStore.js';
import { EXAMPLE_ID, newBoardId } from '../components/board/exampleBoard.js';
import { newBoardRecord, parseBoardFile, sanitizeSpec } from '../components/board/state/boardRecord.js';

const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/**
 * Jam board — the front door. Paste a brief to generate a board, open one you
 * already made, or open the bundled example (which needs no key).
 */
export default function BoardsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [boards, setBoards] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | generating
  const [outline, setOutline] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const abortRef = useRef(null);
  const fileRef = useRef(null);

  const refresh = useCallback(async () => setBoards(await boardStore.list()), []);

  useEffect(() => {
    boardApi.status().then(setStatus).catch(() => setStatus({ ready: false }));
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const generate = async (brief) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('generating');
    setOutline(null);
    setDone(new Set());
    try {
      const board = await boardApi.generate(brief, {
        signal: controller.signal,
        onOutline: setOutline,
        onSection: ({ section }) => setDone((prev) => new Set(prev).add(section.id)),
      });
      const spec = sanitizeSpec(board);
      if (!spec) throw new Error('Apollo could not build any sections from that brief.');
      const record = newBoardRecord({ id: newBoardId(), spec, brief });
      await boardStore.put(record);
      navigate(`/board/${record.id}`);
    } catch (err) {
      if (err.name !== 'AbortError') toast.error("Couldn't build the board", err.message);
      setPhase('idle');
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase('idle');
  };

  const importFile = async (file) => {
    if (!file) return;
    const parsed = parseBoardFile(await file.text());
    if (!parsed.ok) return toast.error("Couldn't open that file", parsed.error);
    try {
      const record = { ...parsed.record, id: newBoardId() };
      await boardStore.put(record);
      navigate(`/board/${record.id}`);
    } catch (err) {
      toast.error("Couldn't save the board", err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this board? This cannot be undone.')) return;
    try {
      await boardStore.remove(id);
      refresh();
    } catch (err) {
      toast.error("Couldn't delete the board", err.message);
    }
  };

  return (
    <div className="min-h-screen bg-void text-ink">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-10 sm:px-8">
        <h1 className="font-display text-3xl tracking-tight">Jam board</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-2">
          Paste the story of your video. Apollo turns it into one big, quiet board you can scroll, draw on and talk over while you record.
        </p>

        {phase === 'generating' ? (
          <GenerateProgress outline={outline} done={done} onCancel={cancel} />
        ) : (
          <NewBoardForm ready={Boolean(status?.ready)} busy={false} onGenerate={generate} />
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(`/board/${EXAMPLE_ID}`)}>
            <LayoutTemplate size={14} />
            Open the example board
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>
            <Download size={14} />
            Import a board file
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        {boards.length > 0 && (
          <section className="mt-12">
            <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Your boards</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((b) => (
                <li key={b.id} className="group relative rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
                  <button type="button" onClick={() => navigate(`/board/${b.id}`)} className="block w-full p-4 text-left">
                    <p className="truncate font-display text-lg text-ink">{b.title}</p>
                    <p className="mt-1 text-xs text-ink-3">
                      {b.sections} sections · {when(b.updatedAt)}
                    </p>
                    {b.degraded > 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2">
                        <TriangleAlert size={12} /> {b.degraded} section{b.degraded > 1 ? 's' : ''} need a second try
                      </p>
                    )}
                  </button>
                  <IconButton aria-label="Delete board" onClick={() => remove(b.id)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100">
                    <Trash2 size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
