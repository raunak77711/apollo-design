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
  'polygon',
  'star',
  'line',
  'button',
  'chart',
  'group',
];

export const CHART_TYPES = ['bar', 'donut', 'line'];

// Icon elements are never arbitrary SVG — only a name from one of these closed,
// per-library sets. `lucide` is the default and the only library the AI is
// asked to use (see DeepSeekProvider); the others are for manual browsing.
export const ICON_LIBRARIES = ['lucide', 'game'];

export const ALLOWED_ICONS = {
  lucide: [
    'Home', 'Search', 'Heart', 'User', 'Settings', 'ShoppingCart', 'MapPin',
    'Calendar', 'Mail', 'Phone', 'ArrowRight', 'Check', 'X', 'Menu', 'Instagram',
    'Facebook', 'Star', 'Dumbbell', 'Briefcase', 'Building', 'Camera', 'Image',
    'Upload', 'Download', 'Play', 'Flame', 'Zap', 'Trophy', 'Clock', 'Award',
    'Music', 'Car', 'Coffee', 'Leaf', 'Users', 'Gift', 'Sparkles', 'Globe',
    'Wallet', 'GraduationCap', 'Stethoscope', 'Palette', 'Rocket', 'ThumbsUp',
    'TrendingUp',
  ],
  // "Fun" set — Game Icons via react-icons/gi. Whimsical shapes Lucide doesn't
  // have: food, animals, party, nature. Browsed manually, never AI-authored.
  game: [
    'GiPartyPopper', 'GiBalloonDog', 'GiAirBalloon', 'GiCupcake', 'GiDonut',
    'GiWineGlass', 'GiCat', 'GiSittingDog', 'GiOwl', 'GiFox', 'GiPanda',
    'GiRabbit', 'GiElephant', 'GiLion', 'GiDolphin', 'GiTurtle', 'GiBee',
    'GiUnicorn', 'GiGhost', 'GiCrown', 'GiPresent', 'GiGuitar', 'GiMusicalNotes',
    'GiSunglasses', 'GiRainbowStar', 'GiSparkles', 'GiSnowflake1', 'GiCastle',
    'GiIsland', 'GiRocket', 'GiHearts', 'GiFlowers', 'GiPawPrint', 'GiTrophy',
    'GiCoffeeCup', 'GiPizzaSlice', 'GiHamburger', 'GiSoccerBall',
    'GiBasketballBall', 'GiIceCreamCone', 'GiDiamondRing', 'GiCampfire',
    'GiTreehouse', 'GiPineTree', 'GiMoon', 'GiSun', 'GiRose', 'GiMapleLeaf',
    'GiButterfly',
  ],
};

export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
];

export const TEXT_CASES = ['none', 'uppercase', 'lowercase', 'capitalize'];
export const STROKE_STYLES = ['solid', 'dashed', 'dotted'];
export const IMAGE_FITS = ['cover', 'contain', 'fill'];
export const GRADIENT_TYPES = ['linear', 'radial'];

export const DEFAULT_SHADOW = { x: 0, y: 10, blur: 24, color: '#00000059' };

// Adjustment fields that are "neutral at 0, signed either way" (±100).
export const SIGNED_ADJUST_KEYS = [
  'vibrance', 'temperature', 'tint', 'exposure', 'black', 'white',
  'highlights', 'shadowsTone', 'clarity', 'dehaze',
];
// Adjustment fields that only push in one direction (0-100).
export const UNSIGNED_ADJUST_KEYS = ['sharpen', 'smooth', 'grain', 'vignette', 'bloom', 'glamour'];

const BASE_ELEMENT = { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, zIndex: 1 };

const ZEROED = Object.fromEntries([...SIGNED_ADJUST_KEYS, ...UNSIGNED_ADJUST_KEYS].map((k) => [k, 0]));

