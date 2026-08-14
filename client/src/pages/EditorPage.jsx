import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlignCenterVertical,
  ArrowLeft,
  Circle,
  Copy,
  Download,
  ImageIcon,
  Keyboard,
  Layers,
  Maximize2,
  Minus,
  Moon,
  RectangleHorizontal,
  Square,
  Star,
  Sun,
  Trash2,
  Type,
} from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { useToast } from '../lib/toast.jsx';
import { useTheme } from '../lib/theme.jsx';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { EditorProvider, useEditor } from '../state/EditorContext.jsx';
import { alignOperations } from '../design/arrange.js';
import { Spinner } from '../ui/primitives.jsx';
import { Spark } from '../ui/brand.jsx';
import TopBar from '../components/editor/TopBar.jsx';
import ToolRail, { CREATION_TOOLS } from '../components/editor/ToolRail.jsx';
import Stage from '../components/editor/Stage.jsx';
import Inspector from '../components/editor/Inspector.jsx';
import LayersPanel from '../components/editor/LayersPanel.jsx';
import LibraryPanel from '../components/editor/LibraryPanel.jsx';
import AIPanel from '../components/editor/AIPanel.jsx';
import PhotoEditor from '../components/editor/PhotoEditor.jsx';
import CommandPalette from '../components/editor/CommandPalette.jsx';
import ShortcutsDialog from '../components/editor/ShortcutsDialog.jsx';

export default function EditorPage() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}

const TOOL_KEYS = { v: 'select', t: 'text', r: 'rectangle', o: 'circle', l: 'line', b: 'button', i: 'icon' };

