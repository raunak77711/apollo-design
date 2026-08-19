import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { History, PencilLine, Sparkles, TriangleAlert, X } from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { useToast } from '../lib/toast.jsx';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { useLocalState } from '../lib/useLocalState.js';
import { createEmptyDocument } from '../design/schema.js';
import { findPreset } from '../design/presets.js';
import { Button, IconButton, Spinner, Tooltip } from '../ui/primitives.jsx';
import { Spark } from '../ui/brand.jsx';
import { Modal } from '../ui/overlay.jsx';
import AppHeader from '../components/AppHeader.jsx';
import FormatPicker from '../components/FormatPicker.jsx';
import GenerationScene from '../components/generation/GenerationScene.jsx';
import { useGenerationStages } from '../components/generation/useGenerationStages.js';
import ScribbleCanvas from '../components/scribble/ScribbleCanvas.jsx';
import ScribbleTools from '../components/scribble/ScribbleTools.jsx';
import ResultStage from '../components/scribble/ResultStage.jsx';
import VersionHistory from '../components/scribble/VersionHistory.jsx';
import { useScribbleCanvas } from '../components/scribble/useScribbleCanvas.js';

/**
 * Scribble → Design.
 *
 * Draw the idea, and Apollo builds the design it describes. The drawing is a
 * *composition brief*, not a picture to trace: the server reads where things
 * were put and how big they are (`design/scribble.js`), and the ordinary
 * generation pipeline then does its usual job to that specification — real
 * photography, a real grid, measured typography, every layer editable
 * afterwards in the editor. The output is an Apollo document like any other,
 * which is what stops this being a novelty bolted onto the side of the app.
 *
 * The page is a two-state machine — sketch, then result — with generation as
 * the transition between them, narrated by the same moon scene the homepage
 * composer uses. Nothing is ever overwritten: the sketch is saved as a version
 * before generating, and every design that comes back is saved as another.
 */

/** The sketch is sent at this size on its long edge — plenty for a vision read. */
const SEND_MAX_PX = 1280;

const DEFAULT_FORMAT = findPreset('poster');

const EXAMPLES = [
  'A cinematic space poster — dark, atmospheric, a lot of depth',
  'A music festival flyer, neon and loud',
  'A calm, premium menu for a coffee bar',
];

