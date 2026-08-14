/**
 * Layer vocabulary: what a layer is called and which icon it wears. Ordering
 * and selection maths live next door in layerOps.js, which stays free of React
 * so it can be reasoned about — and tested — on its own.
 */

import {
  Circle,
  Folder,
  Hexagon,
  ImageIcon,
  Minus,
  RectangleHorizontal,
  Square,
  Star,
  Sticker,
  Type,
} from 'lucide-react';

export const TYPE_META = {
  text: { icon: Type, label: 'Text' },
  image: { icon: ImageIcon, label: 'Image' },
  icon: { icon: Sticker, label: 'Icon' },
  rectangle: { icon: Square, label: 'Rectangle' },
  circle: { icon: Circle, label: 'Ellipse' },
  polygon: { icon: Hexagon, label: 'Polygon' },
  star: { icon: Star, label: 'Star' },
  line: { icon: Minus, label: 'Line' },
  button: { icon: RectangleHorizontal, label: 'Button' },
  group: { icon: Folder, label: 'Group' },
};

// A polygon is named for what it actually is — nobody calls a triangle a
// "3-sided polygon" while they are designing.
const POLYGON_NAMES = { 3: 'Triangle', 4: 'Diamond', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon', 8: 'Octagon' };

export const typeLabel = (el) => {
  if (el?.type === 'polygon') {
    const sides = el.properties?.sides ?? 3;
    return POLYGON_NAMES[sides] || `${sides}-sided shape`;
  }
  return TYPE_META[el?.type]?.label || 'Layer';
};

/** A renamed layer keeps its name; everything else describes itself. */
export function layerLabel(el) {
  if (!el) return 'Layer';
  if (el.name) return el.name;
  if (el.type === 'text' || el.type === 'button') return el.properties?.text?.split('\n')[0]?.trim() || typeLabel(el);
  if (el.type === 'icon') return el.properties?.name || 'Icon';
  if (el.type === 'image') return el.properties?.src ? el.properties.alt || 'Image' : 'Empty image';
  return typeLabel(el);
}
