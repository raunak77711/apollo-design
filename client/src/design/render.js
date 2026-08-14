/**
 * How a layer's frame is drawn — shared by the canvas and by every preview, so
 * a design looks identical wherever it appears.
 *
 * Group state cascades here rather than in the renderers: a hidden or faded
 * group has to affect what is inside it, but children still paint as ordinary
 * top-level elements so stacking stays flat and cheap.
 */

import { ancestorIds, indexById } from './tree.js';

/** Ancestor state resolved once per render pass. */
export function layerState(elements, byId = indexById(elements)) {
  const cache = new Map();

  return function stateOf(el) {
    if (cache.has(el.id)) return cache.get(el.id);
    let hidden = Boolean(el.hidden);
    let locked = Boolean(el.locked);
    let opacity = el.opacity ?? 1;
    for (const id of ancestorIds(elements, el.id, byId)) {
      const parent = byId.get(id);
      if (!parent) continue;
      hidden = hidden || Boolean(parent.hidden);
      locked = locked || Boolean(parent.locked);
      opacity *= parent.opacity ?? 1;
    }
    const value = { hidden, locked, opacity };
    cache.set(el.id, value);
    return value;
  };
}

export function transformOf(el) {
  const parts = [];
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`);
  if (el.flipH) parts.push('scaleX(-1)');
  if (el.flipV) parts.push('scaleY(-1)');
  return parts.length ? parts.join(' ') : undefined;
}

/** Shadow and layer blur sit on an inner wrapper so selection UI stays crisp. */
export function contentFilter(el) {
  const parts = [];
  if (el.shadow) parts.push(`drop-shadow(${el.shadow.x || 0}px ${el.shadow.y || 0}px ${el.shadow.blur || 0}px ${el.shadow.color})`);
  if (el.layerBlur) parts.push(`blur(${el.layerBlur}px)`);
  return parts.length ? parts.join(' ') : undefined;
}

/** The absolutely-positioned box a layer occupies on the artboard. */
export function frameStyle(el, { opacity = el.opacity ?? 1, zIndex } = {}) {
  return {
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    transform: transformOf(el),
    opacity,
    zIndex,
    mixBlendMode: el.blendMode && el.blendMode !== 'normal' ? el.blendMode : undefined,
  };
}
