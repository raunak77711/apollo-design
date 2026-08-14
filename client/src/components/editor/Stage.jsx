import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useEditor } from '../../state/EditorContext.jsx';
import { boundsOf, snapPosition } from '../../design/arrange.js';
import { fontStack } from '../../design/fonts.js';
import { inkFor } from '../../design/color.js';
import { defaultPropertiesFor } from '../../design/schema.js';
import { cx } from '../../lib/cx.js';
import { IconButton, Tooltip } from '../../ui/primitives.jsx';
import ElementRenderer from '../elements/ElementRenderer.jsx';
import { CREATION_TOOLS } from './ToolRail.jsx';

const HANDLES = [
  ['nw', 0, 0],
  ['n', 0.5, 0],
  ['ne', 1, 0],
  ['w', 0, 0.5],
  ['e', 1, 0.5],
  ['sw', 0, 1],
  ['s', 0.5, 1],
  ['se', 1, 1],
];

const CURSORS = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
};

const PADDING = 64;

/**
 * The workspace. Everything the canvas needs lives here — selection, dragging
 * with alignment snapping, resize, rotate, marquee select, pan and zoom — so the
 * rest of the editor can stay declarative.
 */
const Stage = forwardRef(function Stage({ onEditImage, onPickImage }, ref) {
  const { state, actions } = useEditor();
  const { document: doc, selectedIds, zoom } = state;
  const canvas = doc.canvas;

  const viewportRef = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);
  const zoomAnchor = useRef(null);

  const [editingId, setEditingId] = useState(null);
  const [hoverId, setHoverId] = useState(null);
  const [guides, setGuides] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const selected = doc.elements.filter((el) => selectedIds.includes(el.id));
  const ordered = [...doc.elements].filter((el) => !el.hidden).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  /* ------------------------------- zoom -------------------------------- */

  const fit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const scale = Math.min(
      (vp.clientWidth - PADDING * 2) / canvas.width,
      (vp.clientHeight - PADDING * 2) / canvas.height
    );
    actions.setZoom(Math.min(1, Math.max(0.02, scale)));
  }, [actions, canvas.width, canvas.height]);

  useImperativeHandle(ref, () => ({ fit, zoomTo: (z) => actions.setZoom(z) }), [fit, actions]);

  // Fit once the project is loaded and again whenever the canvas size changes.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas.width, canvas.height]);

  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const vp = viewportRef.current;
    const rect = vp.getBoundingClientRect();
    const next = Math.min(8, Math.max(0.02, zoom * Math.exp(-e.deltaY * 0.0016)));
    zoomAnchor.current = {
      x: e.clientX - rect.left + vp.scrollLeft,
      y: e.clientY - rect.top + vp.scrollTop,
      ratio: next / zoom,
    };
    actions.setZoom(next);
  };

  // React registers wheel handlers passively, so zoom needs a native listener.
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  useEffect(() => {
    const vp = viewportRef.current;
    const handler = (e) => wheelRef.current(e);
    vp.addEventListener('wheel', handler, { passive: false });
    return () => vp.removeEventListener('wheel', handler);
  }, []);

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const vp = viewportRef.current;
    if (!anchor || !vp) return;
    vp.scrollLeft += anchor.x * (anchor.ratio - 1);
    vp.scrollTop += anchor.y * (anchor.ratio - 1);
    zoomAnchor.current = null;
  }, [zoom]);

  /* ------------------------------- panning ------------------------------ */

  useEffect(() => {
    const down = (e) => {
      if (e.code !== 'Space') return;
      if (e.target.closest?.('button, input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      setSpaceDown(true);
    };
    const up = (e) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---------------------------- drag plumbing --------------------------- */

  const toDoc = (clientX, clientY) => {
    const rect = stageRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  };

  // Stable listener identities: the live handlers are swapped through refs so a
  // re-render mid-drag can never orphan a window listener.
  const moveRef = useRef(null);
  const upRef = useRef(null);
  const listeners = useRef({
    move: (e) => moveRef.current?.(e),
    up: (e) => upRef.current?.(e),
  }).current;

  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    setMarquee(null);
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
    if (d?.moved && d.mode !== 'marquee' && d.mode !== 'pan') actions.commitTransient();
  }, [actions, listeners]);

  const onPointerMove = useCallback(
    (e) => {
      const d = drag.current;
      if (!d) return;
      d.moved = true;

      if (d.mode === 'pan') {
        const vp = viewportRef.current;
        vp.scrollLeft = d.scrollLeft - (e.clientX - d.startX);
        vp.scrollTop = d.scrollTop - (e.clientY - d.startY);
        return;
      }

      if (d.mode === 'marquee') {
        const point = toDoc(e.clientX, e.clientY);
        const rect = {
          x: Math.min(d.origin.x, point.x),
          y: Math.min(d.origin.y, point.y),
          width: Math.abs(point.x - d.origin.x),
          height: Math.abs(point.y - d.origin.y),
        };
        setMarquee(rect);
        const hits = doc.elements
          .filter((el) => !el.hidden)
          .filter(
            (el) =>
              el.x < rect.x + rect.width && el.x + el.width > rect.x && el.y < rect.y + rect.height && el.y + el.height > rect.y
          )
          .map((el) => el.id);
        // Only re-dispatch when the hit list actually changes.
        if (hits.join() !== d.lastHits) {
          d.lastHits = hits.join();
          actions.selectMany(hits);
        }
        return;
      }

      let dx = (e.clientX - d.startX) / zoom;
      let dy = (e.clientY - d.startY) / zoom;

      if (d.mode === 'move') {
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const box = { x: d.bounds.x + dx, y: d.bounds.y + dy, width: d.bounds.width, height: d.bounds.height };
        const snap = e.altKey
          ? { x: Math.round(box.x), y: Math.round(box.y), guides: [] }
          : snapPosition({ box, others: d.others, canvas, zoom });
        setGuides(snap.guides);
        const offsetX = snap.x - d.bounds.x;
        const offsetY = snap.y - d.bounds.y;
        actions.applyTransient(
          d.origin.map((o) => ({
            type: 'MOVE_ELEMENT',
            targetId: o.id,
            changes: { x: Math.round(o.x + offsetX), y: Math.round(o.y + offsetY) },
          }))
        );
        return;
      }

      if (d.mode === 'resize') {
        const next = resize(d.element, d.handle, dx, dy, e.shiftKey);
        actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: d.element.id, changes: next }]);
        return;
      }

      if (d.mode === 'rotate') {
        let angle = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: d.element.id, changes: { rotation: Math.round(angle) } }]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, zoom, doc.elements, canvas]
  );

  moveRef.current = onPointerMove;
  upRef.current = endDrag;

  const beginDrag = (payload) => {
    drag.current = { moved: false, ...payload };
    window.addEventListener('pointermove', listeners.move);
    window.addEventListener('pointerup', listeners.up);
  };

  useEffect(() => () => {
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
  }, [listeners]);

  /* ------------------------------ interactions -------------------------- */

  /** Places an armed tool where the canvas was clicked, then returns to Select. */
  const placeTool = (toolId, point) => {
    const tool = CREATION_TOOLS.find((t) => t.id === toolId);
    if (!tool) return;
    const id = `${toolId}-${Date.now().toString(36)}`;
    const ink = inkFor(canvas.background);
    const inked =
      toolId === 'text' ? { color: ink } : toolId === 'icon' ? { color: ink } : toolId === 'line' ? { stroke: ink } : {};

    actions.apply(
      [
        {
          type: 'CREATE_ELEMENT',
          element: {
            id,
            type: toolId,
            x: Math.round(point.x - tool.size.width / 2),
            y: Math.round(point.y - tool.size.height / 2),
            ...tool.size,
            properties: { ...defaultPropertiesFor(toolId), ...inked, ...(tool.props || {}) },
          },
        },
      ],
      { selectIds: [id] }
    );
    actions.setTool('select');
    if (toolId === 'text' || toolId === 'button') setEditingId(id);
  };

  const onViewportPointerDown = (e) => {
    if (state.tool !== 'select' && e.button === 0 && !spaceDown) {
      e.preventDefault();
      placeTool(state.tool, toDoc(e.clientX, e.clientY));
      return;
    }
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      beginDrag({
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: viewportRef.current.scrollLeft,
        scrollTop: viewportRef.current.scrollTop,
      });
      return;
    }
    if (e.button !== 0) return;
    setEditingId(null);
    if (!e.shiftKey) actions.clearSelection();
    beginDrag({ mode: 'marquee', origin: toDoc(e.clientX, e.clientY) });
  };

  const onElementPointerDown = (e, el) => {
    if (editingId === el.id || spaceDown || e.button !== 0) return;
    e.stopPropagation();

    const already = selectedIds.includes(el.id);
    let ids = selectedIds;
    if (e.shiftKey) {
      actions.toggleSelect(el.id);
      ids = already ? selectedIds.filter((id) => id !== el.id) : [...selectedIds, el.id];
    } else if (!already) {
      actions.select(el.id);
      ids = [el.id];
    }

    const moving = doc.elements.filter((item) => ids.includes(item.id));
    if (moving.length === 0) return;

    beginDrag({
      mode: 'move',
      startX: e.clientX,
      startY: e.clientY,
      origin: moving.map((item) => ({ id: item.id, x: item.x, y: item.y })),
      bounds: boundsOf(moving),
      others: doc.elements.filter((item) => !ids.includes(item.id) && !item.hidden),
    });
  };

  const onDoubleClick = (el) => {
    if (el.type === 'text' || el.type === 'button') setEditingId(el.id);
    else if (el.type === 'image') (el.properties.src ? onEditImage : onPickImage)?.(el.id);
  };

  /* -------------------------------- render ------------------------------ */

  const multi = selected.length > 1;
  const single = selected.length === 1 ? selected[0] : null;
  const groupBox = multi ? boundsOf(selected) : null;
  const px = 1 / zoom;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-workspace">
      <div
        ref={viewportRef}
        onPointerDown={onViewportPointerDown}
        className={cx(
          'thin-scroll grid min-h-0 flex-1 place-items-center overflow-auto',
          spaceDown ? 'cursor-grab' : state.tool !== 'select' && 'cursor-crosshair'
        )}
        style={{ padding: PADDING }}
      >
        <div
          ref={stageRef}
          className="relative shadow-art"
          style={{ width: canvas.width * zoom, height: canvas.height * zoom }}
        >
          <div className="absolute inset-0 checkerboard" />
          <div className="absolute inset-0" style={{ background: canvas.background }} />

          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: canvas.width, height: canvas.height, transform: `scale(${zoom})` }}
          >
            {ordered.map((el) => {
              const isSelected = selectedIds.includes(el.id);
              const isEditing = editingId === el.id && (el.type === 'text' || el.type === 'button');
              return (
                <div
                  key={el.id}
                  className="absolute"
                  style={{
                    left: el.x,
                    top: el.y,
                    width: el.width,
                    height: el.height,
                    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                    opacity: el.opacity,
                    zIndex: el.zIndex,
                    cursor: spaceDown ? 'inherit' : state.tool !== 'select' ? 'crosshair' : 'move',
                  }}
                  onPointerDown={(e) => onElementPointerDown(e, el)}
                  onPointerEnter={() => setHoverId(el.id)}
                  onPointerLeave={() => setHoverId((current) => (current === el.id ? null : current))}
                  onDoubleClick={() => onDoubleClick(el)}
                >
                  {isEditing ? (
                    <InlineEditor
                      element={el}
                      onCommit={(text) => {
                        if (text !== el.properties.text) {
                          actions.apply([{ type: 'SET_CONTENT', targetId: el.id, changes: { text } }]);
                        }
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <ElementRenderer element={el} />
                  )}

                  {(isSelected || hoverId === el.id) && !isEditing && (
                    <span
                      className={cx('pointer-events-none absolute inset-0', isSelected ? 'border-accent' : 'border-accent/45')}
                      style={{ borderWidth: px }}
                    />
                  )}
                </div>
              );
            })}

            {/* Single-selection transform handles */}
            {single && editingId !== single.id && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: single.x,
                  top: single.y,
                  width: single.width,
                  height: single.height,
                  transform: single.rotation ? `rotate(${single.rotation}deg)` : undefined,
                  zIndex: 10000,
                }}
              >
                <Handles
                  element={single}
                  zoom={zoom}
                  onHandleDown={(e, handle) => {
                    e.stopPropagation();
                    beginDrag({ mode: 'resize', handle, element: single, startX: e.clientX, startY: e.clientY });
                  }}
                  onRotateDown={(e) => {
                    e.stopPropagation();
                    const rect = stageRef.current.getBoundingClientRect();
                    beginDrag({
                      mode: 'rotate',
                      element: single,
                      cx: rect.left + (single.x + single.width / 2) * zoom,
                      cy: rect.top + (single.y + single.height / 2) * zoom,
                    });
                  }}
                />
              </div>
            )}

            {/* Multi-selection frame */}
            {groupBox && (
              <div
                className="pointer-events-none absolute border-accent/70"
                style={{
                  left: groupBox.x,
                  top: groupBox.y,
                  width: groupBox.width,
                  height: groupBox.height,
                  borderWidth: px,
                  borderStyle: 'dashed',
                  zIndex: 10000,
                }}
              />
            )}

            {/* Alignment guides */}
            {guides.map((g, i) => (
              <div
                key={i}
                className="pointer-events-none absolute bg-accent"
                style={
                  g.axis === 'x'
                    ? { left: g.at, top: g.from, width: px, height: g.to - g.from, zIndex: 10001 }
                    : { left: g.from, top: g.at, height: px, width: g.to - g.from, zIndex: 10001 }
                }
              />
            ))}

            {/* Marquee */}
            {marquee && (
              <div
                className="pointer-events-none absolute border-accent bg-accent/10"
                style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height, borderWidth: px, zIndex: 10002 }}
              />
            )}
          </div>

          {doc.elements.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em]" style={{ color: 'rgba(140,140,140,0.9)' }}>
                Empty canvas
              </span>
              <span className="text-[13px]" style={{ color: 'rgba(140,140,140,0.75)' }}>
                Press T for text, or ask Apollo to draw something
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Armed-tool hint */}
      {state.tool !== 'select' && (
        <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 animate-rise items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink shadow-pop">
          Click the canvas to place the {CREATION_TOOLS.find((t) => t.id === state.tool)?.label.toLowerCase()}
          <span className="font-mono text-2xs text-ink-3">ESC</span>
        </div>
      )}

      {/* Zoom pill */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-0.5 rounded-lg border border-line bg-surface/95 p-0.5 shadow-pop">
        <div className="pointer-events-auto flex items-center gap-0.5">
          <IconButton aria-label="Zoom out" onClick={() => actions.setZoom(zoom / 1.2)}>
            <Minus size={14} />
          </IconButton>
          <button
            onClick={() => actions.setZoom(1)}
            title="Reset to 100%"
            className="num w-12 rounded px-1 py-1 text-center text-xs text-ink-2 transition-colors hover:text-ink"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton aria-label="Zoom in" onClick={() => actions.setZoom(zoom * 1.2)}>
            <Plus size={14} />
          </IconButton>
          <span className="mx-0.5 h-4 w-px bg-line" />
          <Tooltip label="Fit to screen" hint="⇧1" side="top">
            <IconButton aria-label="Fit to screen" onClick={fit}>
              <Maximize2 size={13} />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});

