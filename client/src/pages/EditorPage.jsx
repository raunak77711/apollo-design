import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  AlignCenterVertical,
  ArrowLeft,
  Copy,
  Download,
  FolderPlus,
  Grid3x3,
  Hand,
  ImageIcon,
  Keyboard,
  Layers,
  LayoutTemplate,
  Maximize2,
  Moon,
  Pipette,
  SlidersHorizontal,
  Sun,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { useToast } from '../lib/toast.jsx';
import { useTheme } from '../lib/theme.jsx';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { EditorProvider, useEditor } from '../state/EditorContext.jsx';
import { useLayerActions } from '../state/useLayerActions.js';
import { alignOperations } from '../design/arrange.js';
import { expandWithDescendants, indexById, topLevelOf } from '../design/tree.js';
import { Spinner } from '../ui/primitives.jsx';
import { Spark } from '../ui/brand.jsx';
import TopBar from '../components/editor/TopBar.jsx';
import ToolRail, { CREATION_TOOLS } from '../components/editor/ToolRail.jsx';
import TemplatesPanel from '../components/editor/TemplatesPanel.jsx';
import Stage from '../components/editor/Stage.jsx';
import RightPanel from '../components/editor/RightPanel.jsx';
import LibraryPanel from '../components/editor/LibraryPanel.jsx';
import AIPanel from '../components/editor/AIPanel.jsx';
import PhotoEditor from '../components/editor/PhotoEditor.jsx';
import CommandPalette from '../components/editor/CommandPalette.jsx';
import ShortcutsDialog from '../components/editor/ShortcutsDialog.jsx';
import OnboardingOverlay from '../ui/onboarding.jsx';

export default function EditorPage() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}

const TOOL_KEYS = {
  v: 'select', h: 'hand', t: 'text', r: 'rectangle', o: 'circle',
  p: 'polygon', s: 'star', l: 'line', b: 'button', i: 'icon',
};

/** Which property a sampled colour belongs to, per element type. */
const COLOUR_KEY = {
  text: 'color', icon: 'color', button: 'background', line: 'stroke',
  rectangle: 'fill', circle: 'fill', polygon: 'fill', star: 'fill',
};