const DEFAULT_PROPERTIES = {
  text: {
    text: 'Text', fontFamily: 'Inter', fontSize: 32, fontWeight: 600,
    color: '#FFFFFF', align: 'left', lineHeight: 1.2, letterSpacing: 0,
    italic: false, underline: false, textCase: 'none',
  },
  image: {
    src: '', alt: '', fit: 'cover', borderRadius: 0,
    // Baseline tone controls — direct CSS filter equivalents.
    brightness: 100, contrast: 100, saturation: 100, blur: 0,
    hue: 0, grayscale: 0,
    // Extended Adjust panel — Color / Light / Details / Scene. All neutral at 0.
    ...ZEROED,
    // Crop is expressed as a focal point plus a zoom, so it survives resizing.
    focalX: 50, focalY: 50, zoom: 1,
  },
  icon: { name: 'Star', library: 'lucide', size: 48, color: '#FFFFFF', strokeWidth: 2 },
  // `gradient` (null by default) overrides `fill` when set — see sanitizeGradient.
  rectangle: { fill: '#D9A441', fillOpacity: 1, borderRadius: 0, borderColor: '', borderWidth: 0, strokeStyle: 'solid', gradient: null },
  circle: { fill: '#D9A441', fillOpacity: 1, borderColor: '', borderWidth: 0, strokeStyle: 'solid', gradient: null },
  // `sides` covers triangles through dodecagons; `points`/`depth` shape a star.
  polygon: { fill: '#D9A441', fillOpacity: 1, sides: 3, borderColor: '', borderWidth: 0, strokeStyle: 'solid' },
  star: { fill: '#D9A441', fillOpacity: 1, points: 5, depth: 0.45, borderColor: '', borderWidth: 0, strokeStyle: 'solid' },
  line: { stroke: '#FFFFFF', strokeWidth: 2, strokeStyle: 'solid' },
  button: {
    text: 'Button', fontFamily: 'Inter', fontSize: 18, fontWeight: 700,
    color: '#141005', background: '#D9A441', borderRadius: 6, align: 'center',
    letterSpacing: 0, italic: false, underline: false, textCase: 'none',
    borderColor: '', borderWidth: 0, strokeStyle: 'solid',
  },
  // A chart draws its own geometry from `data` — nothing here is an AI
  // coordinate, it's numbers the model directs and the renderer plots.
  chart: {
    chartType: 'bar',
    data: [
      { label: 'A', value: 40 },
      { label: 'B', value: 65 },
      { label: 'C', value: 30 },
    ],
    color: '#D9A441',
    labelColor: '#FFFFFF',
    showValues: true,
  },
  group: {},
};

const MAX_CHART_POINTS = 12;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

export function createEmptyDocument({ width = 1200, height = 628, background = '#0A0A0A' } = {}) {
  return { version: SCHEMA_VERSION, type: 'design', canvas: { width, height, background }, elements: [] };
}

export function defaultPropertiesFor(type) {
  return { ...(DEFAULT_PROPERTIES[type] || {}) };
}

export function sanitizeShadow(shadow) {
  if (!shadow) return null;
  return {
    x: clamp(num(shadow.x, 0), -200, 200),
    y: clamp(num(shadow.y, DEFAULT_SHADOW.y), -200, 200),
    blur: clamp(num(shadow.blur, DEFAULT_SHADOW.blur), 0, 200),
    color: typeof shadow.color === 'string' && shadow.color ? shadow.color : DEFAULT_SHADOW.color,
  };
}

/**
 * Gradients are how a flat colour field gets depth and how type stays legible
 * over photography without a heavy slab of black. Stops carry their own alpha
 * (#RRGGBBAA), so one value survives the document, CSS and the SVG export.
 * Returns null for anything that would not paint, and `fill` is used instead.
 */
