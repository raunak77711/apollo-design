import { sectionAt } from '../state/anchor.js';
import { applyOperation, isViewOp } from '../state/boardState.js';
import { createHistory } from '../state/history.js';
import { isAnnotationId, newAnnotationId } from '../state/ids.js';
import { styleToFabric } from '../state/styleMap.js';
import { layoutBoard } from '../engine/layoutBoard.js';
import { createFabricMeasure } from '../engine/measure.js';
import { overrideFromGesture } from '../engine/overrides.js';
import { PAPER } from '../engine/theme.js';
import { worldYAtCenter } from '../engine/viewportMath.js';
import { createDefaults } from '../tools/defaults.js';
import { createTools } from '../tools/index.js';
import { createToolManager } from '../tools/toolManager.js';
import { nearestPoint, rectSnapPoints } from '../tools/util.js';
import { applyTraits, createAnnotationSync, recordFromObject } from './annotationSync.js';
import { registerLineArrow } from './LineArrow.js';
import { createRenderer } from './renderer.js';
import { createViewportController } from './viewportController.js';

const SNAP_PX = 15;
const OVERRIDE_DEFAULTS = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, angle: 0 };
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b);

/** Selection handles that read as part of the recording tool rather than as browser chrome. */
function styleControls(fabric) {
  fabric.Object.prototype.set({
    transparentCorners: false, cornerColor: '#ffffff', cornerStrokeColor: '#1d4ed8', borderColor: '#1d4ed8',
    cornerStyle: 'circle', cornerSize: 11, borderScaleFactor: 2, padding: 4,
  });
}

/**
 * The board's editor: one Fabric canvas, the immutable board state, and the
 * only place the two are reconciled.
 *
 *   gesture / toolbar / Direct mode ──► dispatch(op) ──► state ──► reconcile ──► canvas
 *
 * A gesture on the canvas is committed *after* it finishes (`object:modified`),
 * turned into an operation, and the resulting state is reconciled back. Objects
 * remember the record they were made from (`__rec`) so reconciling a change
 * that started on the canvas does not tear down the object being edited.
 */
