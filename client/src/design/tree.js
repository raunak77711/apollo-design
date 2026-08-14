/**
 * The Apollo layer tree — MIRROR of server/src/design/tree.js.
 *
 * Elements stay in one flat array (nothing about persistence, AI operations or
 * rendering changes), but `parentId` describes nesting and is the single source
 * of truth for it. A group's `children` array is *derived* from that and kept in
 * the document only so older files and AI output keep working.
 *
 * `zIndex` is meaningful between siblings only, and is renumbered to 1..n after
 * every write, so the Layers panel order and the painted stacking order can
 * never drift apart.
 */

export function indexById(elements) {
  const map = new Map();
  for (const el of elements) map.set(el.id, el);
  return map;
}

/** parentId -> siblings, back to front. Built once per traversal. */
export function childrenMap(elements) {
  const map = new Map();
  for (const el of elements) {
    const key = el.parentId || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(el);
  }
  for (const list of map.values()) list.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  return map;
}

export function childrenOf(elements, parentId = null) {
  return elements
    .filter((el) => (el.parentId || null) === (parentId || null))
    .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
}

/** Nearest ancestor first. Cycle-safe. */
export function ancestorIds(elements, id, byId = indexById(elements)) {
  const out = [];
  const seen = new Set([id]);
  let current = byId.get(id);
  while (current?.parentId && !seen.has(current.parentId)) {
    out.push(current.parentId);
    seen.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return out;
}

export function descendantIds(elements, id) {
  const kids = childrenMap(elements);
  const out = [];
  const stack = [id];
  while (stack.length) {
    for (const child of kids.get(stack.pop()) || []) {
      out.push(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

/** ids plus everything nested inside them — what a group drag really moves. */
export function expandWithDescendants(elements, ids) {
  const out = new Set(ids);
  for (const id of ids) for (const child of descendantIds(elements, id)) out.add(child);
  return [...out];
}

/** Drops ids whose ancestor is already in the list, so nothing moves twice. */
export function topLevelOf(elements, ids) {
  const set = new Set(ids);
  const byId = indexById(elements);
  return ids.filter((id) => !ancestorIds(elements, id, byId).some((parent) => set.has(parent)));
}

/** Back to front, depth first: exactly the order the canvas paints in. */
export function flattenPaint(elements) {
  const kids = childrenMap(elements);
  const out = [];
  const walk = (parentId, depth) => {
    for (const el of kids.get(parentId || '') || []) {
      out.push({ element: el, depth });
      if (el.type === 'group') walk(el.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Front to back, skipping collapsed subtrees: the Layers panel order. */
export function flattenPanel(elements, isCollapsed = () => false) {
  const kids = childrenMap(elements);
  const out = [];
  const walk = (parentId, depth) => {
    const siblings = [...(kids.get(parentId || '') || [])].reverse();
    for (const el of siblings) {
      const group = el.type === 'group';
      const collapsed = group && isCollapsed(el.id);
      out.push({ element: el, depth, group, collapsed });
      if (group && !collapsed) walk(el.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function boundsOf(elements) {
  if (!elements || elements.length === 0) return null;
  const x = Math.min(...elements.map((e) => e.x));
  const y = Math.min(...elements.map((e) => e.y));
  const right = Math.max(...elements.map((e) => e.x + e.width));
  const bottom = Math.max(...elements.map((e) => e.y + e.height));
  return { x, y, width: right - x, height: bottom - y, right, bottom };
}

/** Hidden/locked are inherited: a locked group locks everything inside it. */
export function inherits(elements, el, key, byId = indexById(elements)) {
  if (!el) return false;
  if (el[key]) return true;
  return ancestorIds(elements, el.id, byId).some((id) => byId.get(id)?.[key]);
}

/** Group opacity multiplies down the tree, the way nested layers behave. */
export function effectiveOpacity(elements, el, byId = indexById(elements)) {
  let value = el.opacity ?? 1;
  for (const id of ancestorIds(elements, el.id, byId)) value *= byId.get(id)?.opacity ?? 1;
  return value;
}

/* ------------------------------ normalisation ---------------------------- */

/**
 * Repairs and renumbers the tree after a batch of operations: drops impossible
 * parents, removes groups that have been emptied, renumbers siblings 1..n, and
 * refits every group to what it holds. Elements that come out unchanged keep
 * their identity so React can skip them.
 *
 * `adopt` turns on the one-way migration from a legacy `children` list to
 * `parentId`. It belongs to loading a document, never to editing one: after the
 * first pass `children` is derived output, and re-reading it would undo any
 * layer that had just been dragged out of its group.
 */
export function normalizeTree(doc, { adopt = false } = {}) {
  const source = doc?.elements || [];
  if (source.length === 0) return doc;

  const original = indexById(source);
  let working = source.map((el) => ({ ...el }));
  const map = indexById(working);

  // 1. Older documents describe a group by its `children` list alone.
  if (adopt) {
    for (const el of working) {
      if (el.type !== 'group' || !Array.isArray(el.children)) continue;
      for (const childId of el.children) {
        const child = map.get(childId);
        if (child && !child.parentId && childId !== el.id) child.parentId = el.id;
      }
    }
  }

  // 2. A parent must exist, be a group, and not sit inside its own child.
  for (const el of working) {
    if (!el.parentId) continue;
    const parent = map.get(el.parentId);
    if (!parent || parent.type !== 'group' || parent.id === el.id) {
      delete el.parentId;
      continue;
    }
    const seen = new Set([el.id]);
    let cursor = parent;
    while (cursor) {
      if (seen.has(cursor.id)) {
        delete el.parentId;
        break;
      }
      seen.add(cursor.id);
      cursor = cursor.parentId ? map.get(cursor.parentId) : null;
    }
  }

  // 3. An empty group is noise — emptying one removes it, which can empty its
  //    own parent in turn.
  for (;;) {
    const occupied = new Set(working.map((el) => el.parentId).filter(Boolean));
    const empty = working.filter((el) => el.type === 'group' && !occupied.has(el.id));
    if (empty.length === 0) break;
    const gone = new Set(empty.map((el) => el.id));
    working = working.filter((el) => !gone.has(el.id));
    for (const el of working) if (el.parentId && gone.has(el.parentId)) delete el.parentId;
  }

  // 4. Renumber each sibling row so panel order and paint order are identical.
  const rows = new Map();
  for (const el of working) {
    const key = el.parentId || '';
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(el);
  }
  for (const siblings of rows.values()) {
    siblings.sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    siblings.forEach((el, i) => {
      el.zIndex = i + 1;
    });
  }

  // 5. A group's frame is exactly what it contains — measured deepest first so
  //    nested groups are already correct when their parent is measured.
  const groups = working.filter((el) => el.type === 'group');
  const depthOf = (el) => {
    let depth = 0;
    let cursor = el;
    const seen = new Set();
    while (cursor?.parentId && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      cursor = working.find((e) => e.id === cursor.parentId);
      depth += 1;
    }
    return depth;
  };
  groups.sort((a, b) => depthOf(b) - depthOf(a));
  for (const group of groups) {
    const kids = rows.get(group.id) || [];
    if (kids.length === 0) continue;
    const box = boundsOf(kids);
    group.x = box.x;
    group.y = box.y;
    group.width = Math.max(1, box.width);
    group.height = Math.max(1, box.height);
    group.children = kids.map((k) => k.id);
  }

  let changed = working.length !== source.length;
  const elements = working.map((el) => {
    const before = original.get(el.id);
    if (before && sameElement(before, el)) return before;
    changed = true;
    return el;
  });

  return changed ? { ...doc, elements } : doc;
}

function sameElement(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === 'children') {
      const x = a.children || [];
      const y = b.children || [];
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
      continue;
    }
    if (a[key] !== b[key]) return false;
  }
  return true;
}