function EditorShell() {
  const { id } = useParams();
  const location = useLocation();
  const toast = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const { state, actions } = useEditor();
  const layers = useLayerActions();
  const wide = useMediaQuery('(min-width: 1100px)');

  const [name, setName] = useState('Untitled design');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [leftPanel, setLeftPanel] = useState(null); // 'library' | 'templates'
  const [rightPanel, setRightPanel] = useState('inspector'); // 'inspector' | 'ai'
  const [rightTab, setRightTab] = useState('properties'); // 'properties' | 'layers'
  const [renamingId, setRenamingId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false); // only used when narrow
  const [photoEditId, setPhotoEditId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const stageRef = useRef(null);
  const latest = useRef({ name, document: state.document });
  const didGenerate = useRef(false);
  const skipSave = useRef(true);
  const clipboard = useRef(null); // { rootIds, elements } — in-memory, per tab

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

  /** Brings the right column back to a given tab, opening it if it is closed. */
  const openTab = useCallback(
    (tab) => {
      setRightTab(tab);
      setRightPanel('inspector');
      if (!wide) setInspectorOpen(true);
    },
    [wide]
  );

  const pickImageFor = useCallback(
    (elementId) => {
      if (elementId) actions.select(elementId);
      setLeftPanel('library');
    },
    [actions]
  );

  /**
   * Samples a colour from anywhere on screen and drops it where it belongs for
   * whatever is selected — text colour, button fill, stroke — or the canvas
   * background when nothing is. Chromium-only, so the tool is offered only
   * where the browser can actually deliver it.
   */
  const sampleColour = useCallback(async () => {
    if (!('EyeDropper' in window)) return;
    let picked;
    try {
      ({ sRGBHex: picked } = await new window.EyeDropper().open());
    } catch {
      return; // dismissed
    }
    const targets = state.document.elements
      .filter((el) => state.selectedIds.includes(el.id) && COLOUR_KEY[el.type]);
    if (targets.length === 0) {
      actions.apply([{ type: 'SET_CANVAS', changes: { background: picked } }]);
      toast.success('Canvas background updated', picked.toUpperCase());
      return;
    }
    actions.apply(
      targets.map((el) => ({ type: 'UPDATE_ELEMENT', targetId: el.id, changes: { [COLOUR_KEY[el.type]]: picked } }))
    );
  }, [actions, state.document.elements, state.selectedIds, toast]);

  const startRename = useCallback(
    (layerId) => {
      openTab('layers');
      setRenamingId(layerId);
    },
    [openTab]
  );

  /**
   * Copy/paste works on the whole subtree under the selection (a group brings
   * its children) so pasting never orphans a layer. Paste offsets everything by
   * the same amount, which keeps nested layers exactly where they were relative
   * to their group.
   */
  const copySelection = useCallback(() => {
    const ids = state.selectedIds;
    if (ids.length === 0) return false;
    const elements = state.document.elements;
    const fullIds = expandWithDescendants(elements, ids);
    const byId = indexById(elements);
    clipboard.current = {
      rootIds: topLevelOf(elements, ids),
      elements: fullIds.map((id) => JSON.parse(JSON.stringify(byId.get(id)))),
    };
    return true;
  }, [state.document.elements, state.selectedIds]);

  const pasteClipboard = useCallback(() => {
    const clip = clipboard.current;
    if (!clip || clip.elements.length === 0) return;
    const OFFSET = 24;
    const idMap = new Map(clip.elements.map((el) => [el.id, `${el.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`]));
    const topZ = Math.max(0, 0, ...state.document.elements.filter((e) => !e.parentId).map((e) => e.zIndex || 0));
    let rootCount = 0;
    const newRootIds = [];

    const operations = clip.elements.map((el) => {
      const newId = idMap.get(el.id);
      const isRoot = clip.rootIds.includes(el.id);
      const parentId = el.parentId && idMap.has(el.parentId) ? idMap.get(el.parentId) : null;
      if (isRoot) newRootIds.push(newId);

      const element = { ...el, id: newId, x: el.x + OFFSET, y: el.y + OFFSET };
      if (parentId) element.parentId = parentId;
      else delete element.parentId;
      if (isRoot && !parentId) element.zIndex = topZ + 1 + rootCount++;
      if (element.type === 'group' && Array.isArray(element.children)) {
        element.children = element.children.map((cid) => idMap.get(cid)).filter(Boolean);
      }
      return { type: 'CREATE_ELEMENT', element };
    });

    actions.apply(operations, { selectIds: newRootIds });
  }, [actions, state.document.elements]);

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
        actions.selectMany(
          state.document.elements.filter((el) => !el.hidden && !el.parentId).map((el) => el.id)
        );
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

      /* --- layer commands --------------------------------------------- */

      if (mod && e.key.toLowerCase() === 'g' && ids.length) {
        e.preventDefault();
        if (e.shiftKey) layers.ungroup();
        else layers.group();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'h' && ids.length) {
        e.preventDefault();
        layers.toggleHidden();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'l' && ids.length) {
        e.preventDefault();
        layers.toggleLocked();
        return;
      }
      if ((e.key === ']' || e.key === '[') && ids.length) {
        e.preventDefault();
        const forward = e.key === ']';
        layers.arrange(mod ? (forward ? 'front' : 'back') : forward ? 'forward' : 'backward');
        return;
      }
      if (e.key === 'F2' && ids.length === 1) {
        e.preventDefault();
        startRename(ids[0]);
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault();
        layers.duplicate();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault();
        layers.remove();
        return;
      }
      if (mod && e.key.toLowerCase() === 'c' && ids.length) {
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === 'x' && ids.length) {
        e.preventDefault();
        if (copySelection()) layers.remove();
        return;
      }
      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
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
        setLeftPanel((panel) => (panel === 'library' ? null : 'library'));
        return;
      }
      if (e.key.toLowerCase() === 'c' && 'EyeDropper' in window) {
        e.preventDefault();
        sampleColour();
      }
    },
    [actions, layers, state.selectedIds, state.document.elements, state.tool, leftPanel, save, openAI, startRename, sampleColour, copySelection, pasteClipboard]
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  /* -------------------------------- commands ----------------------------- */

  const commands = useMemo(() => {
    const selected = state.selectedIds;

    return [
      ...CREATION_TOOLS.map((tool) => ({
        id: `tool-${tool.id}`,
        group: 'Insert',
        label: `Place ${tool.label.toLowerCase()}`,
        hint: tool.hint,
        icon: tool.icon,
        run: () => actions.setTool(tool.id),
      })),
      { id: 'library', group: 'Insert', label: 'Open image library', hint: 'M', icon: ImageIcon, run: () => setLeftPanel('library') },
      { id: 'templates', group: 'Insert', label: 'Browse templates', icon: LayoutTemplate, run: () => setLeftPanel('templates') },
      { id: 'layers', group: 'Panels', label: 'Show layers', icon: Layers, run: () => openTab('layers') },
      { id: 'properties', group: 'Panels', label: 'Show properties', icon: SlidersHorizontal, run: () => openTab('properties') },
      { id: 'ai', group: 'Panels', label: 'Ask Apollo', hint: '⌘J', icon: Spark, run: openAI },
      {
        id: 'group',
        group: 'Arrange',
        label: 'Group selection',
        hint: '⌘G',
        icon: FolderPlus,
        disabled: !layers.canGroup(),
        run: () => layers.group(),
      },
      {
        id: 'ungroup',
        group: 'Arrange',
        label: 'Ungroup selection',
        hint: '⇧⌘G',
        icon: Ungroup,
        disabled: !layers.canUngroup(),
        run: () => layers.ungroup(),
      },
      {
        id: 'align-center',
        group: 'Arrange',
        label: 'Centre on canvas',
        icon: AlignCenterVertical,
        disabled: selected.length === 0,
        run: () => {
          const els = state.document.elements.filter((el) => selected.includes(el.id));
          actions.apply([
            ...alignOperations(els, state.document.canvas, 'center', 'canvas'),
            ...alignOperations(els, state.document.canvas, 'middle', 'canvas'),
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
        run: () => layers.duplicate(),
      },
      {
        id: 'delete',
        group: 'Arrange',
        label: 'Delete selection',
        hint: '⌫',
        icon: Trash2,
        disabled: selected.length === 0,
        run: () => layers.remove(),
      },
      ...('EyeDropper' in window
        ? [{ id: 'eyedropper', group: 'Arrange', label: 'Pick a colour from the screen', hint: 'C', icon: Pipette, run: sampleColour }]
        : []),
      { id: 'hand', group: 'View', label: 'Hand tool', hint: 'H', icon: Hand, run: () => actions.setTool('hand') },
      { id: 'fit', group: 'View', label: 'Fit to screen', hint: '⇧1', icon: Maximize2, run: () => stageRef.current?.fit() },
      { id: 'zoom-100', group: 'View', label: 'Zoom to 100%', hint: '⌘0', icon: Maximize2, run: () => actions.setZoom(1) },
      {
        id: 'grid',
        group: 'View',
        label: state.view.grid ? 'Hide grid' : 'Show grid',
        icon: Grid3x3,
        run: () => actions.setView({ grid: !state.view.grid }),
      },
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
  }, [actions, layers, state.selectedIds, state.document, state.view, theme, toggleTheme, exportDesign, openAI, openTab, sampleColour]);

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
        <ToolRail
          libraryOpen={leftPanel === 'library'}
          onLibrary={() => setLeftPanel((panel) => (panel === 'library' ? null : 'library'))}
          templatesOpen={leftPanel === 'templates'}
          onTemplates={() => setLeftPanel((panel) => (panel === 'templates' ? null : 'templates'))}
          layersOpen={rightTab === 'layers' && rightPanel === 'inspector' && showRight}
          onLayers={() => openTab(rightTab === 'layers' ? 'properties' : 'layers')}
          onSampleColour={'EyeDropper' in window ? sampleColour : undefined}
        />

        {leftPanel && (
          <div
            className={cx(
              'w-[264px] shrink-0 animate-slide-in-left border-r border-line bg-surface',
              !wide && 'absolute inset-y-0 left-[52px] z-30 shadow-pop'
            )}
          >
            {leftPanel === 'templates' ? (
              <TemplatesPanel onClose={() => setLeftPanel(null)} />
            ) : (
              <LibraryPanel projectId={id} onClose={() => setLeftPanel(null)} />
            )}
          </div>
        )}

        <Stage ref={stageRef} onEditImage={setPhotoEditId} onPickImage={pickImageFor} />

        {showRight && (
          <div className={cx('animate-slide-in-right', !wide && 'absolute inset-y-0 right-0 z-30 shadow-pop')}>
            {rightPanel === 'ai' ? (
              <AIPanel
                onClose={() => (wide ? setRightPanel('inspector') : setInspectorOpen(false))}
                onShowLayers={() => openTab('layers')}
              />
            ) : (
              <RightPanel
                tab={rightTab}
                onTab={setRightTab}
                renamingId={renamingId}
                onRenaming={setRenamingId}
                onEditImage={setPhotoEditId}
                onPickImage={pickImageFor}
                onAskApollo={openAI}
                onClose={wide ? undefined : () => setInspectorOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {photoEditId && <PhotoEditor elementId={photoEditId} onClose={() => setPhotoEditId(null)} />}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {generating && <OnboardingOverlay />}
    </div>
  );
}
