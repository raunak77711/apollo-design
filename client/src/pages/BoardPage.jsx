import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eraser, FileUp, HelpCircle, LayoutList, Maximize2, RotateCcw, Sparkles, Video, X } from 'lucide-react';
import { boardApi } from '../api/board.js';
import { useToast } from '../lib/toast.jsx';
import { Button, IconButton, Spinner, Tooltip } from '../ui/primitives.jsx';
import BoardCanvas from '../components/board/BoardCanvas.jsx';
import DirectBar from '../components/board/direct/DirectBar.jsx';
import HelpDialog from '../components/board/HelpDialog.jsx';
import PropertyPanel from '../components/board/PropertyPanel.jsx';
import { ScrollIndicator, SectionPill, ZoomControls } from '../components/board/RecordingHud.jsx';
import SectionRail from '../components/board/SectionRail.jsx';
import Toolbar from '../components/board/Toolbar.jsx';
import { createAutosaver } from '../components/board/autosave.js';
import { boardStore } from '../components/board/boardStore.js';
import { downloadText, outlineFromSpec, sectionHasWork, slugify } from '../components/board/boardActions.js';
import { EXAMPLE_ID, createExampleRecord, newBoardId } from '../components/board/exampleBoard.js';
import { exportBoard, parseBoardFile, recordFromState, stateFromRecord } from '../components/board/state/boardRecord.js';
import { runDirect } from '../components/board/direct/runDirect.js';
import { attachKeys } from '../components/board/tools/keys.js';

/**
 * A board. Loads it from the browser's storage (the bundled example is created
 * on first open), mounts the editor, and saves every change 800 ms after it
 * settles — and immediately when the tab is hidden or closed.
 *
 * Recording mode strips the page to the canvas, the slim toolbar, zoom, and a
 * "4 / 12 — TITLE" pill, so what you screen-record is only the board.
 */