export default function ScribblePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const wide = useMediaQuery('(min-width: 1024px)');

  /* --------------------------------- state -------------------------------- */

  const [format, setFormat] = useLocalState('apollo.scribble.format', DEFAULT_FORMAT);
  const [prompt, setPrompt] = useState(location.state?.prompt || '');
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111111');
  const [brushSize, setBrushSize] = useState(7);

  // 'draw' → 'generating' → 'result'. Generation owns the screen while it runs.
  const [mode, setMode] = useState('draw');
  const [result, setResult] = useState(null); // { document, message, scribble }
  const [busy, setBusy] = useState(null); // 'saving' | 'exporting' | 'generating'
  const [error, setError] = useState('');

  const [projectId, setProjectId] = useState(params.get('project') || null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [savedResult, setSavedResult] = useState(false);
  const [pendingClear, setPendingClear] = useState(false);

  const stages = useGenerationStages();
  const abortRef = useRef(null);
  const settleRef = useRef(null);

  const canvas = useScribbleCanvas({ color, size: brushSize, tool });
  const { attach, canRedo, canUndo, clear, handlers, isEmpty, load, ready, redo, snapshot, toDataUrl, undo, canvasRef } =
    canvas;

  // Strokes waiting for a canvas to land on. Opening a saved sketch happens
  // while the result is still on screen, so the artboard does not exist yet
  // and has no size to scale them by.
  const [pendingStrokes, setPendingStrokes] = useState(null);

  const aspect = format.width / format.height;

  useEffect(() => {
    if (mode !== 'draw' || !ready || !pendingStrokes) return;
    load(pendingStrokes);
    setPendingStrokes(null);
  }, [load, mode, pendingStrokes, ready]);

  /* ------------------------------- shortcuts ------------------------------- */

  useEffect(() => {
    const onKey = (event) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(event.target?.tagName) || event.target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === 'z') {
        // Undo works while typing in the prompt too — that is the textarea's
        // own undo, and stealing it would be worse than not having ours.
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (typing || mod) return;

      const key = event.key.toLowerCase();
      if (key === 'b') setTool('pen');
      else if (key === 'm') setTool('marker');
      else if (key === 'e') setTool('eraser');
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, undo]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimeout(settleRef.current);
    },
    []
  );

  /* -------------------------------- versions ------------------------------- */

  const loadVersions = useCallback(
    async (id) => {
      if (!id) return;
      setVersionsLoading(true);
      try {
        setVersions(await api.listVersions(id));
      } catch {
        // A history that will not load is not worth interrupting anyone over —
        // the rail shows its empty state and everything else still works.
      } finally {
        setVersionsLoading(false);
      }
    },
    []
  );

  // Returning to a project by URL restores its history and its latest design.
  useEffect(() => {
    const id = params.get('project');
    if (!id) return;
    setProjectId(id);
    (async () => {
      try {
        const project = await api.getProject(id);
        if (project.document?.elements?.length) {
          setResult((current) => current || { document: project.document, message: '', scribble: null });
        }
        await loadVersions(id);
      } catch (err) {
        setError(err.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The project this session writes to, created on first use rather than on arrival. */
  const ensureProject = useCallback(async () => {
    if (projectId) return projectId;
    const project = await api.createProject({
      name: prompt.trim() ? prompt.trim().slice(0, 60) : 'Scribble design',
      canvas: { width: format.width, height: format.height, background: '#0A0A0B' },
    });
    setProjectId(project.id);
    // Kept in the URL so a reload — or a trip to the editor and back — lands
    // on the same piece of work rather than a blank sheet.
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set('project', project.id);
      return next;
    }, { replace: true });
    return project.id;
  }, [format.height, format.width, projectId, prompt, setParams]);

  const saveVersion = useCallback(
    async (id, payload) => {
      try {
        const { versions: list, version } = await api.saveVersion(id, payload);
        setVersions(list);
        setActiveVersionId(version.id);
        return version;
      } catch (err) {
        toast.error('Apollo could not save that version', err.message);
        return null;
      }
    },
    [toast]
  );

  /* ------------------------------- generating ------------------------------ */

  /**
   * Build a design from the current sketch.
   *
   * `reuse` is the sketch a previous run already captured and saved — what
   * "Try again" passes. Re-reading the canvas there would be wrong twice over:
   * the artboard has just been unmounted by the result screen and may not have
   * been measured yet, and it would file a second, identical Sketch version,
   * filling the history with copies of one drawing. Trying again means the
   * same sketch and a different design.
   */
  const generate = useCallback(async ({ reuse = null } = {}) => {
    if (!reuse && isEmpty && !prompt.trim()) {
      setError('Draw something first, or describe what you want — Apollo needs one or the other.');
      return;
    }

    setError('');
    setBusy('generating');
    setMode('generating');
    setSavedResult(false);

    const scribble =
      reuse ||
      (isEmpty
        ? null
        : toDataUrl(
            format.width >= format.height
              ? { width: SEND_MAX_PX, height: Math.round(SEND_MAX_PX / aspect) }
              : { width: Math.round(SEND_MAX_PX * aspect), height: SEND_MAX_PX }
          ));

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const id = await ensureProject();

      // The sketch is saved *before* anything is generated from it. If the
      // generation fails, or produces something worse than the last one, the
      // drawing is still there — which is the whole promise of this screen.
      // A reused sketch is already in the history and is not filed again.
      if (scribble && !reuse) {
        await saveVersion(id, {
          kind: 'scribble',
          label: 'Sketch',
          scribble,
          // The strokes as well as the picture, so reopening this version puts
          // a live drawing back on the canvas rather than a flat image.
          strokes: snapshot(),
          prompt: prompt.trim(),
          document: createEmptyDocument({ width: format.width, height: format.height, background: '#0A0A0B' }),
        });
      }

      const document = createEmptyDocument({
        width: format.width,
        height: format.height,
        background: '#0A0A0B',
      });

      const res = await api.aiGenerateStream(
        {
          message: prompt.trim() || 'Design this',
          document,
          scribble,
        },
        { onStage: stages.push, signal: abort.signal }
      );

      if (abort.signal.aborted) return;

      const finished = res.preview || document;
      if (!res.operations?.length) throw new Error('Apollo could not compose a design from that.');

      // Persist it as the project's current document, then keep it as a
      // version in its own right.
      await api.updateProject(id, { document: finished });
      await saveVersion(id, {
        kind: 'generated',
        label: versions.some((v) => v.kind === 'generated') ? 'New direction' : 'Apollo design',
        document: finished,
        scribble,
        note: res.message,
        prompt: prompt.trim(),
      });

      setResult({ document: finished, message: res.message, scribble });
      setSavedResult(true);
      stages.finish();
      // The scene holds on "ready" for a beat and then clears to reveal the
      // design underneath — a handover rather than a cut.
      settleRef.current = setTimeout(() => {
        setMode('result');
        setBusy(null);
      }, 750);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      setMode('draw');
      setBusy(null);
      toast.error('Apollo could not draw that', err.message);
    }
  }, [
    aspect,
    ensureProject,
    format.height,
    format.width,
    isEmpty,
    prompt,
    saveVersion,
    snapshot,
    stages,
    toDataUrl,
    toast,
    versions,
  ]);

  /**
   * What either Generate button does. From the result screen both mean "the
   * same sketch, another go", so both reuse the captured drawing rather than
   * reading an artboard that is not currently on screen.
   */
  const handleGenerate = useCallback(
    () => generate(mode === 'result' && result?.scribble ? { reuse: result.scribble } : {}),
    [generate, mode, result]
  );

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort();
    clearTimeout(settleRef.current);
    setMode('draw');
    setBusy(null);
  }, []);

  /* --------------------------------- actions ------------------------------- */

  const saveCurrent = useCallback(async () => {
    setBusy('saving');
    try {
      const id = await ensureProject();
      if (mode === 'result' && result?.document) {
        await api.updateProject(id, { document: result.document });
        await saveVersion(id, {
          kind: 'edit',
          label: 'Saved design',
          document: result.document,
          scribble: result.scribble,
          prompt: prompt.trim(),
        });
      } else {
        const scribble = isEmpty ? null : toDataUrl({ width: SEND_MAX_PX, height: Math.round(SEND_MAX_PX / aspect) });
        await saveVersion(id, {
          kind: 'scribble',
          label: 'Sketch',
          scribble,
          // The strokes as well as the picture, so reopening this version puts
          // a live drawing back on the canvas rather than a flat image.
          strokes: snapshot(),
          prompt: prompt.trim(),
          document: createEmptyDocument({ width: format.width, height: format.height, background: '#0A0A0B' }),
        });
      }
      setSavedResult(true);
      toast.success('Version saved');
    } catch (err) {
      toast.error('Could not save', err.message);
    } finally {
      setBusy(null);
    }
  }, [aspect, ensureProject, format.height, format.width, isEmpty, mode, prompt, result, saveVersion, snapshot, toDataUrl, toast]);

  const exportDesign = useCallback(async () => {
    if (!result?.document) return;
    setBusy('exporting');
    try {
      const id = await ensureProject();
      const { url } = await api.exportDesign({ projectId: id, document: result.document, format: 'png' });
      // Same as the editor's export: the file is written server-side and
      // handed over as a download rather than rebuilt in the browser.
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(prompt.trim() || 'apollo-design').slice(0, 40).replace(/[^\w-]+/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Design exported');
    } catch (err) {
      toast.error('Could not export that', err.message);
    } finally {
      setBusy(null);
    }
  }, [ensureProject, prompt, result, toast]);

  const openInEditor = useCallback(async () => {
    try {
      const id = await ensureProject();
      if (result?.document) await api.updateProject(id, { document: result.document });
      navigate(`/editor/${id}`);
    } catch (err) {
      toast.error('Could not open the editor', err.message);
    }
  }, [ensureProject, navigate, result, toast]);

  const openVersion = useCallback(
    async (version) => {
      if (!projectId) return;
      try {
        const full = await api.getVersion(projectId, version.id);
        setActiveVersionId(version.id);
        if (version.kind === 'scribble' || !full.document?.elements?.length) {
          // A sketch version goes back to the drawing board with its strokes
          // live on the canvas again — editable, undoable, and ready to
          // generate from a second time.
          setMode('draw');
          setResult(null);
          if (full.prompt) setPrompt(full.prompt);
          if (full.strokes?.length) {
            setPendingStrokes(full.strokes);
            toast.success(`Sketch v${version.index} restored`, 'Keep drawing, then generate again.');
          } else {
            toast.success(`Sketch v${version.index} opened`);
          }
          setHistoryOpen(false);
          return;
        }
        setResult({ document: full.document, message: full.note || '', scribble: full.scribble });
        setMode('result');
        setSavedResult(true);
        setHistoryOpen(false);
      } catch (err) {
        toast.error('Could not open that version', err.message);
      }
    },
    [projectId, toast]
  );

  const restore = useCallback(
    async (version) => {
      if (!projectId) return;
      setRestoringId(version.id);
      try {
        const { document: doc, versions: list } = await api.restoreVersion(projectId, version.id);
        setVersions(list);
        setResult({ document: doc, message: '', scribble: version.scribble });
        setActiveVersionId(version.id);
        setMode('result');
        setSavedResult(true);
        setHistoryOpen(false);
        toast.success(`Restored v${version.index}`, 'Your later work was kept as a version.');
      } catch (err) {
        toast.error('Could not restore that version', err.message);
      } finally {
        setRestoringId(null);
      }
    },
    [projectId, toast]
  );

  /* --------------------------------- render -------------------------------- */

  const historyPanel = (
    <VersionHistory
      versions={versions}
      activeId={activeVersionId}
      loading={versionsLoading}
      busyId={restoringId}
      onOpen={openVersion}
      onRestore={restore}
    />
  );

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <AppHeader />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ------------------------------ workspace --------------------------- */}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-workspace">
          {mode === 'result' && result ? (
            <ResultStage
              document={result.document}
              scribble={result.scribble}
              message={result.message}
              saved={savedResult}
              busy={busy}
              // Same sketch, different design — no trip back to the canvas.
              onRegenerate={() => generate({ reuse: result.scribble })}
              onEdit={openInEditor}
              onSave={saveCurrent}
              onExport={exportDesign}
              onBack={() => setMode('draw')}
            />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 sm:px-6">
                <div className="min-w-0">
                  <h1 className="truncate font-display text-[19px] font-medium tracking-[-0.025em] text-ink sm:text-[22px]">
                    Turn your idea into design
                  </h1>
                  <p className="mt-0.5 truncate text-xs text-ink-3 sm:text-[13px]">
                    Scribble your idea. Let Apollo bring it to life.
                  </p>
                </div>

                {!wide && versions.length > 0 && (
                  <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
                    <History size={14} />
                    {versions.length}
                  </Button>
                )}
              </div>

              <ScribbleCanvas
                canvasRef={canvasRef}
                handlers={handlers}
                attach={attach}
                aspect={aspect}
                tool={tool}
                brushSize={brushSize}
                color={color}
                isEmpty={isEmpty}
                className="px-4 py-4 sm:px-6"
              />

              <div className="flex shrink-0 justify-center px-4 pb-4 sm:px-6">
                <ScribbleTools
                  tool={tool}
                  onTool={setTool}
                  color={color}
                  onColor={setColor}
                  size={brushSize}
                  onSize={setBrushSize}
                  onUndo={undo}
                  onRedo={redo}
                  onClear={() => setPendingClear(true)}
                  canUndo={canUndo}
                  canRedo={canRedo}
                  isEmpty={isEmpty}
                />
              </div>
            </>
          )}
        </section>

        {/* ------------------------------- controls --------------------------- */}

        {wide ? (
          <aside className="thin-scroll flex w-[352px] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-l border-line bg-void">
            <ControlPanel
              prompt={prompt}
              onPrompt={setPrompt}
              format={format}
              onFormat={setFormat}
              onGenerate={handleGenerate}
              onSave={saveCurrent}
              busy={busy}
              error={error}
              isEmpty={isEmpty}
              mode={mode}
              versions={versions}
              historyPanel={historyPanel}
            />
          </aside>
        ) : (
          <aside className="shrink-0 border-t border-line bg-void">
            <ControlPanel
              compact
              prompt={prompt}
              onPrompt={setPrompt}
              format={format}
              onFormat={setFormat}
              onGenerate={handleGenerate}
              onSave={saveCurrent}
              busy={busy}
              error={error}
              isEmpty={isEmpty}
              mode={mode}
              versions={versions}
              historyPanel={null}
            />
          </aside>
        )}
      </main>

      {/* The moon, while Apollo works. The same scene the editor uses, so a
          generation looks the same wherever it was started from. */}
      <GenerationScene stage={stages.stage} open={mode === 'generating'} />

      {mode === 'generating' && (
        <button
          type="button"
          onClick={cancelGeneration}
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-white/20 px-3.5 py-1.5 text-xs text-white/70 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
        >
          Cancel
        </button>
      )}

      {/* Version history as a sheet, on anything too narrow for the column. */}
      <Modal open={historyOpen && !wide} onClose={() => setHistoryOpen(false)} className="max-w-md">
        <header className="flex h-11 items-center gap-2 border-b border-line px-4">
          <History size={14} className="text-ink-3" />
          <h2 className="flex-1 text-[13px] font-medium text-ink">Version history</h2>
          <IconButton onClick={() => setHistoryOpen(false)} aria-label="Close history">
            <X size={14} />
          </IconButton>
        </header>
        <div className="thin-scroll max-h-[70vh] overflow-y-auto p-3">{historyPanel}</div>
      </Modal>

      <Modal open={pendingClear} onClose={() => setPendingClear(false)} className="max-w-sm">
        <div className="px-5 py-5">
          <h2 className="font-display text-[15px] font-semibold">Clear the canvas?</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
            Your drawing will be removed. Undo brings it straight back, and any version you have
            saved is untouched.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={() => setPendingClear(false)}>
            Keep drawing
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              clear();
              setPendingClear(false);
            }}
          >
            Clear canvas
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ control panel ----------------------------- */

