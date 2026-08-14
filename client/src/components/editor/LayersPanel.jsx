import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Combine,
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Layers as LayersIcon,
  Lock,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Shapes,
  SquareStack,
  Trash2,
  Type,
  Ungroup,
  X,
} from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useEditor } from '../../state/EditorContext.jsx';
import { useLayerActions } from '../../state/useLayerActions.js';
import { useMergeLayers } from '../../state/useMergeLayers.js';
import { newElementId } from '../../design/operations.js';
import { defaultPropertiesFor } from '../../design/schema.js';
import { TYPE_META, layerLabel, typeLabel } from '../../design/layers.js';
import { childrenOf, descendantIds, flattenPanel, indexById } from '../../design/tree.js';
import { getIcon } from '../../design/icons.js';
import { EmptyState, IconButton, Spinner, Tooltip } from '../../ui/primitives.jsx';
import { ContextMenu, MenuDivider, MenuItem, Popover } from '../../ui/overlay.jsx';

const INDENT = 12; // px per nesting level — enough to read, not enough to waste

/**
 * The layer stack, front to back, mirroring the canvas exactly: the same order,
 * the same nesting, the same selection. Rows can be renamed in place, dragged
 * into and out of groups, and carry the full layer menu on right-click.
 */
export default function LayersPanel({ renamingId, onRename }) {
  const { state, actions } = useEditor();
  const layers = useLayerActions();
  const merge = useMergeLayers();
  const { document: doc, selectedIds } = state;
  const elements = doc.elements;

  const [collapsed, setCollapsed] = useState(() => new Set());
  const [drag, setDrag] = useState(null); // { ids, active }
  const [drop, setDrop] = useState(null); // { rowId, kind, parentId, index }
  const [menu, setMenu] = useState(null); // { x, y, id }
  const [addingLayer, setAddingLayer] = useState(false);

  const listRef = useRef(null);
  const rows = useMemo(
    () => flattenPanel(elements, (id) => collapsed.has(id)),
    [elements, collapsed]
  );
  const byId = useMemo(() => indexById(elements), [elements]);
  const groupCount = useMemo(() => elements.filter((el) => el.type === 'group').length, [elements]);

  // Selecting on the canvas has to reveal the layer, including inside a group
  // that happens to be collapsed.
  useEffect(() => {
    const id = selectedIds[selectedIds.length - 1];
    if (!id) return;
    listRef.current?.querySelector(`[data-layer-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIds]);

  const toggleCollapsed = useCallback((id) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onRowPointerDown = (e, el) => {
    if (e.button !== 0) return;
    if (e.target.closest('button, input')) return;

    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      actions.toggleSelect(el.id);
      return; // building a selection, not moving it
    }
    const already = selectedIds.includes(el.id);
    if (already) actions.setEntered(el.parentId || null);
    else actions.select(el.id, el.parentId || null);

    // Pressing on a row inside a multi-selection keeps the set so it can be
    // dragged as one; releasing without moving narrows to just that row.
    beginDrag(e, already ? selectedIds : [el.id], already && selectedIds.length > 1 ? el : null);
  };

  /* ------------------------------ drag & drop ---------------------------- */

  const dragRef = useRef(null);
  const dropRef = useRef(null);

  // Stable listener identities: a re-render mid-drag must never orphan a window
  // listener, so the live handlers are swapped through refs.
  const moveRef = useRef(null);
  const upRef = useRef(null);
  const listeners = useRef({
    move: (e) => moveRef.current?.(e),
    up: (e) => upRef.current?.(e),
  }).current;

  const beginDrag = (e, ids, collapseTo) => {
    dragRef.current = { ids, collapseTo, startY: e.clientY, active: false };
    window.addEventListener('pointermove', listeners.move);
    window.addEventListener('pointerup', listeners.up);
  };

  moveRef.current = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active) {
      if (Math.abs(e.clientY - d.startY) < 4) return;
      d.active = true;
      setDrag({ ids: d.ids });
    }

    // Keep the list moving when the pointer reaches either edge.
    const list = listRef.current;
    if (list) {
      const box = list.getBoundingClientRect();
      if (e.clientY < box.top + 24) list.scrollTop -= 8;
      else if (e.clientY > box.bottom - 24) list.scrollTop += 8;
    }

    const target = resolveDrop(e.clientY, d.ids);
    dropRef.current = target;
    setDrop(target);
  };

  upRef.current = () => {
    const d = dragRef.current;
    const target = dropRef.current;
    dragRef.current = null;
    dropRef.current = null;
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
    setDrag(null);
    setDrop(null);
    if (!d?.active) {
      if (d?.collapseTo) actions.select(d.collapseTo.id, d.collapseTo.parentId || null);
      return;
    }
    if (!target) return;
    layers.moveTo(d.ids, target.parentId, target.index);
    if (target.kind === 'inside') setCollapsed((c) => new Set([...c].filter((id) => id !== target.parentId)));
  };

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', listeners.move);
      window.removeEventListener('pointerup', listeners.up);
    },
    [listeners]
  );

  /**
   * Turns a pointer position into a real destination: above a row, below it, or
   * inside a group. Indices count the destination row with the dragged layers
   * already removed, which is what the reorder operation expects.
   */
  function resolveDrop(clientY, movingIds) {
    const list = listRef.current;
    if (!list) return null;
    const moving = new Set(movingIds);
    for (const id of movingIds) for (const child of descendantIds(elements, id)) moving.add(child);

    const node = window.document.elementFromPoint(list.getBoundingClientRect().left + 20, clientY)?.closest?.('[data-layer-id]');
    if (!node) {
      // Past the end of the list: send to the very back of the document.
      const box = list.getBoundingClientRect();
      if (clientY <= box.top || clientY >= box.bottom) return null;
      return { rowId: null, kind: 'after', parentId: null, index: 0 };
    }

    const id = node.getAttribute('data-layer-id');
    if (moving.has(id)) return null;
    const target = byId.get(id);
    if (!target) return null;

    const box = node.getBoundingClientRect();
    const ratio = (clientY - box.top) / box.height;
    const isGroup = target.type === 'group';

    if (isGroup && ratio > 0.28 && ratio < 0.72) {
      const inside = childrenOf(elements, id).filter((el) => !moving.has(el.id));
      return { rowId: id, kind: 'inside', parentId: id, index: inside.length };
    }

    const parentId = target.parentId || null;
    const siblings = childrenOf(elements, parentId).filter((el) => !moving.has(el.id));
    const slot = siblings.findIndex((el) => el.id === id);
    if (slot === -1) return null;
    // The panel runs front to back, so "above" means a higher slot.
    return ratio < 0.5
      ? { rowId: id, kind: 'before', parentId, index: slot + 1 }
      : { rowId: id, kind: 'after', parentId, index: slot };
  }

  /* -------------------------------- render ------------------------------- */

  const selectedSet = new Set(selectedIds);
  const menuTarget = menu ? byId.get(menu.id) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-line pl-3 pr-1.5">
        <span className="num flex-1 text-2xs text-ink-3">
          {elements.length} {elements.length === 1 ? 'layer' : 'layers'}
        </span>
        {groupCount > 0 && (
          <Tooltip label={collapsed.size ? 'Expand all' : 'Collapse all'} side="bottom">
            <IconButton
              size="sm"
              aria-label={collapsed.size ? 'Expand all groups' : 'Collapse all groups'}
              onClick={() =>
                setCollapsed(collapsed.size ? new Set() : new Set(elements.filter((el) => el.type === 'group').map((el) => el.id)))
              }
            >
              {collapsed.size ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip label="Group selection" hint="⌘G" side="bottom">
          <IconButton
            size="sm"
            aria-label="Group selection"
            disabled={!layers.canGroup()}
            onClick={() => layers.group()}
          >
            <FolderPlus size={13} />
          </IconButton>
        </Tooltip>
        <Tooltip label="Add layer" side="bottom">
          <IconButton size="sm" aria-label="Add layer" onClick={() => setAddingLayer(true)}>
            <Plus size={14} />
          </IconButton>
        </Tooltip>
        <Popover
          align="end"
          panelClassName="w-48"
          button={({ toggle }) => (
            <IconButton size="sm" aria-label="More layer actions" onClick={toggle}>
              <MoreHorizontal size={13} />
            </IconButton>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={Combine}
                disabled={!merge.canMergeVisible() || merge.busy}
                onClick={() => {
                  close();
                  merge.mergeVisible();
                }}
              >
                Merge visible
              </MenuItem>
              <MenuItem
                icon={SquareStack}
                disabled={!merge.canMergeVisible() || merge.busy}
                onClick={() => {
                  close();
                  merge.flatten();
                }}
              >
                Flatten image
              </MenuItem>
            </>
          )}
        </Popover>
        {merge.busy && <Spinner size={13} />}
      </header>

      {addingLayer && <AddLayerModal onClose={() => setAddingLayer(false)} />}

      {rows.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          title="No layers yet"
          body="Place something from the tool rail, or ask Apollo to draw a first draft."
        />
      ) : (
        <div ref={listRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto py-1">
          {rows.map(({ element: el, depth }) => (
            <LayerRow
              key={el.id}
              element={el}
              depth={depth}
              selected={selectedSet.has(el.id)}
              inherited={{
                hidden: isInherited(byId, el, 'hidden'),
                locked: isInherited(byId, el, 'locked'),
              }}
              collapsed={collapsed.has(el.id)}
              renaming={renamingId === el.id}
              dragging={drag?.ids.includes(el.id)}
              drop={drop?.rowId === el.id ? drop.kind : null}
              onPointerDown={(e) => onRowPointerDown(e, el)}
              onToggleCollapsed={() => toggleCollapsed(el.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selectedSet.has(el.id)) actions.select(el.id, el.parentId || null);
                setMenu({ x: e.clientX, y: e.clientY, id: el.id });
              }}
              onStartRename={() => onRename?.(el.id)}
              onCommitRename={(value) => {
                layers.rename(el.id, value);
                onRename?.(null);
              }}
              onCancelRename={() => onRename?.(null)}
              onToggleHidden={() => layers.toggleHidden([el.id])}
              onToggleLocked={() => layers.toggleLocked([el.id])}
            />
          ))}
        </div>
      )}

      {menu && menuTarget && (
        <LayerMenu
          x={menu.x}
          y={menu.y}
          element={menuTarget}
          selectionCount={selectedIds.length}
          layers={layers}
          onRename={() => onRename?.(menu.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

const isInherited = (byId, el, key) => {
  let cursor = el.parentId ? byId.get(el.parentId) : null;
  const seen = new Set([el.id]);
  while (cursor && !seen.has(cursor.id)) {
    if (cursor[key]) return true;
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return false;
};

/* --------------------------------- row ---------------------------------- */

function LayerRow({
  element: el,
  depth,
  selected,
  inherited,
  collapsed,
  renaming,
  dragging,
  drop,
  onPointerDown,
  onToggleCollapsed,
  onContextMenu,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onToggleHidden,
  onToggleLocked,
}) {
  const group = el.type === 'group';
  const dimmed = el.hidden || inherited.hidden;
  const locked = el.locked || inherited.locked;

  return (
    <div
      data-layer-id={el.id}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
      onDoubleClick={(e) => {
        if (e.target.closest('button')) return;
        onStartRename();
      }}
      className={cx(
        'group relative flex h-7 cursor-default select-none items-stretch pr-1 text-[13px] transition-colors duration-100',
        selected ? 'bg-raised text-ink' : 'text-ink-2 hover:bg-raised/55',
        dragging && 'opacity-40',
        drop === 'inside' && 'ring-1 ring-inset ring-accent'
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
      {drop === 'before' && <span className="pointer-events-none absolute -top-px left-0 right-1 z-10 h-[2px] bg-accent" />}
      {drop === 'after' && <span className="pointer-events-none absolute -bottom-px left-0 right-1 z-10 h-[2px] bg-accent" />}

      <span className="flex shrink-0" style={{ marginLeft: 6 }} aria-hidden="true">
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} className="h-full border-l border-line" style={{ width: INDENT }} />
        ))}
      </span>

      {group ? (
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
          aria-expanded={!collapsed}
          className="flex w-4 shrink-0 items-center justify-center text-ink-3 transition-colors hover:text-ink"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}

      <span className={cx('flex w-5 shrink-0 items-center justify-center', dimmed && 'opacity-45')}>
        <LayerGlyph element={el} selected={selected} />
      </span>

      {renaming ? (
        <input
          autoFocus
          defaultValue={layerLabel(el)}
          onFocus={(e) => e.target.select()}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => onCommitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCancelRename();
            }
          }}
          className="my-1 min-w-0 flex-1 rounded-sm border border-accent/70 bg-surface px-1 text-[13px] text-ink outline-none"
        />
      ) : (
        <span
          className={cx('min-w-0 flex-1 self-center truncate pl-1.5', dimmed && 'text-ink-3 line-through decoration-ink-3/40')}
          title={`${layerLabel(el)} · ${typeLabel(el)}`}
        >
          {layerLabel(el)}
        </span>
      )}

      <span className="flex shrink-0 items-center">
        <IconButton
          size="sm"
          aria-label={el.locked ? 'Unlock layer' : 'Lock layer'}
          title={inherited.locked ? 'Locked by its group' : el.locked ? 'Unlock' : 'Lock'}
          disabled={inherited.locked && !el.locked}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLocked();
          }}
          className={cx(
            !locked && 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
            locked && !el.locked && 'opacity-40'
          )}
        >
          {locked ? <Lock size={12} /> : <LockOpen size={12} />}
        </IconButton>
        <IconButton
          size="sm"
          aria-label={el.hidden ? 'Show layer' : 'Hide layer'}
          title={inherited.hidden ? 'Hidden by its group' : el.hidden ? 'Show' : 'Hide'}
          disabled={inherited.hidden && !el.hidden}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
          className={cx(
            !dimmed && 'opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
            dimmed && !el.hidden && 'opacity-40'
          )}
        >
          {dimmed ? <EyeOff size={12} /> : <Eye size={12} />}
        </IconButton>
      </span>
    </div>
  );
}

/** A colour chip or real thumbnail where that identifies the layer faster. */
function LayerGlyph({ element: el, selected }) {
  const p = el.properties || {};
  const tint = selected ? 'text-accent-text' : 'text-ink-3';

  if (el.type === 'image' && p.src) {
    return <img src={p.src} alt="" className="h-4 w-4 rounded-[3px] border border-line-strong object-cover" />;
  }
  if (el.type === 'rectangle' || el.type === 'circle') {
    return (
      <span
        className={cx('h-3.5 w-3.5 border border-line-strong', el.type === 'circle' ? 'rounded-full' : 'rounded-[3px]')}
        style={{ background: p.fill, opacity: p.fillOpacity ?? 1 }}
      />
    );
  }
  if (el.type === 'polygon' || el.type === 'star') {
    const Shape = TYPE_META[el.type].icon;
    return <Shape size={13} fill={p.fill} stroke={p.fill} style={{ opacity: p.fillOpacity ?? 1 }} />;
  }
  if (el.type === 'button') {
    return <span className="h-2.5 w-4 rounded-[3px] border border-line-strong" style={{ background: p.background }} />;
  }
  if (el.type === 'line') {
    return <span className="h-[2px] w-4 rounded-full" style={{ background: p.stroke }} />;
  }
  if (el.type === 'icon') {
    const Icon = getIcon(p.name, p.library);
    return <Icon size={13} className={tint} />;
  }
  const Icon = TYPE_META[el.type]?.icon || TYPE_META.rectangle.icon;
  return <Icon size={13} className={tint} />;
}

/* ------------------------------ context menu ----------------------------- */

export function LayerMenu({ x, y, element, selectionCount, layers, onRename, onClose }) {
  const { state } = useEditor();
  const merge = useMergeLayers();
  const many = selectionCount > 1;
  const run = (fn) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <p className="label truncate px-2 pb-1 pt-1.5">{many ? `${selectionCount} layers` : layerLabel(element)}</p>
      <MenuItem icon={Pencil} hint="F2" disabled={many} onClick={run(onRename)}>
        Rename
      </MenuItem>
      <MenuItem icon={Copy} hint="⌘D" onClick={run(() => layers.duplicate())}>
        Duplicate
      </MenuItem>
      <MenuDivider />
      <MenuItem icon={element.hidden ? Eye : EyeOff} hint="⇧⌘H" onClick={run(() => layers.toggleHidden())}>
        {element.hidden ? 'Show' : 'Hide'}
      </MenuItem>
      <MenuItem icon={element.locked ? LockOpen : Lock} hint="⇧⌘L" onClick={run(() => layers.toggleLocked())}>
        {element.locked ? 'Unlock' : 'Lock'}
      </MenuItem>
      <MenuDivider />
      <MenuItem icon={ArrowUp} hint="]" onClick={run(() => layers.arrange('forward'))}>
        Bring forward
      </MenuItem>
      <MenuItem icon={ArrowDown} hint="[" onClick={run(() => layers.arrange('backward'))}>
        Send backward
      </MenuItem>
      <MenuItem icon={ArrowUpToLine} hint="⌘]" onClick={run(() => layers.arrange('front'))}>
        Bring to front
      </MenuItem>
      <MenuItem icon={ArrowDownToLine} hint="⌘[" onClick={run(() => layers.arrange('back'))}>
        Send to back
      </MenuItem>
      <MenuDivider />
      <MenuItem icon={FolderPlus} hint="⌘G" disabled={!layers.canGroup()} onClick={run(() => layers.group())}>
        Group
      </MenuItem>
      <MenuItem icon={Ungroup} hint="⇧⌘G" disabled={!layers.canUngroup()} onClick={run(() => layers.ungroup())}>
        Ungroup
      </MenuItem>
      <MenuDivider />
      {many ? (
        <MenuItem icon={Combine} disabled={merge.busy} onClick={run(() => merge.merge(state.selectedIds))}>
          Merge selected
        </MenuItem>
      ) : (
        <MenuItem icon={Combine} disabled={merge.busy} onClick={run(() => merge.mergeDown([element.id]))}>
          Merge down
        </MenuItem>
      )}
      <MenuDivider />
      <MenuItem icon={Trash2} hint="⌫" danger onClick={run(() => layers.remove())}>
        Delete
      </MenuItem>
    </ContextMenu>
  );
}

/** Popup for the Layers panel's "+" — pick a starting element, or cancel. */
function AddLayerModal({ onClose }) {
  const { state, actions } = useEditor();
  const canvas = state.document.canvas;

  const add = (build) => {
    const id = newElementId('layer');
    const el = build(id);
    actions.apply([{ type: 'CREATE_ELEMENT', element: el }], { selectIds: [id] });
    onClose();
  };

  const centered = (w, h) => ({ x: Math.round(canvas.width / 2 - w / 2), y: Math.round(canvas.height / 2 - h / 2), width: w, height: h });

  const options = [
    {
      id: 'image', label: 'Empty image', icon: ImageIcon,
      create: () => add((id) => ({ id, type: 'image', ...centered(480, 320), properties: defaultPropertiesFor('image') })),
    },
    {
      id: 'frame', label: 'Frame', icon: SquareStack,
      create: () => add((id) => ({ id, type: 'rectangle', ...centered(480, 320), properties: { ...defaultPropertiesFor('rectangle'), fillOpacity: 0, borderColor: '#8C8C8C', borderWidth: 2 } })),
    },
    {
      id: 'text', label: 'Text', icon: Type,
      create: () => add((id) => ({ id, type: 'text', ...centered(360, 60), properties: { ...defaultPropertiesFor('text'), text: 'New text' } })),
    },
    {
      id: 'shape', label: 'Shape', icon: Shapes,
      create: () => add((id) => ({ id, type: 'rectangle', ...centered(240, 160), properties: defaultPropertiesFor('rectangle') })),
    },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-72 rounded-xl border border-line bg-surface p-4 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-medium text-ink">Add layer</p>
          <IconButton size="sm" onClick={onClose} aria-label="Close"><X size={14} /></IconButton>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {options.map(({ id, label, icon: Icon, create }) => (
            <button
              key={id}
              onClick={create}
              className="flex flex-col items-center gap-2 rounded-lg border border-line bg-raised py-4 text-ink-2 transition-colors hover:border-accent hover:text-ink"
            >
              <Icon size={20} />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-3 h-8 w-full rounded border border-line text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