export default function BoardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const fileRef = useRef(null);
  const [loaded, setLoaded] = useState(null); // { record } | { missing: true }
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [section, setSection] = useState(0);
  const [ui, setUi] = useState({ tool: 'select', locked: false, canUndo: false, canRedo: false });
  const [editor, setEditor] = useState(null);
  const [selection, setSelection] = useState([]);
  const [defaults, setDefaults] = useState(null);
  const [recording, setRecording] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busySection, setBusySection] = useState(null);
  const [directOpen, setDirectOpen] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [sections, setSections] = useState([]);
  const editorRef = useRef(null);
  const metaRef = useRef(null);
  const saverRef = useRef(null);
  const recordingRef = useRef(false);
  recordingRef.current = recording;

  // The board is a white page you record; its controls should be white too, whatever the app theme is.
  // The attribute is put back on the way out, and the saved preference is never touched.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    return () => {
      if (previous) root.setAttribute('data-theme', previous);
      else root.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    (async () => {
      let record = null;
      try {
        record = await boardStore.get(id);
        if (!record && id === EXAMPLE_ID) {
          record = createExampleRecord();
          await boardStore.put(record).catch(() => {});
        }
      } catch {
        record = null;
      }
      if (live && boardStore.mode === 'localstorage') {
        toast.show('This browser is using limited storage', {
          detail: 'Boards with many images may not fit. Use Save to keep a copy.',
          duration: 8000,
        });
      }
      if (live) setLoaded(record ? { record } : { missing: true });
    })();
    return () => {
      live = false;
    };
  }, [id, toast]);

  // Autosave, with a guaranteed flush on the way out.
  useEffect(() => {
    if (!loaded?.record) return undefined;
    metaRef.current = { id: loaded.record.id, createdAt: loaded.record.createdAt };
    const saver = createAutosaver({
      save: (record) => boardStore.put(record),
      onError: (err) => toast.error("Couldn't save this board", err.message),
    });
    saverRef.current = saver;
    const flush = () => saver.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loaded, toast]);

  useEffect(() => {
    let live = true;
    boardApi.status().then((s) => live && setAiReady(Boolean(s.ready))).catch(() => live && setAiReady(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    setDefaults(editor.defaults.get());
    setSections(editor.getState().spec.sections);
    return attachKeys(editor, {
      onEscape: () => {
        if (recordingRef.current) setRecording(false);
        editor.tools.set('select');
        editor.deselect();
      },
      onHelp: () => setHelpOpen(true),
      onDirect: () => {
        if (!recordingRef.current) setDirectOpen(true);
      },
    });
  }, [editor]);

  const hooks = useMemo(() => {
    const schedule = () => {
      const current = editorRef.current;
      const saver = saverRef.current;
      if (!current || !saver) return;
      saver.schedule(() => recordFromState(current.getState(), metaRef.current));
    };
    return {
      onState: (state, meta) => {
        setUi((u) => ({ ...u, canUndo: meta.canUndo, canRedo: meta.canRedo }));
        setSections(state.spec.sections);
        schedule();
      },
      onTool: (tool, locked) => setUi((u) => ({ ...u, tool, locked })),
      onSelection: setSelection,
      onDefaults: setDefaults,
      onError: (message) => toast.error(message),
      onView: (next, sectionIndex) => {
        setView({ zoom: next.zoom, x: next.x, y: next.y });
        setSection(sectionIndex);
        schedule();
      },
    };
  }, [toast]);

  const initialState = useMemo(() => (loaded?.record ? stateFromRecord(loaded.record) : null), [loaded]);

  /* --------------------------------- actions -------------------------------- */

  const saveFile = () => {
    const record = recordFromState(editor.getState(), metaRef.current);
    downloadText(`${slugify(record.title)}.apollo-board.json`, exportBoard(record));
    toast.success('Board saved to a file');
  };

  const loadFile = async (file) => {
    if (!file) return;
    const parsed = parseBoardFile(await file.text());
    if (!parsed.ok) {
      toast.error("Couldn't open that file", parsed.error);
      return;
    }
    if (parsed.record.id === metaRef.current.id) {
      if (!window.confirm('Replace the drawings and edits on this board with the ones in the file?')) return;
      editor.loadState(stateFromRecord(parsed.record));
      toast.success('Board restored from the file');
      return;
    }
    try {
      const record = { ...parsed.record, id: newBoardId() };
      await boardStore.put(record);
      navigate(`/board/${record.id}`);
    } catch (err) {
      toast.error("Couldn't save the board", err.message);
    }
  };

  const clearAnnotations = () => {
    if (window.confirm('Clear everything you drew or added? The board itself is not affected.')) {
      editor.dispatch({ type: 'ANNOTATIONS_CLEAR' });
    }
  };

  const resetLayout = () => {
    if (window.confirm('Put every piece back where the layout placed it? Your drawings stay.')) {
      editor.dispatch({ type: 'OVERRIDES_RESET' });
    }
  };

  const regenerate = async (index, note) => {
    const state = editor.getState();
    const target = state.spec.sections[index];
    if (!state.brief) {
      toast.error('This board has no brief to rebuild from.');
      return;
    }
    if (sectionHasWork(state, target.id)
      && !window.confirm('Rebuilding replaces this section and drops the pieces you moved in it. Your drawings stay. Continue?')) {
      return;
    }
    setBusySection(index);
    try {
      const built = await boardApi.regenerateSection({ brief: state.brief, outline: outlineFromSpec(state.spec), index, note });
      editor.replaceSection(index, built);
      toast.success(`Rebuilt "${target.title}"`);
    } catch (err) {
      toast.error("Couldn't rebuild that section", err.message);
    } finally {
      setBusySection(null);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  /* ---------------------------------- render -------------------------------- */

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-void">
        <Spinner />
      </div>
    );
  }
  if (loaded.missing) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-void text-ink">
        <p>That board isn't in this browser.</p>
        <Link to="/board" className="text-accent-text underline">Back to Jam board</Link>
      </div>
    );
  }

  const zoomControls = (
    <ZoomControls
      zoom={view.zoom}
      onIn={() => editor?.viewport.zoomBy(1.2)}
      onOut={() => editor?.viewport.zoomBy(1 / 1.2)}
      onReset={() => editor?.viewport.reset()}
    />
  );

  return (
    <div className="fixed inset-0 bg-white">
      <BoardCanvas
        key={loaded.record.id}
        initialState={initialState}
        hooks={hooks}
        onEditor={(e) => {
          editorRef.current = e;
          setEditor(e);
        }}
      />

      {!recording && (
        <>
          <Link
            to="/board"
            className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink shadow-pop"
          >
            <ArrowLeft size={14} />
            <span className="max-w-[40vw] truncate">{initialState.spec.title}</span>
          </Link>

          <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 shadow-pop">
            <Tooltip label="Sections" side="bottom"><IconButton aria-label="Sections" active={railOpen} onClick={() => setRailOpen((o) => !o)}><LayoutList size={15} /></IconButton></Tooltip>
            <Tooltip label="Save to a file" side="bottom"><IconButton aria-label="Save to a file" onClick={saveFile} disabled={!editor}><Download size={15} /></IconButton></Tooltip>
            <Tooltip label="Load from a file" side="bottom"><IconButton aria-label="Load from a file" onClick={() => fileRef.current?.click()} disabled={!editor}><FileUp size={15} /></IconButton></Tooltip>
            <Tooltip label="Clear my annotations" side="bottom"><IconButton aria-label="Clear my annotations" onClick={clearAnnotations} disabled={!editor}><Eraser size={15} /></IconButton></Tooltip>
            <Tooltip label="Reset layout" side="bottom"><IconButton aria-label="Reset layout" onClick={resetLayout} disabled={!editor}><RotateCcw size={15} /></IconButton></Tooltip>
            <Tooltip label="Direct mode" hint="/" side="bottom"><IconButton aria-label="Direct mode" active={directOpen} disabled={!editor} onClick={() => setDirectOpen((o) => !o)}><Sparkles size={15} /></IconButton></Tooltip>
            <Tooltip label="Controls" hint="?" side="bottom"><IconButton aria-label="Controls" onClick={() => setHelpOpen(true)}><HelpCircle size={15} /></IconButton></Tooltip>
            <Button variant="primary" size="sm" disabled={!editor} onClick={() => { setRecording(true); setRailOpen(false); setDirectOpen(false); }}>
              <Video size={13} />
              Start recording mode
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
        </>
      )}

      {recording && (
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg border border-line bg-surface/90 p-1 shadow-pop">
          <Tooltip label="Fullscreen" side="bottom"><IconButton aria-label="Fullscreen" onClick={toggleFullscreen}><Maximize2 size={14} /></IconButton></Tooltip>
          <Tooltip label="Leave recording mode" hint="Esc" side="bottom"><IconButton aria-label="Leave recording mode" onClick={() => setRecording(false)}><X size={14} /></IconButton></Tooltip>
        </div>
      )}

      {editor && (
        <Toolbar
          compact={recording}
          ui={ui}
          actions={{
            onTool: (name, lock) => editor.tools.set(name, { lock }),
            onUndo: () => editor.undo(),
            onRedo: () => editor.redo(),
            onClear: clearAnnotations,
            onZoomIn: () => editor.viewport.zoomBy(1.2),
            onZoomOut: () => editor.viewport.zoomBy(1 / 1.2),
            onReset: () => editor.viewport.reset(),
            onImage: () => editor.requestImage?.(),
          }}
        />
      )}

      {editor && defaults && (
        <div className={recording ? 'absolute bottom-16 left-1/2 z-10 -translate-x-1/2' : 'absolute left-[76px] top-1/2 z-10 -translate-y-1/2'}>
          <PropertyPanel
            compact={recording}
            selection={selection}
            tool={ui.tool}
            defaults={defaults}
            onApply={(changes) => editor.applyStyle(changes)}
            onDefaults={(patch) => editor.defaults.set(patch)}
          />
        </div>
      )}

      {railOpen && !recording && (
        <SectionRail
          sections={sections}
          current={section}
          busyIndex={busySection}
          canRegenerate={Boolean(editor?.getState().brief)}
          onGo={(i) => editor.goToSection(i)}
          onRegenerate={regenerate}
          onClose={() => setRailOpen(false)}
        />
      )}

      {editor && <ScrollIndicator view={view} worldH={editor.getScene().height} />}

      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
        {recording && sections.length > 0 && <SectionPill index={section} total={sections.length} title={sections[section]?.title || ''} />}
        {zoomControls}
      </div>

      <DirectBar
        open={directOpen && !recording}
        ready={aiReady}
        onClose={() => setDirectOpen(false)}
        onRun={(message) => runDirect(editor, boardApi, message)}
      />

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
