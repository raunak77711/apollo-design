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
  Shapes,
  SlidersHorizontal,
  Sun,
  Trash2,
  Type,
  Ungroup,
  Upload,
} from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { useToast } from '../lib/toast.jsx';
import { useTheme } from '../lib/theme.jsx';
import { useLocalState } from '../lib/useLocalState.js';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { EditorProvider, useEditor } from '../state/EditorContext.jsx';
import { useLayerActions } from '../state/useLayerActions.js';
import { alignOperations } from '../design/arrange.js';
import { expandWithDescendants, indexById, topLevelOf } from '../design/tree.js';
import { defaultPropertiesFor } from '../design/schema.js';
import { newElementId } from '../design/operations.js';
import { Spinner } from '../ui/primitives.jsx';
import { Spark } from '../ui/brand.jsx';
import TopBar from '../components/editor/TopBar.jsx';
import ToolRail, { CREATION_TOOLS } from '../components/editor/ToolRail.jsx';
import TemplatesPanel from '../components/editor/TemplatesPanel.jsx';
import Stage from '../components/editor/Stage.jsx';
import RightDock from '../components/editor/RightPanel.jsx';
import PropertiesPanel from '../components/editor/PropertiesPanel.jsx';
import LibraryPanel from '../components/editor/LibraryPanel.jsx';
import AIPanel from '../components/editor/AIPanel.jsx';
import PhotoEditor from '../components/editor/PhotoEditor.jsx';
import DrawStudio from '../components/editor/DrawStudio.jsx';
import CropPanel from '../components/editor/CropPanel.jsx';
import FiltersPanel from '../components/editor/FiltersPanel.jsx';
import TextsPanel from '../components/editor/TextsPanel.jsx';
import CommandPalette from '../components/editor/CommandPalette.jsx';
import ShortcutsDialog from '../components/editor/ShortcutsDialog.jsx';
import GenerationScene from '../components/generation/GenerationScene.jsx';
import { useGenerationStages } from '../components/generation/useGenerationStages.js';

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
  // 'idle' → 'running' (the moon is up) → 'settling' (the design is on the
  // canvas and the scene is clearing) → 'idle'.
  const [generating, setGenerating] = useState('idle');
  const [exporting, setExporting] = useState(false);
  const stages = useGenerationStages();

  // Left flyout: 'texts' | 'library' | 'templates' | 'crop' | 'filters' | 'properties'
  const [leftPanel, setLeftPanel] = useState(null);
  const [libraryTab, setLibraryTab] = useState('shapes'); // 'shapes' | 'icons' | 'photos' | 'uploads'
  // The right dock's one tab: 'layers' | 'ai' | null (closed). Mutually
  // exclusive by construction — there is only ever one value here.
  const [rightPanel, setRightPanel] = useLocalState('apollo.rightPanel', 'layers');
  const [renamingId, setRenamingId] = useState(null);
  const [inspectorOpen, setInspectorOpen] = useState(false); // only used when narrow
  const [photoEditId, setPhotoEditId] = useState(null);
  const [photoEditView, setPhotoEditView] = useState('adjust');
  const [drawStudioId, setDrawStudioId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const stageRef = useRef(null);
  const latest = useRef({ name, document: state.document });
  const didGenerate = useRef(false);
  const settle = useRef(null); // the beat between "ready" and the reveal
  const skipSave = useRef(true);
  const clipboard = useRef(null); // { rootIds, elements } — in-memory, per tab

  latest.current = { name, document: state.document };

  /* The right column shows at all only when a tab is open — closing the
     active tab gives its width back to the canvas, which is the point of
     putting the toggles on the rail. */
  const rightRoom = wide || inspectorOpen;
  const showRight = rightRoom && rightPanel !== null;
  const railRightPanel = showRight ? rightPanel : null;
  // Which rail button the open flyout belongs to.
  const railPanel =
    leftPanel === 'library'
      ? libraryTab === 'shapes'
        ? 'shapes'
        : libraryTab === 'uploads'
          ? 'uploads'
          : 'images'
      : leftPanel;

  /* ------------------------------- loading ------------------------------- */

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const initialPrompt = location.state?.prompt || '';
    const initialReferenceImages = location.state?.referenceImages || [];
    const initialPreferences = location.state?.preferences || null;

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
          setGenerating('running');
          try {
            // Streamed so the moon scene can narrate the real pipeline; falls
            // back to the plain endpoint by itself if the stream is unavailable.
            const res = await api.aiGenerateStream(
              {
                message: initialPrompt,
                document: project.document,
                referenceImages: initialReferenceImages,
                preferences: initialPreferences,
              },
              { onStage: stages.push, signal: abort.signal }
            );
            if (!active) return;
            if (res.operations?.length) {
              actions.apply(res.operations);
              setRightPanel('ai');
              // A stock-photo fallback is a quality note, not something the user
              // can act on — console only, so it never interrupts the reveal.
              if (res.imageNotice) console.warn(`[apollo] ${res.imageNotice}`);
            }
            // The design lands under the scene, which holds on "ready" for a
            // beat and then clears to reveal it — a handover, not a cut.
            stages.finish();
            settle.current = setTimeout(() => setGenerating('settling'), 700);
          } catch (err) {
            if (!active || err.name === 'AbortError') return;
            toast.error('Apollo could not draw that', err.message);
            setGenerating('idle');
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
      abort.abort();
      clearTimeout(settle.current);
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

  /** The Layers rail button, F7, and the dock header's close all share this:
      open Layers if something else (or nothing) is showing, otherwise close
      the column outright. */
  const showLayers = useCallback(() => {
    const isOpen = wide || inspectorOpen;
    if (!wide) setInspectorOpen(!isOpen || rightPanel !== 'layers');
    setRightPanel(isOpen && rightPanel === 'layers' ? null : 'layers');
  }, [wide, inspectorOpen, rightPanel, setRightPanel]);

  /** Reveals Layers without ever closing it — for commands that need it. */
  const revealLayers = useCallback(() => {
    setRightPanel('layers');
    if (!wide) setInspectorOpen(true);
  }, [wide, setRightPanel]);

  /** Ask Apollo's own button is the way back to Layers once Apollo is open —
      a two-way swap, not open-then-close, which is why it never fully shuts
      the column the way the Layers button does. */
  const toggleApollo = useCallback(() => {
    if (!wide) setInspectorOpen(true);
    setRightPanel((current) => (current === 'ai' ? 'layers' : 'ai'));
  }, [wide, setRightPanel]);

  /** Rail flyouts. The three library buttons share one panel, on their own tab. */
  const openRailPanel = useCallback(
    (panel) => {
      // Text arms the place-on-click tool as well as opening its styles, so
      // the rail button and the T shortcut mean the same thing.
      if (panel === 'texts') {
        const opening = leftPanel !== 'texts';
        setLeftPanel(opening ? 'texts' : null);
        actions.setTool(opening ? 'text' : 'select');
        return;
      }
      if (panel === 'shapes' || panel === 'images' || panel === 'uploads') {
        if (leftPanel === 'library' && railPanel === panel) {
          setLeftPanel(null);
          return;
        }
        setLibraryTab(panel === 'images' ? 'photos' : panel);
        setLeftPanel('library');
        return;
      }
      setLeftPanel((current) => (current === panel ? null : panel));
    },
    [actions, leftPanel, railPanel]
  );

  const pickImageFor = useCallback(
    (elementId) => {
      if (elementId) actions.select(elementId);
      setLibraryTab('photos');
      setLeftPanel('library');
    },
    [actions]
  );

  /** Draws on the selected image if there is one, otherwise starts a fresh blank layer. */
  const openDraw = useCallback(
    (elementId) => {
      if (elementId) {
        setDrawStudioId(elementId);
        return;
      }
      const selected = state.document.elements.find((el) => state.selectedIds.includes(el.id) && el.type === 'image');
      if (selected) {
        setDrawStudioId(selected.id);
        return;
      }
      const canvas = state.document.canvas;
      const width = Math.round(Math.min(canvas.width * 0.6, 640));
      const height = Math.round(width * 0.7);
      const id = newElementId('image');
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
              properties: { ...defaultPropertiesFor('image'), src: '' },
            },
          },
        ],
        { selectIds: [id] }
      );
      setDrawStudioId(id);
    },
    [actions, state.document, state.selectedIds]
  );

  const openAdjust = useCallback((elementId) => {
    setPhotoEditView('adjust');
    setPhotoEditId(elementId);
  }, []);

  /** Opens the photo editor straight to Retouch, for the selected image. */
  const openRetouch = useCallback(() => {
    const selected = state.document.elements.find((el) => state.selectedIds.includes(el.id) && el.type === 'image');
    if (!selected) {
      toast.error('Select an image first', 'Retouch works on an image layer.');
      return;
    }
    setPhotoEditView('retouch');
    setPhotoEditId(selected.id);
  }, [state.document.elements, state.selectedIds, toast]);

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
      revealLayers();
      setRenamingId(layerId);
    },
    [revealLayers]
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
        toggleApollo();
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
      if (e.key === 'F7') {
        e.preventDefault();
        showLayers();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        openRailPanel('properties');
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
        openRailPanel('shapes');
        return;
      }
      if (e.key.toLowerCase() === 'c' && 'EyeDropper' in window) {
        e.preventDefault();
        sampleColour();
      }
    },
    [actions, layers, state.selectedIds, state.document.elements, state.tool, leftPanel, save, toggleApollo, openRailPanel, showLayers, startRename, sampleColour, copySelection, pasteClipboard]
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
      { id: 'shapes', group: 'Insert', label: 'Shapes', hint: 'M', icon: Shapes, run: () => openRailPanel('shapes') },
      { id: 'images', group: 'Insert', label: 'Images and icons', icon: ImageIcon, run: () => openRailPanel('images') },
      { id: 'uploads', group: 'Insert', label: 'Upload an image', icon: Upload, run: () => openRailPanel('uploads') },
      { id: 'texts', group: 'Insert', label: 'Text styles', icon: Type, run: () => openRailPanel('texts') },
      { id: 'templates', group: 'Insert', label: 'Browse templates', icon: LayoutTemplate, run: () => setLeftPanel('templates') },
      { id: 'layers', group: 'Panels', label: 'Show layers', hint: 'F7', icon: Layers, run: revealLayers },
      { id: 'properties', group: 'Panels', label: 'Show properties', hint: 'F8', icon: SlidersHorizontal, run: () => openRailPanel('properties') },
      { id: 'ai', group: 'Panels', label: 'Ask Apollo', hint: '⌘J', icon: Spark, run: toggleApollo },
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
  }, [actions, layers, state.selectedIds, state.document, state.view, theme, toggleTheme, exportDesign, toggleApollo, revealLayers, openRailPanel, sampleColour]);

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
        onShortcuts={() => setShortcutsOpen(true)}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
        compact={!wide}
      />

      <div className="relative flex min-h-0 flex-1">
        <ToolRail
          panel={railPanel}
          onPanel={openRailPanel}
          rightPanel={railRightPanel}
          onShowLayers={showLayers}
          onToggleApollo={toggleApollo}
          onRetouch={openRetouch}
          onDraw={() => openDraw()}
          onSampleColour={'EyeDropper' in window ? sampleColour : undefined}
        />

        {/* Draw takes the row Stage normally occupies — TopBar and the rail
            stay put, so it reads as a tab, not a separate page. */}
        {drawStudioId ? (
          <DrawStudio elementId={drawStudioId} onClose={() => setDrawStudioId(null)} />
        ) : (
          <>
            {leftPanel && (
              <div
                className={cx(
                  'flex w-[268px] shrink-0 animate-slide-in-left flex-col border-r border-line bg-surface',
                  !wide && 'absolute inset-y-0 left-12 z-30 shadow-pop'
                )}
              >
                {leftPanel === 'templates' && <TemplatesPanel onClose={() => setLeftPanel(null)} />}
                {leftPanel === 'library' && (
                  <LibraryPanel
                    projectId={id}
                    tab={libraryTab}
                    onTab={setLibraryTab}
                    onClose={() => setLeftPanel(null)}
                  />
                )}
                {leftPanel === 'crop' && <CropPanel onClose={() => setLeftPanel(null)} />}
                {leftPanel === 'filters' && <FiltersPanel onClose={() => setLeftPanel(null)} />}
                {leftPanel === 'texts' && <TextsPanel onClose={() => setLeftPanel(null)} />}
                {leftPanel === 'properties' && (
                  <PropertiesPanel
                    onClose={() => setLeftPanel(null)}
                    onEditImage={openAdjust}
                    onPickImage={pickImageFor}
                    onDraw={openDraw}
                  />
                )}
              </div>
            )}

            <Stage ref={stageRef} onEditImage={openAdjust} onPickImage={pickImageFor} />

            {showRight && (
              <div className={cx('animate-slide-in-right', !wide && 'absolute inset-y-0 right-0 z-30 shadow-pop')}>
                {rightPanel === 'ai' ? (
                  <AIPanel
                    onClose={() => (wide ? setRightPanel('layers') : setInspectorOpen(false))}
                    onShowLayers={revealLayers}
                  />
                ) : (
                  <RightDock
                    renamingId={renamingId}
                    onRenaming={setRenamingId}
                    onClose={wide ? undefined : () => setInspectorOpen(false)}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {photoEditId && (
        <PhotoEditor
          elementId={photoEditId}
          initialView={photoEditView}
          onClose={() => {
            setPhotoEditId(null);
            setPhotoEditView('adjust');
          }}
        />
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {generating !== 'idle' && (
        <GenerationScene
          stage={stages.stage}
          open={generating === 'running'}
          onExited={() => setGenerating('idle')}
        />
      )}
    </div>
  );
}
