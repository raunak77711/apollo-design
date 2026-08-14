/**
 * Apollo canonical design-document schema helpers.
 *
 * MIRROR of server/src/design/schema.js — keep the two in sync. Pure &
 * dependency-free so the same validation/sanitization runs on both sides.
 */

export const SCHEMA_VERSION = 1;

export const ELEMENT_TYPES = [
  'text',
  'image',
  'icon',
  'rectangle',
  'circle',
  'line',
  'button',
  'group',
];

export const ALLOWED_ICONS = [
  'Home', 'Search', 'Heart', 'User', 'Settings', 'ShoppingCart', 'MapPin',
  'Calendar', 'Mail', 'Phone', 'ArrowRight', 'Check', 'X', 'Menu', 'Instagram',
  'Facebook', 'Star', 'Dumbbell', 'Briefcase', 'Building', 'Camera', 'Image',
  'Upload', 'Download', 'Play', 'Flame', 'Zap', 'Trophy', 'Clock', 'Award',
];

const BASE_ELEMENT = { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, zIndex: 1 };

const DEFAULT_PROPERTIES = {
  text: {
    text: 'Text', fontFamily: 'Inter', fontSize: 32, fontWeight: 600,
    color: '#FFFFFF', align: 'left', lineHeight: 1.2, letterSpacing: 0,
  },
  image: {
    src: '', alt: '', fit: 'cover', borderRadius: 0,
    brightness: 100, contrast: 100, saturation: 100, blur: 0,
    hue: 0, grayscale: 0,
  },
  icon: { name: 'Star', size: 48, color: '#FFFFFF', strokeWidth: 2 },
  rectangle: { fill: '#D9A441', borderRadius: 0, borderColor: '', borderWidth: 0 },
  circle: { fill: '#D9A441', borderColor: '', borderWidth: 0 },
  line: { stroke: '#FFFFFF', strokeWidth: 2 },
  button: {
    text: 'Button', fontFamily: 'Inter', fontSize: 18, fontWeight: 700,
    color: '#141005', background: '#D9A441', borderRadius: 6, align: 'center',
  },
  group: {},
};

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function createEmptyDocument({ width = 1200, height = 628, background = '#0A0A0A' } = {}) {
  return { version: SCHEMA_VERSION, type: 'design', canvas: { width, height, background }, elements: [] };
}

export function defaultPropertiesFor(type) {
  return { ...(DEFAULT_PROPERTIES[type] || {}) };
}

export function makeElement(type, spec = {}, idFactory) {
  if (!ELEMENT_TYPES.includes(type)) throw new Error(`Unknown element type: ${type}`);
  const id = spec.id || (idFactory ? idFactory() : `${type}-${Math.random().toString(36).slice(2, 9)}`);
  const el = {
    id,
    type,
    x: num(spec.x, BASE_ELEMENT.x),
    y: num(spec.y, BASE_ELEMENT.y),
    width: Math.max(1, num(spec.width, BASE_ELEMENT.width)),
    height: Math.max(1, num(spec.height, BASE_ELEMENT.height)),
    rotation: num(spec.rotation, BASE_ELEMENT.rotation),
    opacity: clamp(num(spec.opacity, BASE_ELEMENT.opacity), 0, 1),
    zIndex: num(spec.zIndex, BASE_ELEMENT.zIndex),
    properties: sanitizeProperties(type, { ...spec.properties, ...pickInlineProps(type, spec) }),
  };
  if (type === 'group') el.children = Array.isArray(spec.children) ? spec.children : [];
  return el;
}

function pickInlineProps(type, spec) {
  const keys = Object.keys(DEFAULT_PROPERTIES[type] || {});
  const out = {};
  for (const k of keys) if (spec[k] !== undefined) out[k] = spec[k];
  return out;
}

export function sanitizeProperties(type, props = {}) {
  const defaults = DEFAULT_PROPERTIES[type] || {};
  const out = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (props[key] === undefined) continue;
    out[key] = props[key];
  }
  if (type === 'icon' && !ALLOWED_ICONS.includes(out.name)) out.name = 'Star';
  return out;
}

export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.canvas || typeof doc.canvas.width !== 'number') return false;
  if (!Array.isArray(doc.elements)) return false;
  return true;
}