export function createEditor({ fabric, canvasEl, container, state, hooks = {} }) {
  registerLineArrow(fabric);
  styleControls(fabric);

  const measure = createFabricMeasure(fabric);
  const canvas = new fabric.Canvas(canvasEl, {
    width: container.clientWidth || 800,
    height: container.clientHeight || 600,
    backgroundColor: PAPER,
    selection: true,
    preserveObjectStacking: true,
    stopContextMenu: true,
    targetFindTolerance: 6,
  });

  let current = state;
  let scene = layoutBoard(current.spec, measure);
  const history = createHistory(100);
  const editor = {};

  /* ------------------------------ snapping ------------------------------ */

  function snapPoint(x, y, ignore) {
    const points = [];
    for (const obj of canvas.getObjects()) {
      if (obj === ignore || obj.visible === false || !obj.data || obj.type === 'lineArrow' || obj.type === 'line') continue;
      const r = obj.getBoundingRect(true, true);
      points.push(...rectSnapPoints(r));
    }
    return nearestPoint(points, x, y, SNAP_PX / viewport.view.zoom) || { x, y };
  }

  /* ------------------------------- parts ------------------------------- */

  const sync = createAnnotationSync(fabric, canvas, {
    onCreate: (obj) => {
      if (obj.type === 'lineArrow') obj.snap = snapPoint;
    },
  });
  const renderer = createRenderer(fabric, canvas, { objectById: (id) => sync.objectOf(id) });

  const sectionIndexAtCenter = () =>
    sectionAt(scene.sections, worldYAtCenter(viewport.view, container.clientHeight)).index;

  const viewport = createViewportController({
    canvas,
    container,
    getWorld: () => scene,
    onChange: (view) => {
      // The camera is remembered with the board but is not an edit: no history, no reconcile.
      current = { ...current, view: { zoom: view.zoom, x: view.x, y: view.y } };
      hooks.onView?.(view, sectionIndexAtCenter());
    },
  });

  /* ------------------------------ selection ----------------------------- */

  const objectForId = (id) => (isAnnotationId(id) ? sync.objectOf(id) : renderer.objectOf(id));
  const selectionIds = () => canvas.getActiveObjects().map((o) => o.data?.id).filter(Boolean);

  function getSelection() {
    return canvas.getActiveObjects()
      .filter((o) => o.data)
      .map((obj) => ({ obj, id: obj.data.id, kind: obj.data.kind, ann: obj.data.ann, type: obj.type }));
  }

  function restoreSelection(ids) {
    if (!ids.length) return;
    const objs = ids.map(objectForId).filter((o) => o && o.visible !== false);
    const active = canvas.getActiveObjects();
    if (objs.length === active.length && objs.every((o) => active.includes(o))) return;
    canvas.discardActiveObject();
    if (objs.length === 1) canvas.setActiveObject(objs[0]);
    else if (objs.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
  }

  function select(ids) {
    const objs = ids.map(objectForId).filter(Boolean);
    canvas.discardActiveObject();
    if (objs.length === 1) canvas.setActiveObject(objs[0]);
    else if (objs.length > 1) canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas }));
    canvas.requestRenderAll();
  }

  /* -------------------------------- state ------------------------------- */

  function relayout() {
    scene = layoutBoard(current.spec, measure);
    canvas.discardActiveObject();
    renderer.rebuild(scene, current);
    sync.rebuildAll(current, scene.sections);
    viewport.resize(); // the world's height may have changed
  }

  function reconcile(prev, next) {
    if (prev.spec !== next.spec) {
      relayout();
      return;
    }
    if (prev.overrides !== next.overrides || prev.connections !== next.connections) renderer.patch(next);
    if (prev.annotations !== next.annotations) sync.reconcile(next, scene.sections);
    canvas.requestRenderAll();
  }

  function notify(fromCanvas = false, viewOnly = false) {
    hooks.onState?.(current, { canUndo: history.canUndo, canRedo: history.canRedo, viewOnly, fromCanvas });
  }

  function dispatch(input, { record = true, coalesce = null, fromCanvas = false } = {}) {
    const ops = Array.isArray(input) ? input : [input];
    let next = current;
    for (const op of ops) next = applyOperation(next, op);
    if (next === current) return false;

    const viewOnly = ops.every(isViewOp);
    if (record && !viewOnly) history.record(current, coalesce);
    const prev = current;
    current = next;
    const keep = fromCanvas ? [] : selectionIds();
    reconcile(prev, next);
    restoreSelection(keep);
    if (prev.view !== next.view && next.view && !fromCanvas) viewport.set(next.view, { notify: false });
    notify(fromCanvas, viewOnly);
    return true;
  }

  function swapTo(next) {
    const before = current;
    current = { ...next, view: before.view };
    canvas.discardActiveObject();
    reconcile(before, current);
    notify();
  }

  function undo() {
    const previous = history.undo(current);
    if (!previous) return false;
    swapTo(previous);
    return true;
  }

  function redo() {
    const next = history.redo(current);
    if (!next) return false;
    swapTo(next);
    return true;
  }

  /* ------------------------ committing canvas gestures ------------------ */

  function overrideOp(obj) {
    const item = renderer.itemOf(obj.data.id);
    if (!item) return null;
    const d = fabric.util.qrDecompose(obj.calcTransformMatrix());
    const patch = overrideFromGesture(
      item,
      { cx: d.translateX, cy: d.translateY, scaleX: d.scaleX, scaleY: d.scaleY, angle: d.angle, w: item.kind === 'text' ? obj.width : undefined },
      renderer.context()
    );
    if (item.kind === 'text' && typeof obj.text === 'string' && obj.text !== item.text) patch.text = obj.text;
    const existing = current.overrides[item.id] || {};
    const changed = Object.keys(patch).some((k) => !same(existing[k] ?? OVERRIDE_DEFAULTS[k] ?? (k === 'w' ? item.w : undefined), patch[k]));
    return changed ? { type: 'OVERRIDE_SET', id: item.id, patch } : null;
  }

  /** Turn finished canvas objects into operations. Idempotent: an unchanged object records nothing. */
  function commitObjects(objs, { coalesce = null } = {}) {
    const ops = [];
    for (const obj of objs) {
      const kind = obj?.data?.kind;
      if (kind === 'annotation') {
        const { record, assets } = recordFromObject(obj, scene.sections);
        const before = obj.__rec;
        if (before && before.section === record.section && JSON.stringify(before.json) === JSON.stringify(record.json)) continue;
        obj.__rec = record;
        if (!before) sync.adopt(obj, record);
        ops.push({ type: before ? 'ANNOTATION_UPDATE' : 'ANNOTATION_ADD', record, assets });
      } else if (kind === 'presentation') {
        const op = overrideOp(obj);
        if (op) ops.push(op);
      }
    }
    if (ops.length) dispatch(ops, { fromCanvas: true, coalesce });
  }

  /** A multi-selection reports members in the group's coordinate space; ungroup first, commit, then regroup. */
  function commitTarget(target, opts) {
    if (target.type === 'activeSelection') {
      const members = target.getObjects().slice();
      canvas.discardActiveObject();
      commitObjects(members, opts);
      const live = members.filter((o) => o.canvas && o.visible !== false);
      if (live.length) canvas.setActiveObject(new fabric.ActiveSelection(live, { canvas }));
    } else {
      commitObjects([target], opts);
    }
  }

  function addObject(obj, ann) {
    obj.data = { kind: 'annotation', id: newAnnotationId(), ann };
    applyTraits(obj);
    if (obj.type === 'lineArrow') obj.snap = snapPoint;
    if (!obj.canvas) canvas.add(obj);
    commitObjects([obj]);
    return obj;
  }

  function deleteSelection() {
    const objs = canvas.getActiveObjects();
    if (!objs.length) return;
    canvas.discardActiveObject();
    const annotationIds = objs.filter((o) => o.data?.kind === 'annotation').map((o) => o.data.id);
    const pieceIds = objs.filter((o) => o.data?.kind === 'presentation').map((o) => o.data.id);
    const ops = [];
    if (annotationIds.length) ops.push({ type: 'ANNOTATION_REMOVE', ids: annotationIds });
    if (pieceIds.length) ops.push({ type: 'DELETE', targets: pieceIds });
    dispatch(ops);
  }

  function nudge(dx, dy) {
    const target = canvas.getActiveObject();
    if (!target || target.isEditing) return false;
    target.set({ left: target.left + dx, top: target.top + dy });
    target.setCoords();
    renderer.updateConnectors();
    commitTarget(target, { coalesce: 'nudge' });
    canvas.requestRenderAll();
    return true;
  }

  function applyStyle(changes) {
    const objs = canvas.getActiveObjects();
    const annotations = objs.filter((o) => o.data?.kind === 'annotation');
    const pieceIds = objs.filter((o) => o.data?.kind === 'presentation').map((o) => o.data.id);
    for (const obj of annotations) {
      obj.set(styleToFabric(changes, obj.data.ann));
      obj.dirty = true;
    }
    canvas.requestRenderAll();
    if (annotations.length) commitObjects(annotations, { coalesce: `style:${annotations.map((o) => o.data.id).join(',')}` });
    if (pieceIds.length) dispatch({ type: 'SET_STYLE', targets: pieceIds, changes }, { coalesce: `style:${pieceIds.join(',')}` });
  }

  /* ----------------------------- canvas events ---------------------------- */

  canvas.on('object:modified', (e) => e.target && commitTarget(e.target));
  const live = () => renderer.updateConnectors();
  canvas.on('object:moving', live);
  canvas.on('object:scaling', live);
  canvas.on('object:rotating', live);
  canvas.on('object:resizing', live);
  canvas.on('selection:created', () => hooks.onSelection?.(getSelection()));
  canvas.on('selection:updated', () => hooks.onSelection?.(getSelection()));
  canvas.on('selection:cleared', () => hooks.onSelection?.([]));

  // A text box a tool just made is not in the state until editing ends.
  canvas.on('text:editing:exited', (e) => {
    const obj = e.target;
    if (obj?.data?.kind !== 'annotation') return;
    if (!String(obj.text || '').trim()) {
      canvas.remove(obj);
      if (obj.__rec) dispatch({ type: 'ANNOTATION_REMOVE', ids: [obj.data.id] });
      return;
    }
    commitObjects([obj]);
  });

  /* ------------------------------- navigation ---------------------------- */

  function boundsOf(id) {
    const rectOf = (obj) => {
      const r = obj.getBoundingRect(true, true);
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const single = objectForId(id);
    if (single) return rectOf(single);
    const parts = renderer.items().filter((e) => e.item.block === id).map((e) => rectOf(e.obj));
    if (!parts.length) return null;
    const x1 = Math.min(...parts.map((r) => r.x));
    const y1 = Math.min(...parts.map((r) => r.y));
    const x2 = Math.max(...parts.map((r) => r.x + r.w));
    const y2 = Math.max(...parts.map((r) => r.y + r.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function stepSection(delta) {
    const v = viewport.view;
    const topY = -v.y / v.zoom;
    const at = sectionAt(scene.sections, topY + 60 / v.zoom);
    const startedInside = topY > at.y + 120 / v.zoom;
    const index = delta < 0 && startedInside ? at.index : at.index + delta;
    viewport.goToSection(scene.sections[Math.min(Math.max(index, 0), scene.sections.length - 1)]);
  }

  /* ------------------------------- lifecycle ------------------------------ */

  Object.assign(editor, {
    canvas,
    fabric,
    viewport,
    renderer,
    sync,
    defaults: createDefaults((d) => {
      editor.tools?.refresh();
      hooks.onDefaults?.(d);
    }),
    getState: () => current,
    getScene: () => scene,
    dispatch,
    undo,
    redo,
    /** Close a batch that was applied with `record: false` as one undo step (Direct mode). */
    recordUndoPoint(previous) {
      history.record(previous);
      notify();
    },
    canUndo: () => history.canUndo,
    canRedo: () => history.canRedo,
    commitObjects,
    commitTarget,
    addObject,
    deleteSelection,
    nudge,
    applyStyle,
    getSelection,
    select,
    deselect: () => canvas.discardActiveObject() && canvas.requestRenderAll(),
    boundsOf,
    focusObject(id) {
      const b = boundsOf(id);
      if (b) viewport.focusRect(b);
    },
    goToSection(i) {
      viewport.goToSection(scene.sections[Math.min(Math.max(i, 0), scene.sections.length - 1)]);
    },
    stepSection,
    currentSectionIndex: sectionIndexAtCenter,
    snapPoint,
    /** Replace the whole board (Load from file, reopen). Clears undo history. */
    loadState(next) {
      history.clear();
      current = { ...next };
      relayout();
      if (next.view) viewport.set(next.view, { notify: false });
      else viewport.reset();
      notify();
    },
    /** A regenerated section: swap it in and start undo history afresh (its old pieces no longer exist). */
    replaceSection(index, section) {
      dispatch({ type: 'SECTION_REPLACE', index, section }, { record: false });
      history.clear();
      notify();
    },
    dispose() {
      canvas.dispose();
      viewport.dispose();
      sync.dispose();
      renderer.dispose();
    },
  });

  editor.tools = createToolManager(editor, createTools(editor), { onTool: hooks.onTool });

  // First paint. The saved camera is read *before* `resize()`, which reports the default view through
  // onChange and would otherwise overwrite it in `current`.
  const savedView = current.view;
  renderer.rebuild(scene, current);
  sync.rebuildAll(current, scene.sections);
  viewport.resize();
  if (savedView) viewport.set(savedView, { notify: false });
  else viewport.reset();
  notify();

  return editor;
}