function EditorShell() {
  const { id } = useParams();
  const location = useLocation();
  const toast = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const { state, actions } = useEditor();
  const wide = useMediaQuery('(min-width: 1100px)');

  const [name, setName] = useState('Untitled design');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [leftPanel, setLeftPanel] = useState(null); // 'library' | 'layers'
  const [rightPanel, setRightPanel] = useState('inspector'); // 'inspector' | 'ai'
  const [inspectorOpen, setInspectorOpen] = useState(false); // only used when narrow
  const [photoEditId, setPhotoEditId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const stageRef = useRef(null);
  const latest = useRef({ name, document: state.document });
  const didGenerate = useRef(false);
  const skipSave = useRef(true);

  latest.current = { name, document: state.document };
  const showRight = wide || inspectorOpen;

  /* ------------------------------- loading ------------------------------- */

  useEffect(() => {
    let active = true;
    const initialPrompt = location.state?.prompt || '';

    (async () => {
      try {
        const project = await api.getProject(id);
        if (!active) return;
        setName(project.name);
        actions.loadDocument(project.document);
        setStatus('ready');
        skipSave.current = true;

        if (initialPrompt && !didGenerate.current && (project.document.elements || []).length === 0) {
          didGenerate.current = true;
          setGenerating(true);
          try {
            const res = await api.aiChat({ message: initialPrompt, document: project.document });
            if (active && res.operations?.length) {
              actions.apply(res.operations);
              setRightPanel('ai');
            }
          } catch (err) {
            if (active) toast.error('Apollo could not draw that', err.message);
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

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ------------------------------ autosaving ----------------------------- */

  const save = useCallback(async () => {
    try {
      setSaveState('saving');
      await api.updateProject(id, { name: latest.current.name, document: latest.current.document });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }, [id]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    if (skipSave.current) {
      skipSave.current = false;
      return undefined;
    }
    // No "unsaved" flicker: the label only changes once a save is actually running.
    const timer = setTimeout(save, 1000);
    return () => clearTimeout(timer);
  }, [state.document, name, status, save]);

  /* -------------------------------- actions ------------------------------ */

  const exportDesign = useCallback(
    async (format) => {
      setExporting(true);
      try {
        const res = await api.exportDesign({ projectId: id, document: latest.current.document, format });
        // An anchor click survives popup blockers and hands the file straight to
        // the browser's downloads.
        const link = document.createElement('a');
        link.href = res.url;
        link.download = '';
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success(`Exported as ${format.toUpperCase()}`, 'Saved to your downloads');
      } catch (err) {
        toast.error('Export failed', err.message);
      } finally {
        setExporting(false);
      }
    },
    [id, toast]
  );

  const openAI = useCallback(() => {
    setRightPanel((current) => (current === 'ai' && (wide || inspectorOpen) ? 'inspector' : 'ai'));
    if (!wide) setInspectorOpen(true);
  }, [wide, inspectorOpen]);

  const openPanel = useCallback((panel) => {
    setLeftPanel(panel);
  }, []);

  const pickImageFor = useCallback(
    (elementId) => {
      if (elementId) actions.select(elementId);
      setLeftPanel('library');
    },
    [actions]
  );

  /* ------------------------------- shortcuts ----------------------------- */

  const onKey = useCallback(
    (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const ids = state.selectedIds;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        openAI();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        actions.redo();
        return;
      }

      if (typing) return;

      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        actions.selectMany(state.document.elements.filter((el) => !el.hidden).map((el) => el.id));
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        actions.setZoom(1);
        return;
      }
      if (e.shiftKey && (e.key === '!' || e.key === '1')) {
        e.preventDefault();
        stageRef.current?.fit();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault();
        actions.apply(ids.map((elementId) => ({ type: 'DUPLICATE_ELEMENT', targetId: elementId })));
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault();
        actions.apply(
          ids.map((elementId) => ({ type: 'DELETE_ELEMENT', targetId: elementId })),
          { selectIds: [] }
        );
        return;
      }
      if (e.key.startsWith('Arrow') && ids.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        actions.apply(
          state.document.elements
            .filter((el) => ids.includes(el.id))
            .map((el) => ({ type: 'MOVE_ELEMENT', targetId: el.id, changes: { x: el.x + dx, y: el.y + dy } }))
        );
        return;
      }
      if (e.key === 'Escape') {
        if (state.tool !== 'select') actions.setTool('select');
        else if (leftPanel) setLeftPanel(null);
        else actions.clearSelection();
        return;
      }
      if (mod || e.altKey) return;

      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) {
        e.preventDefault();
        actions.setTool(tool);
        return;
      }
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setLeftPanel((p) => (p === 'library' ? null : 'library'));
      }
    },
    [actions, state.selectedIds, state.document.elements, state.tool, leftPanel, save, openAI]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  /* -------------------------------- commands ----------------------------- */

  const commands = useMemo(() => {
    const selected = state.selectedIds;
    const place = (toolId) => ({
      id: `tool-${toolId}`,
      group: 'Insert',
      label: `Place ${CREATION_TOOLS.find((t) => t.id === toolId)?.label.toLowerCase()}`,
      hint: CREATION_TOOLS.find((t) => t.id === toolId)?.hint,
      icon: { text: Type, rectangle: Square, circle: Circle, line: Minus, button: RectangleHorizontal, icon: Star }[toolId],
      run: () => actions.setTool(toolId),
    });

    return [
      ...CREATION_TOOLS.map((t) => place(t.id)),
      { id: 'library', group: 'Insert', label: 'Open image library', hint: 'M', icon: ImageIcon, run: () => setLeftPanel('library') },
      { id: 'layers', group: 'Panels', label: 'Show layers', icon: Layers, run: () => setLeftPanel('layers') },
      { id: 'ai', group: 'Panels', label: 'Ask Apollo', hint: '⌘J', icon: Spark, run: openAI },
      {
        id: 'align-center',
        group: 'Arrange',
        label: 'Centre on canvas',
        icon: AlignCenterVertical,
        disabled: selected.length === 0,
        run: () => {
          const els = state.document.elements.filter((el) => selected.includes(el.id));
          actions.apply([
            ...alignOperations(els, state.document.canvas, 'center'),
            ...alignOperations(els, state.document.canvas, 'middle'),
          ]);
        },
      },
      {
        id: 'duplicate',
        group: 'Arrange',
        label: 'Duplicate selection',
        hint: '⌘D',
        icon: Copy,
        disabled: selected.length === 0,
        run: () => actions.apply(selected.map((elementId) => ({ type: 'DUPLICATE_ELEMENT', targetId: elementId }))),
      },
      {
        id: 'delete',
        group: 'Arrange',
        label: 'Delete selection',
        hint: '⌫',
        icon: Trash2,
        disabled: selected.length === 0,
        run: () => actions.apply(selected.map((elementId) => ({ type: 'DELETE_ELEMENT', targetId: elementId })), { selectIds: [] }),
      },
      { id: 'fit', group: 'View', label: 'Fit to screen', hint: '⇧1', icon: Maximize2, run: () => stageRef.current?.fit() },
      { id: 'zoom-100', group: 'View', label: 'Zoom to 100%', hint: '⌘0', icon: Maximize2, run: () => actions.setZoom(1) },
      {
        id: 'theme',
        group: 'View',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? Sun : Moon,
        run: toggleTheme,
      },
      { id: 'export-png', group: 'Export', label: 'Export PNG', icon: Download, run: () => exportDesign('png') },
      { id: 'export-jpg', group: 'Export', label: 'Export JPG', icon: Download, run: () => exportDesign('jpg') },
      { id: 'export-webp', group: 'Export', label: 'Export WebP', icon: Download, run: () => exportDesign('webp') },
      { id: 'shortcuts', group: 'Help', label: 'Keyboard shortcuts', hint: '?', icon: Keyboard, run: () => setShortcutsOpen(true) },
    ];
  }, [actions, state.selectedIds, state.document, theme, toggleTheme, exportDesign, openAI]);

  /* -------------------------------- render ------------------------------- */

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center gap-2.5 text-[13px] text-ink-3">
        <Spinner /> Opening design…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-lg font-semibold">This design didn’t open</p>
        <p className="max-w-[42ch] text-[13px] text-ink-2">{error}</p>
        <Link
          to="/"
          className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-raised"
        >
          <ArrowLeft size={14} /> Back to your designs
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <TopBar
        name={name}
        onRename={setName}
        saveState={saveState}
        exporting={exporting}
        onExport={exportDesign}
        onAskApollo={openAI}
        aiOpen={rightPanel === 'ai' && showRight}
        onShortcuts={() => setShortcutsOpen(true)}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
        compact={!wide}
      />

      <div className="relative flex min-h-0 flex-1">
        <ToolRail panel={leftPanel} onPanel={openPanel} />

        {leftPanel && (
          <div
            className={cx(
              'w-[264px] shrink-0 animate-slide-in-left border-r border-line bg-surface',
              !wide && 'absolute inset-y-0 left-[52px] z-30 shadow-pop'
            )}
          >
            {leftPanel === 'layers' ? (
              <LayersPanel onClose={() => setLeftPanel(null)} />
            ) : (
              <LibraryPanel projectId={id} onClose={() => setLeftPanel(null)} />
            )}
          </div>
        )}

        <Stage ref={stageRef} onEditImage={setPhotoEditId} onPickImage={pickImageFor} />

        {showRight && (
          <div className={cx('animate-slide-in-right', !wide && 'absolute inset-y-0 right-0 z-30 shadow-pop')}>
            {rightPanel === 'ai' ? (
              <AIPanel onClose={() => (wide ? setRightPanel('inspector') : setInspectorOpen(false))} />
            ) : (
              <Inspector onEditImage={setPhotoEditId} onPickImage={pickImageFor} />
            )}
          </div>
        )}
      </div>

      {photoEditId && <PhotoEditor elementId={photoEditId} onClose={() => setPhotoEditId(null)} />}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {generating && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center">
          <div className="scrim absolute inset-0 animate-fade-in" />
          <div className="relative flex animate-rise items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4 shadow-pop">
            <Spark size={16} className="animate-pulse text-accent" />
            <div>
              <p className="text-[13px] font-medium text-ink">Apollo is drawing your design</p>
              <p className="mt-0.5 text-xs text-ink-3">Every layer will be editable.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