/**
 * Everything that is not the canvas: what you want, what shape it is, and the
 * one button that does the work. Laid out as a column beside the artboard on a
 * desktop and as a bar beneath it on a phone, from one definition — the
 * controls are identical, only the room they are given differs.
 */
function ControlPanel({
  compact = false,
  prompt,
  onPrompt,
  format,
  onFormat,
  onGenerate,
  onSave,
  busy,
  error,
  isEmpty,
  mode,
  versions,
  historyPanel,
}) {
  const generating = busy === 'generating';

  return (
    <div className={cx('flex flex-col', compact ? 'gap-2.5 p-3' : 'gap-4 p-4')}>
      {/* ------------------------------ direction ------------------------- */}

      <div>
        {!compact && (
          <label htmlFor="scribble-prompt" className="label mb-2 block">
            Direction <span className="normal-case tracking-normal text-ink-3">— optional</span>
          </label>
        )}
        <textarea
          id="scribble-prompt"
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onGenerate();
          }}
          rows={compact ? 2 : 3}
          placeholder="Say anything about the mood, the brand or the words — or leave it and let Apollo read the drawing."
          className="thin-scroll w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none transition-colors duration-150 placeholder:text-ink-3 hover:border-line-strong focus:border-accent/70"
        />

        {!compact && !prompt && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onPrompt(example)}
                className="rounded border border-line bg-surface px-2 py-1 text-left text-2xs text-ink-3 transition-colors duration-150 hover:border-line-strong hover:text-ink-2"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* -------------------------------- format -------------------------- */}

      <div className={cx('flex min-w-0 gap-2', compact ? 'items-center' : 'flex-col items-start')}>
        <FormatPicker
          value={format}
          side={compact ? 'top' : 'bottom'}
          className="min-w-0 max-w-full"
          onSelect={onFormat}
          onCustom={({ width, height }) =>
            onFormat({ id: 'custom', name: 'Custom', width, height })
          }
        />
        {!compact && (
          <span className="text-2xs leading-relaxed text-ink-3">
            The canvas takes this shape, so what you draw is where it lands.
          </span>
        )}
      </div>

      {/* ------------------------------- generate ------------------------- */}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2.5">
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-ink-2">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="accent"
          size="lg"
          onClick={onGenerate}
          disabled={generating}
          className="flex-1"
        >
          {generating ? <Spinner size={14} /> : <Spark size={14} />}
          {generating ? 'Apollo is drawing…' : mode === 'result' ? 'Generate again' : 'Generate design'}
        </Button>

        <Tooltip label="Save a version" side={compact ? 'top' : 'bottom'}>
          <Button variant="secondary" size="lg" onClick={onSave} disabled={busy === 'saving'} aria-label="Save a version">
            {busy === 'saving' ? <Spinner size={14} /> : <PencilLine size={14} />}
          </Button>
        </Tooltip>
      </div>

      {!compact && isEmpty && (
        <p className="flex items-start gap-1.5 text-2xs leading-relaxed text-ink-3">
          <Sparkles size={11} className="mt-0.5 shrink-0" />
          Draw even a rough arrangement and Apollo will follow it — a box where the picture goes, a
          line where the headline sits.
        </p>
      )}

      {/* ------------------------------- history -------------------------- */}

      {historyPanel && (
        <div className="mt-2 border-t border-line pt-4">
          <div className="mb-3 flex items-center gap-2">
            <History size={13} className="text-ink-3" />
            <h2 className="flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">Versions</h2>
            {versions.length > 0 && <span className="num text-2xs text-ink-3">{versions.length}</span>}
          </div>
          {historyPanel}
        </div>
      )}
    </div>
  );
}
