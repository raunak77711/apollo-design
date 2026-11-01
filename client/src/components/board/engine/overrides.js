/**
 * What the user has done to a piece, applied to where the layout put it.
 *
 * Three things can move a piece: its own override, the override of the block it
 * belongs to (a block-level move/scale/rotate acts on the block as a whole,
 * about the block's centre — this is how Direct mode says "make this diagram
 * bigger"), and the leader it follows (a browser frame's chrome, a panel's
 * rows, a step's note). Followers ride their leader's *effective* transform,
 * so a leader that was already moved, scaled or deleted takes them with it.
 */

const rad = (deg) => (deg * Math.PI) / 180;

function rotate(x, y, deg) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return { x: x * c - y * s, y: x * s + y * c };
}

const near = (v, ident) => (Math.abs(v - ident) < 1e-9 ? ident : v);

export function buildIndex(scene) {
  return { byId: new Map(scene.items.map((i) => [i.id, i])), blocks: scene.blocks };
}

/** ctx = { overrides, byId, blocks } */
export function effectiveItem(item, ctx) {
  const own = ctx.overrides[item.id] || {};
  const blockOv = ctx.overrides[item.block] || {};
  let x = item.cx;
  let y = item.cy;
  let sx = 1;
  let sy = 1;
  let angle = 0;
  let deleted = Boolean(own.deleted || blockOv.deleted);

  const leader = item.follow ? ctx.byId.get(item.follow) : null;
  if (leader) {
    const lead = effectiveItem(leader, ctx);
    const p = rotate((item.cx - leader.cx) * lead.scaleX, (item.cy - leader.cy) * lead.scaleY, lead.angle);
    x = lead.cx + p.x;
    y = lead.cy + p.y;
    sx = lead.scaleX;
    sy = lead.scaleY;
    angle = lead.angle;
    deleted = deleted || lead.deleted;
  }

  x += own.dx || 0;
  y += own.dy || 0;
  sx *= own.scaleX ?? 1;
  sy *= own.scaleY ?? 1;
  angle += own.angle || 0;

  // Followers already carry their leader's block-level transform.
  const block = ctx.blocks[item.block];
  const blockActs = block && (blockOv.dx || blockOv.dy || blockOv.scaleX != null || blockOv.scaleY != null || blockOv.angle);
  if (!leader && blockActs) {
    const bcx = block.x + block.w / 2;
    const bcy = block.y + block.h / 2;
    const bsx = blockOv.scaleX ?? 1;
    const bsy = blockOv.scaleY ?? 1;
    const p = rotate((x - bcx) * bsx, (y - bcy) * bsy, blockOv.angle || 0);
    x = bcx + p.x + (blockOv.dx || 0);
    y = bcy + p.y + (blockOv.dy || 0);
    sx *= bsx;
    sy *= bsy;
    angle += blockOv.angle || 0;
  }

  return {
    cx: x,
    cy: y,
    w: own.w ?? item.w,
    scaleX: sx,
    scaleY: sy,
    angle,
    deleted,
    text: own.text,
    style: { ...(blockOv.style || {}), ...(own.style || {}) },
  };
}

/** The axis-aligned box a connector should aim at (rotation is ignored: arrows meet the box, not its corners). */
export function effectiveRect(item, ctx) {
  const e = effectiveItem(item, ctx);
  return { cx: e.cx, cy: e.cy, w: e.w * e.scaleX, h: item.h * e.scaleY };
}

/**
 * The override that makes `item` end up exactly at `target` (a world-space
 * centre, scale and angle read off the Fabric object after a gesture).
 * Computed against the item's effective transform *without* its own override,
 * so leaders, followers and block-level overrides are all accounted for.
 */
export function overrideFromGesture(item, target, ctx) {
  const bare = effectiveItem(item, { ...ctx, overrides: { ...ctx.overrides, [item.id]: {} } });
  const patch = {
    dx: near(target.cx - bare.cx, 0),
    dy: near(target.cy - bare.cy, 0),
    scaleX: near(target.scaleX / bare.scaleX, 1),
    scaleY: near(target.scaleY / bare.scaleY, 1),
    angle: near(target.angle - bare.angle, 0),
  };
  if (item.kind === 'text' && typeof target.w === 'number' && Math.abs(target.w - item.w) > 0.5) {
    patch.w = Math.round(target.w);
  }
  return patch;
}