export function sanitizeGradient(gradient) {
  if (!gradient || typeof gradient !== 'object') return null;
  const stops = (Array.isArray(gradient.stops) ? gradient.stops : [])
    .filter((s) => s && typeof s.color === 'string' && /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.color.trim()))
    .map((s) => ({
      color: s.color.trim().startsWith('#') ? s.color.trim() : `#${s.color.trim()}`,
      offset: clamp(num(s.offset, 0), 0, 100),
    }))
    .sort((a, b) => a.offset - b.offset)
    .slice(0, 8);
  if (stops.length < 2) return null;
  return {
    type: oneOf(gradient.type, GRADIENT_TYPES, 'linear'),
    // CSS convention: 0deg points up, angles increase clockwise.
    angle: clamp(num(gradient.angle, 180), 0, 360),
    stops,
  };
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

  // Layer-level state. Only written when set, so documents stay lean and
  // diff-friendly.
  if (typeof spec.name === 'string' && spec.name.trim()) el.name = spec.name.trim().slice(0, 80);
  if (spec.parentId) el.parentId = String(spec.parentId);
  if (spec.hidden) el.hidden = true;
  if (spec.locked) el.locked = true;
  if (spec.flipH) el.flipH = true;
  if (spec.flipV) el.flipV = true;
  if (spec.lockAspect) el.lockAspect = true;
  if (spec.blendMode && spec.blendMode !== 'normal') el.blendMode = oneOf(spec.blendMode, BLEND_MODES, 'normal');
  if (num(spec.layerBlur, 0) > 0) el.layerBlur = clamp(num(spec.layerBlur, 0), 0, 100);
  if (spec.shadow) el.shadow = sanitizeShadow(spec.shadow);

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
  if (type === 'icon') {
    out.library = oneOf(out.library, ICON_LIBRARIES, 'lucide');
    const set = ALLOWED_ICONS[out.library] || ALLOWED_ICONS.lucide;
    if (!set.includes(out.name)) out.name = set[0];
  }
  if (out.textCase !== undefined) out.textCase = oneOf(out.textCase, TEXT_CASES, 'none');
  if (out.strokeStyle !== undefined) out.strokeStyle = oneOf(out.strokeStyle, STROKE_STYLES, 'solid');
  if (type === 'image') {
    out.fit = oneOf(out.fit, IMAGE_FITS, 'cover');
    out.focalX = clamp(num(out.focalX, 50), 0, 100);
    out.focalY = clamp(num(out.focalY, 50), 0, 100);
    out.zoom = clamp(num(out.zoom, 1), 1, 4);
    for (const key of SIGNED_ADJUST_KEYS) out[key] = clamp(num(out[key], 0), -100, 100);
    for (const key of UNSIGNED_ADJUST_KEYS) out[key] = clamp(num(out[key], 0), 0, 100);
  }
  if (out.fillOpacity !== undefined) out.fillOpacity = clamp(num(out.fillOpacity, 1), 0, 1);
  if (out.gradient !== undefined) out.gradient = sanitizeGradient(out.gradient);
  if (type === 'polygon') out.sides = Math.round(clamp(num(out.sides, 3), 3, 24));
  if (type === 'star') {
    out.points = Math.round(clamp(num(out.points, 5), 3, 24));
    out.depth = clamp(num(out.depth, 0.45), 0.05, 0.95);
  }
  if (type === 'chart') {
    out.chartType = oneOf(out.chartType, CHART_TYPES, 'bar');
    const points = (Array.isArray(out.data) ? out.data : [])
      .filter((d) => d && typeof d.label === 'string' && d.label.trim())
      .slice(0, MAX_CHART_POINTS)
      .map((d) => ({ label: d.label.trim().slice(0, 24), value: Math.max(0, num(d.value, 0)) }));
    // A chart with fewer than two real points is not a chart — fall back to
    // the default dataset rather than render an empty/misleading shape.
    out.data = points.length >= 2 ? points : defaultPropertiesFor('chart').data;
    out.showValues = Boolean(out.showValues ?? true);
  }
  return out;
}

export function validateDocument(doc) {
  if (!doc || typeof doc !== 'object') return false;
  if (!doc.canvas || typeof doc.canvas.width !== 'number') return false;
  if (!Array.isArray(doc.elements)) return false;
  return true;
}