export default Stage;

/* -------------------------------- pieces -------------------------------- */

function Handles({ element, zoom, onHandleDown, onRotateDown }) {
  const size = 8 / zoom;
  const half = size / 2;
  return (
    <>
      <span
        onPointerDown={onRotateDown}
        className="pointer-events-auto absolute rounded-full border-accent bg-surface"
        style={{
          width: size,
          height: size,
          borderWidth: 1 / zoom,
          left: element.width / 2 - half,
          top: -22 / zoom,
          cursor: 'grab',
        }}
        title="Rotate"
      />
      <span
        className="absolute bg-accent"
        style={{ left: element.width / 2 - 0.5 / zoom, top: -22 / zoom + half, width: 1 / zoom, height: 22 / zoom - half }}
      />
      {HANDLES.map(([name, hx, hy]) => (
        <span
          key={name}
          onPointerDown={(e) => onHandleDown(e, name)}
          className="pointer-events-auto absolute border-accent bg-surface"
          style={{
            width: size,
            height: size,
            borderWidth: 1 / zoom,
            left: element.width * hx - half,
            top: element.height * hy - half,
            cursor: CURSORS[name],
          }}
        />
      ))}
    </>
  );
}

function InlineEditor({ element, onCommit }) {
  const p = element.properties;
  return (
    <textarea
      autoFocus
      defaultValue={p.text}
      onFocus={(e) => e.target.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.target.value = p.text;
          e.target.blur();
        }
        if (e.key === 'Enter' && !e.shiftKey && element.type === 'button') {
          e.preventDefault();
          e.target.blur();
        }
      }}
      className="h-full w-full resize-none bg-transparent p-0 outline-none"
      style={{
        fontFamily: fontStack(p.fontFamily),
        fontSize: p.fontSize,
        fontWeight: p.fontWeight,
        color: p.color,
        textAlign: p.align,
        lineHeight: p.lineHeight,
        letterSpacing: `${p.letterSpacing || 0}px`,
        border: 'none',
      }}
    />
  );
}

/** Axis-aligned resize. Shift keeps the original proportions. */
function resize(orig, handle, dx, dy, keepRatio) {
  let { x, y, width, height } = orig;
  const ratio = orig.width / orig.height;

  if (handle.includes('e')) width = Math.max(8, orig.width + dx);
  if (handle.includes('s')) height = Math.max(8, orig.height + dy);
  if (handle.includes('w')) {
    width = Math.max(8, orig.width - dx);
    x = orig.x + (orig.width - width);
  }
  if (handle.includes('n')) {
    height = Math.max(8, orig.height - dy);
    y = orig.y + (orig.height - height);
  }

  if (keepRatio && handle.length === 2) {
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
    if (handle.includes('w')) x = orig.x + (orig.width - width);
    if (handle.includes('n')) y = orig.y + (orig.height - height);
  }

  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}
