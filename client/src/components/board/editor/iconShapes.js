import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ICON_COMPONENTS } from './iconComponents.js';

/**
 * Lucide icon → Fabric objects.
 *
 * Lucide icons are a handful of SVG primitives on a 24×24 grid. Each icon is
 * rendered once to markup, parsed into its primitives (no DOM needed), cached,
 * and rebuilt as Fabric paths/circles/lines for every place it is used.
 */

const PRIMITIVE = /<(path|circle|ellipse|rect|line|polyline|polygon)\s([^>]*?)\/?>/g;
const ATTRIBUTE = /([a-zA-Z][\w-]*)="([^"]*)"/g;

const cache = new Map();

/** [{ tag, attrs }] for one icon, or null when the name is unknown. */
export function iconParts(name) {
  if (cache.has(name)) return cache.get(name);
  const Component = ICON_COMPONENTS[name];
  let parts = null;
  if (Component) {
    const markup = renderToStaticMarkup(createElement(Component, { size: 24, strokeWidth: 2 }));
    parts = [];
    for (const m of markup.matchAll(PRIMITIVE)) {
      const attrs = {};
      for (const a of m[2].matchAll(ATTRIBUTE)) attrs[a[1]] = a[2];
      parts.push({ tag: m[1], attrs });
    }
  }
  cache.set(name, parts);
  return parts;
}

const num = (v, fallback = 0) => (v === undefined ? fallback : Number(v));

/**
 * A Fabric group for one icon, laid out on its own 24-unit grid: the glyph in
 * a transparent 24×24 frame, plus a 46-unit disc behind it when `disc` is a
 * colour. The caller scales it to its final size.
 */
export function buildIconGroup(fabric, name, color, disc) {
  const parts = iconParts(name) || iconParts('circle-help') || [];
  const style = {
    fill: null, stroke: color, strokeWidth: 2, strokeLineCap: 'round', strokeLineJoin: 'round',
    originX: 'left', originY: 'top', objectCaching: false,
  };
  const objects = [];
  if (disc) {
    objects.push(new fabric.Circle({ radius: 23, left: -11, top: -11, fill: disc, stroke: null, strokeWidth: 0, originX: 'left', originY: 'top', data: { disc: true } }));
  }
  objects.push(new fabric.Rect({ left: 0, top: 0, width: 24, height: 24, fill: null, stroke: null, strokeWidth: 0, originX: 'left', originY: 'top' }));

  for (const { tag, attrs } of parts) {
    switch (tag) {
      case 'path':
        objects.push(new fabric.Path(attrs.d, style));
        break;
      case 'circle': {
        const r = num(attrs.r);
        objects.push(new fabric.Circle({ ...style, radius: r, left: num(attrs.cx) - r, top: num(attrs.cy) - r }));
        break;
      }
      case 'ellipse': {
        const rx = num(attrs.rx);
        const ry = num(attrs.ry);
        objects.push(new fabric.Ellipse({ ...style, rx, ry, left: num(attrs.cx) - rx, top: num(attrs.cy) - ry }));
        break;
      }
      case 'rect':
        objects.push(new fabric.Rect({
          ...style, left: num(attrs.x), top: num(attrs.y), width: num(attrs.width), height: num(attrs.height), rx: num(attrs.rx), ry: num(attrs.ry || attrs.rx),
        }));
        break;
      case 'line':
        objects.push(new fabric.Line([num(attrs.x1), num(attrs.y1), num(attrs.x2), num(attrs.y2)], style));
        break;
      case 'polyline':
      case 'polygon': {
        const nums = (attrs.points || '').trim().split(/[\s,]+/).map(Number);
        const points = [];
        for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
        objects.push(tag === 'polygon' ? new fabric.Polygon(points, style) : new fabric.Polyline(points, style));
        break;
      }
      default:
        break;
    }
  }
  return new fabric.Group(objects, { originX: 'left', originY: 'top', subTargetCheck: false, objectCaching: false });
}

/** Change the stroke colour of an icon group built by `buildIconGroup`. */
export function recolorIcon(inner, color) {
  for (const obj of inner.getObjects()) {
    if (obj.data?.disc) continue;
    if (obj.stroke) obj.set('stroke', color);
  }
  inner.dirty = true;
}
