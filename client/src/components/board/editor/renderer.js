import { connectorPoints } from '../engine/geometry.js';
import { buildIndex, effectiveItem } from '../engine/overrides.js';
import { textboxOptions } from '../engine/measure.js';
import { toneColor } from '../engine/theme.js';
import { arrowGeometry } from '../state/annotations.js';
import { styleToFabric } from '../state/styleMap.js';
import { buildIconGroup, recolorIcon } from './iconShapes.js';
import { registerLineArrow } from './LineArrow.js';

/**
 * Scene → Fabric, and back into shape when the state changes.
 *
 * Every presentation object is centred on its item's (cx, cy) and carries
 * `data = { kind: 'presentation', id }`. `patch` re-applies the effective
 * transform (layout + overrides + leaders) to the existing objects — cheap, and
 * selection survives it. A change of *style* rebuilds just that piece, because
 * removing a style key must restore the original look, not leave a stale one.
 *
 * Connectors are LineArrows recomputed from the live geometry of their two
 * ends, so an arrow follows a piece while it is being dragged, not after.
 */

const SHAPE_KEYS = ['fill', 'stroke', 'strokeWidth', 'radius', 'dash'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

export function createRenderer(fabric, canvas, { objectById = () => null } = {}) {
  const LineArrow = registerLineArrow(fabric);
  let scene = null;
  let index = null;
  let interactive = true;
  let overrides = {};
  const entries = new Map(); // item id → { item, obj, styleKey }
  let layoutConnectors = []; // { item, obj }
  let userConnectors = []; //   { conn, obj }

  const data = (item) => ({ kind: 'presentation', id: item.id, item: item.kind });

  /* ------------------------------ object makers ----------------------------- */

  function makeText(item) {
    return new fabric.Textbox(item.text, {
      ...textboxOptions(item.font, item.w),
      textAlign: item.align,
      fill: item.color,
      left: item.cx,
      top: item.cy,
      originX: 'center',
      originY: 'center',
      lockScalingFlip: true,
      data: data(item),
    });
  }

  function labelObjects(item) {
    const parts = [];
    if (item.label) {
      const hasTag = Boolean(item.tag) && item.tagAlign === 'bottom-left';
      const leftAligned = item.labelAlign === 'left';
      parts.push(new fabric.Textbox(item.label, {
        ...textboxOptions(item.labelFont, item.labelWidth),
        textAlign: item.labelAlign,
        fill: item.labelColor,
        originX: 'center',
        originY: hasTag ? 'top' : 'center',
        left: leftAligned ? -item.w / 2 + item.pad + item.labelWidth / 2 : 0,
        top: hasTag ? -item.h / 2 + item.pad : item.labelOffsetY || 0,
        selectable: false,
        evented: false,
      }));
    }
    if (item.tag) {
      const right = item.tagAlign === 'right';
      parts.push(new fabric.Text(item.tag, {
        fontFamily: item.tagFont.family,
        fontSize: item.tagFont.size,
        fontWeight: String(item.tagFont.weight),
        charSpacing: item.tagFont.letterSpacing || 0,
        fill: item.tagColor,
        originX: right ? 'right' : 'left',
        originY: right ? 'center' : 'bottom',
        left: right ? item.w / 2 - 16 : -item.w / 2 + item.pad,
        top: right ? 0 : item.h / 2 - item.pad,
        selectable: false,
        evented: false,
      }));
    }
    return parts;
  }

  function makeBox(item) {
    const rect = new fabric.Rect({
      width: item.w, height: item.h, rx: item.radius, ry: item.radius,
      fill: item.fill, stroke: item.stroke, strokeWidth: item.strokeWidth, strokeUniform: true,
      strokeDashArray: item.dash || null, originX: 'center', originY: 'center', left: 0, top: 0,
    });
    const parts = labelObjects(item);
    if (!parts.length) {
      rect.set({ left: item.cx, top: item.cy, data: data(item) });
      return rect;
    }
    return new fabric.Group([rect, ...parts], {
      left: item.cx, top: item.cy, originX: 'center', originY: 'center', subTargetCheck: false, data: data(item),
    });
  }

  function makePoly(item) {
    const poly = new fabric.Polygon(item.points.map(([x, y]) => ({ x, y })), {
      fill: item.fill, stroke: item.stroke || null, strokeWidth: item.stroke ? item.strokeWidth || 2 : 0, strokeUniform: true,
      strokeLineJoin: 'round', originX: 'center', originY: 'center', left: 0, top: 0,
    });
    if (!item.label) {
      // A shape with no words on it (a bucket, a splash of water) is the polygon itself.
      poly.set({ left: item.cx, top: item.cy, data: data(item) });
      return poly;
    }
    const label = new fabric.Textbox(item.label, {
      ...textboxOptions(item.labelFont, item.labelWidth),
      fill: item.labelColor, originX: 'center', originY: 'center', left: 0, top: 0, selectable: false, evented: false,
    });
    return new fabric.Group([poly, label], {
      left: item.cx, top: item.cy, originX: 'center', originY: 'center', subTargetCheck: false, data: data(item),
    });
  }

  /** An icon is a Lucide glyph (optionally on a tinted disc), scaled so its outer edge is item.w wide. */
  function makeIcon(item) {
    const inner = buildIconGroup(fabric, item.name, item.color, item.disc);
    inner.scale(item.w / (item.disc ? 46 : 24));
    return new fabric.Group([inner], {
      left: item.cx, top: item.cy, originX: 'center', originY: 'center', subTargetCheck: false, data: data(item),
    });
  }

  function makeRule(item) {
    return new fabric.Line([-item.w / 2, -item.h / 2, item.w / 2, item.h / 2], {
      stroke: item.color, strokeWidth: item.width, strokeDashArray: item.dashed ? [10, 8] : null,
      originX: 'center', originY: 'center', left: item.cx, top: item.cy,
      selectable: false, evented: false, data: data(item),
    });
  }

  function makeConnector(item) {
    const arrow = new LineArrow({
      ...arrowGeometry(0, 0, 1, 0), color: item.color, lineWidth: item.width, dashed: Boolean(item.dashed),
      headEnd: Boolean(item.head), headStart: false, selectable: false, evented: false, hasControls: false,
      data: { kind: 'presentation', id: item.id, item: 'connector' },
    });
    return arrow;
  }

  function makeObject(item) {
    switch (item.kind) {
      case 'text': return makeText(item);
      case 'box': return makeBox(item);
      case 'poly': return makePoly(item);
      case 'icon': return makeIcon(item);
      case 'rule': return makeRule(item);
      default: return null;
    }
  }

  /* --------------------------------- styling -------------------------------- */

  function applyStyle(item, obj, style) {
    if (!Object.keys(style).length) return;
    if (item.kind === 'icon') {
      const color = style.color || style.stroke;
      if (color) recolorIcon(obj.getObjects()[0], color);
      if (typeof style.opacity === 'number') obj.set('opacity', style.opacity);
      obj.dirty = true;
    } else if (item.kind === 'text') {
      obj.set(styleToFabric(style, 'text'));
    } else if (item.kind === 'box' || item.kind === 'poly') {
      const parts = obj.getObjects ? obj.getObjects() : [obj];
      const [shape, ...rest] = parts;
      shape.set(styleToFabric(pick(style, SHAPE_KEYS), 'shape'));
      const labelStyle = styleToFabric(omit(style, [...SHAPE_KEYS, 'opacity']), 'text');
      rest.forEach((part) => part.set(labelStyle));
      if (typeof style.opacity === 'number') obj.set('opacity', style.opacity);
      obj.dirty = true;
    } else if (typeof style.opacity === 'number') {
      obj.set('opacity', style.opacity);
    }
  }

  const selectableKind = (item) => item.kind === 'text' || item.kind === 'box' || item.kind === 'poly' || item.kind === 'icon';

  function place(entry, eff) {
    const { item, obj } = entry;
    obj.set({
      left: eff.cx, top: eff.cy, scaleX: eff.scaleX, scaleY: eff.scaleY, angle: eff.angle,
      visible: !eff.deleted,
      selectable: !eff.deleted && selectableKind(item),
      evented: interactive && !eff.deleted && selectableKind(item),
    });
    if (item.kind === 'text') {
      // Only touch what changed: re-setting text or width re-wraps the whole Textbox.
      const text = eff.text ?? item.text;
      if (obj.text !== text) obj.set('text', text);
      if (obj.width !== eff.w) obj.set('width', eff.w);
    }
    obj.setCoords();
  }

  /* ---------------------------------- public -------------------------------- */

  function replaceObject(entry, next) {
    const list = canvas.getObjects();
    const at = list.indexOf(entry.obj);
    canvas.remove(entry.obj);
    if (at >= 0) canvas.insertAt(next, at, false);
    else canvas.add(next);
    entry.obj = next;
  }

  function rebuild(nextScene, state) {
    canvas.renderOnAddRemove = false;
    for (const { obj } of entries.values()) canvas.remove(obj);
    for (const { obj } of layoutConnectors) canvas.remove(obj);
    entries.clear();
    layoutConnectors = [];

    scene = nextScene;
    index = buildIndex(scene);
    overrides = state.overrides;

    // Connectors first so they sit behind the pieces they join.
    for (const item of scene.items.filter((i) => i.kind === 'connector')) {
      const obj = makeConnector(item);
      canvas.add(obj);
      layoutConnectors.push({ item, obj });
    }
    for (const item of scene.items) {
      if (item.kind === 'connector') continue;
      const obj = makeObject(item);
      if (!obj) continue;
      canvas.add(obj);
      entries.set(item.id, { item, obj, styleKey: '' });
    }
    canvas.renderOnAddRemove = true;
    patch(state);
  }

  function patch(state) {
    if (!scene) return;
    overrides = state.overrides;
    const ctx = { overrides, ...index };
    for (const entry of entries.values()) {
      const eff = effectiveItem(entry.item, ctx);
      const styleKey = JSON.stringify(eff.style);
      if (styleKey !== entry.styleKey) {
        // A style changed (or was undone): start from the original look and re-apply.
        const fresh = makeObject(entry.item);
        if (entry.styleKey !== '' || Object.keys(eff.style).length) replaceObject(entry, fresh);
        applyStyle(entry.item, entry.obj, eff.style);
        entry.styleKey = styleKey;
      }
      place(entry, eff);
    }
    setConnections(state.connections);
    updateConnectors();
    canvas.requestRenderAll();
  }

  /** Where a connector end currently is, read from the live object so arrows track a drag in progress. */
  function liveRect(id) {
    const obj = entries.get(id)?.obj || objectById(id);
    if (!obj || obj.visible === false) return null;
    const d = fabric.util.qrDecompose(obj.calcTransformMatrix());
    return { cx: d.translateX, cy: d.translateY, w: obj.width * d.scaleX, h: obj.height * d.scaleY };
  }

  function route(arrow, fromId, toId, gap) {
    const a = liveRect(fromId);
    const b = liveRect(toId);
    if (!a || !b) {
      arrow.set('visible', false);
      return;
    }
    const p = connectorPoints(a, b, gap);
    arrow.set('visible', true);
    arrow.setEndpoints(p.x1, p.y1, p.x2, p.y2);
  }

  function updateConnectors() {
    layoutConnectors.forEach(({ item, obj }) => route(obj, item.from, item.to, item.gap ?? 10));
    userConnectors.forEach(({ conn, obj }) => route(obj, conn.from, conn.to, 12));
  }

  function setConnections(connections) {
    const wanted = new Map(connections.map((c) => [c.id, c]));
    userConnectors = userConnectors.filter(({ conn, obj }) => {
      const keep = wanted.has(conn.id) && wanted.get(conn.id) === conn;
      if (!keep) canvas.remove(obj);
      return keep;
    });
    const have = new Set(userConnectors.map(({ conn }) => conn.id));
    for (const conn of connections) {
      if (have.has(conn.id)) continue;
      const obj = new LineArrow({
        ...arrowGeometry(0, 0, 1, 0), color: toneColor(conn.tone), lineWidth: 5, dashed: conn.dashed, headEnd: true,
        selectable: false, evented: false, hasControls: false, data: { kind: 'connection', id: conn.id },
      });
      canvas.add(obj);
      userConnectors.push({ conn, obj });
    }
  }

  function setInteractive(flag) {
    interactive = flag;
    for (const { item, obj } of entries.values()) {
      const eff = effectiveItem(item, { overrides, ...index });
      obj.set({ evented: flag && !eff.deleted && selectableKind(item) });
    }
  }

  return {
    rebuild,
    patch,
    updateConnectors,
    setConnections,
    setInteractive,
    objectOf: (id) => entries.get(id)?.obj || null,
    itemOf: (id) => entries.get(id)?.item || null,
    idOf: (obj) => (obj?.data?.kind === 'presentation' ? obj.data.id : null),
    context: () => ({ overrides, ...index }),
    items: () => [...entries.values()],
    dispose() {
      for (const { obj } of entries.values()) canvas.remove(obj);
      layoutConnectors.forEach(({ obj }) => canvas.remove(obj));
      userConnectors.forEach(({ obj }) => canvas.remove(obj));
      entries.clear();
      layoutConnectors = [];
      userConnectors = [];
    },
  };
}
