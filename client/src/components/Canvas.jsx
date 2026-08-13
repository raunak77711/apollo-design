import { useRef, useState, useCallback } from 'react';
import { useEditor } from '../state/EditorContext.jsx';
import ElementRenderer from './elements/ElementRenderer.jsx';

const HANDLES = [
  ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0],
  ['w', 0, 0.5], ['e', 1, 0.5],
  ['sw', 0, 1], ['s', 0.5, 1], ['se', 1, 1],
];

export default function Canvas({ onEditImage }) {
  const { state, actions } = useEditor();
  const { document: doc, selectedElementId, zoom } = state;
  const stageRef = useRef(null);
  const drag = useRef(null);
  const [editingId, setEditingId] = useState(null);

  const ordered = [...doc.elements]
    .filter((el) => !el.hidden)
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

  /* --------------------------- Move / drag --------------------------- */
  const onElementPointerDown = useCallback(
    (e, el) => {
      if (editingId === el.id) return; // don't drag while editing text
      e.stopPropagation();
      actions.select(el.id);
      drag.current = { mode: 'move', id: el.id, startX: e.clientX, startY: e.clientY, orig: { ...el } };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [actions, editingId]
  );

  const onHandlePointerDown = useCallback(
    (e, el, handle) => {
      e.stopPropagation();
      drag.current = { mode: 'resize', handle, id: el.id, startX: e.clientX, startY: e.clientY, orig: { ...el } };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    []
  );

  const onRotatePointerDown = useCallback((e, el) => {
    e.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    const cx = rect.left + (el.x + el.width / 2) * zoom;
    const cy = rect.top + (el.y + el.height / 2) * zoom;
    drag.current = { mode: 'rotate', id: el.id, cx, cy, orig: { ...el } };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [zoom]);

  const onPointerMove = useCallback(
    (e) => {
      const d = drag.current;
      if (!d) return;
      if (d.mode === 'move') {
        const dx = (e.clientX - d.startX) / zoom;
        const dy = (e.clientY - d.startY) / zoom;
        actions.applyTransient([
          { type: 'MOVE_ELEMENT', targetId: d.id, changes: { x: Math.round(d.orig.x + dx), y: Math.round(d.orig.y + dy) } },
        ]);
      } else if (d.mode === 'resize') {
        const dx = (e.clientX - d.startX) / zoom;
        const dy = (e.clientY - d.startY) / zoom;
        const { x, y, width, height } = resize(d.orig, d.handle, dx, dy);
        actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: d.id, changes: { x, y, width, height } }]);
      } else if (d.mode === 'rotate') {
        const angle = (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI + 90;
        actions.applyTransient([{ type: 'UPDATE_ELEMENT', targetId: d.id, changes: { rotation: Math.round(angle) } }]);
      }
    },
    [actions, zoom]
  );

  const onPointerUp = useCallback(() => {
    if (drag.current) actions.commitTransient();
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [actions, onPointerMove]);

  /* ---------------------------- Rendering ---------------------------- */
  return (
    <div className="flex-1 overflow-auto thin-scroll flex items-center justify-center p-10 bg-neutral-900/40"
         onPointerDown={() => actions.select(null)}>
      <div
        ref={stageRef}
        className="relative shadow-2xl checkerboard"
        style={{
          width: doc.canvas.width * zoom,
          height: doc.canvas.height * zoom,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Canvas background */}
        <div className="absolute inset-0" style={{ background: doc.canvas.background }} />

        {/* Scaled element layer */}
        <div className="absolute inset-0" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: doc.canvas.width, height: doc.canvas.height }}>
          {ordered.map((el) => {
            const selected = el.id === selectedElementId;
            const editable = editingId === el.id && (el.type === 'text' || el.type === 'button');
            return (
              <div
                key={el.id}
                className="absolute"
                style={{
                  left: el.x, top: el.y, width: el.width, height: el.height,
                  transform: `rotate(${el.rotation || 0}deg)`,
                  opacity: el.opacity,
                  zIndex: el.zIndex,
                  cursor: 'move',
                  outline: selected ? '1px solid #E11D48' : 'none',
                }}
                onPointerDown={(e) => onElementPointerDown(e, el)}
                onDoubleClick={() => {
                  if (el.type === 'text' || el.type === 'button') setEditingId(el.id);
                  else if (el.type === 'image') onEditImage?.(el.id);
                }}
              >
                {editable ? (
                  <InlineTextEditor element={el} onCommit={(text) => {
                    actions.apply([{ type: 'SET_CONTENT', targetId: el.id, changes: { text } }]);
                    setEditingId(null);
                  }} />
                ) : (
                  <ElementRenderer element={el} />
                )}

                {selected && !editable && (
                  <Handles element={el} zoom={zoom} onHandleDown={onHandlePointerDown} onRotateDown={onRotatePointerDown} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Handles({ element, zoom, onHandleDown, onRotateDown }) {
  const s = 9 / zoom; // keep handles visually constant
  return (
    <>
      {/* Rotate handle */}
      <div
        onPointerDown={(e) => onRotateDown(e, element)}
        className="absolute rounded-full bg-white border border-accent cursor-grab"
        style={{ width: s, height: s, left: element.width / 2 - s / 2, top: -24 / zoom }}
        title="Rotate"
      />
      {HANDLES.map(([name, hx, hy]) => (
        <div
          key={name}
          onPointerDown={(e) => onHandleDown(e, element, name)}
          className="absolute bg-white border border-accent"
          style={{
            width: s, height: s,
            left: element.width * hx - s / 2,
            top: element.height * hy - s / 2,
            cursor: cursorFor(name),
          }}
        />
      ))}
    </>
  );
}

function InlineTextEditor({ element, onCommit }) {
  const p = element.properties;
  return (
    <textarea
      autoFocus
      defaultValue={p.text}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
      }}
      className="w-full h-full bg-transparent resize-none outline outline-1 outline-accent"
      style={{
        fontFamily: p.fontFamily, fontSize: p.fontSize, fontWeight: p.fontWeight,
        color: p.color, textAlign: p.align, lineHeight: p.lineHeight,
        letterSpacing: `${p.letterSpacing}px`, padding: 0, border: 'none',
      }}
    />
  );
}

/** Axis-aligned resize math (rotation ignored for the MVP). */
function resize(orig, handle, dx, dy) {
  let { x, y, width, height } = orig;
  if (handle.includes('e')) width = Math.max(8, orig.width + dx);
  if (handle.includes('s')) height = Math.max(8, orig.height + dy);
  if (handle.includes('w')) { width = Math.max(8, orig.width - dx); x = orig.x + (orig.width - width); }
  if (handle.includes('n')) { height = Math.max(8, orig.height - dy); y = orig.y + (orig.height - height); }
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function cursorFor(name) {
  const map = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
  return map[name] || 'pointer';
}
