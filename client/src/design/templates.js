/**
 * Built-in starting points. Each template is a plain Apollo document, so opening
 * one drops you straight into fully editable layers — nothing is flattened, and
 * Apollo AI can keep working on it from there.
 *
 * Image layers are intentionally left empty: they render as a marked slot on the
 * canvas that you fill from the image library or your uploads.
 */

import { createEmptyDocument, makeElement } from './schema.js';

/* ------------------------------- builders ------------------------------- */

const text = (x, y, width, height, value, props = {}, el = {}) => ({
  type: 'text',
  x,
  y,
  width,
  height,
  ...el,
  properties: { text: value, fontFamily: 'Inter', fontSize: 32, fontWeight: 600, color: '#FFFFFF', align: 'left', lineHeight: 1.2, letterSpacing: 0, ...props },
});

const rect = (x, y, width, height, props = {}, el = {}) => ({
  type: 'rectangle',
  x,
  y,
  width,
  height,
  ...el,
  properties: { fill: '#111110', borderRadius: 0, ...props },
});

const circle = (x, y, size, props = {}, el = {}) => ({
  type: 'circle',
  x,
  y,
  width: size,
  height: size,
  ...el,
  properties: { fill: '#D9A441', ...props },
});

const slot = (x, y, width, height, props = {}, el = {}) => ({
  type: 'image',
  x,
  y,
  width,
  height,
  ...el,
  properties: { src: '', alt: 'Photo', fit: 'cover', ...props },
});

const button = (x, y, width, height, label, props = {}) => ({
  type: 'button',
  x,
  y,
  width,
  height,
  properties: { text: label, fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: '#FFFFFF', background: '#111110', borderRadius: 4, align: 'center', ...props },
});

const glyph = (x, y, size, name, color) => ({
  type: 'icon',
  x,
  y,
  width: size,
  height: size,
  properties: { name, size, color, strokeWidth: 1.75 },
});

/** name / description / price row for the menu template. */
const menuRow = (y, name, description, price) => [
  text(140, y, 640, 34, name, { fontFamily: 'Instrument Sans', fontSize: 26, fontWeight: 500, color: '#F0E9DC' }),
  text(140, y + 40, 640, 24, description, { fontSize: 15, fontWeight: 400, color: '#8C8378', lineHeight: 1.4 }),
  text(820, y + 2, 240, 30, price, { fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 400, color: '#C6902A', align: 'right' }),
];

/* ------------------------------- templates ------------------------------ */

export const TEMPLATES = [
  {
    id: 'athletic-banner',
    name: 'Athletic club',
    category: 'Marketing',
    canvas: { width: 1200, height: 628, background: '#0A0A0B' },
    elements: [
      slot(660, 0, 540, 628),
      rect(0, 0, 700, 628, { fill: '#0A0A0B' }),
      text(80, 92, 440, 20, 'APOLLO ATHLETIC CLUB', { fontSize: 13, fontWeight: 600, letterSpacing: 4.5, color: '#D9A441' }),
      rect(80, 132, 44, 3, { fill: '#D9A441' }),
      text(80, 168, 540, 200, 'TRANSFORM\nYOUR BODY', { fontFamily: 'Bebas Neue', fontSize: 96, fontWeight: 400, lineHeight: 0.94, letterSpacing: 1, color: '#F5F4F1' }),
      text(80, 392, 470, 60, 'Elite coaching, measured progress.\nYour first session is on us.', { fontSize: 17, fontWeight: 400, lineHeight: 1.5, color: '#A3A199' }),
      button(80, 478, 186, 50, 'JOIN NOW', { background: '#D9A441', color: '#141005', fontSize: 14 }),
      text(292, 494, 220, 22, 'No joining fee', { fontSize: 14, fontWeight: 400, color: '#6F6D66' }),
    ],
  },

  {
    id: 'season-sale',
    name: 'Season sale',
    category: 'Social',
    canvas: { width: 1080, height: 1080, background: '#F0EEE9' },
    elements: [
      text(90, 108, 900, 22, 'LIMITED TIME · ONLINE ONLY', { fontSize: 13, fontWeight: 600, letterSpacing: 5, color: '#8A6215' }),
      text(90, 168, 900, 60, 'UP TO', { fontFamily: 'Bebas Neue', fontSize: 56, fontWeight: 400, letterSpacing: 2, lineHeight: 1, color: '#111110' }),
      text(84, 220, 920, 290, '50%', { fontFamily: 'Bebas Neue', fontSize: 300, fontWeight: 400, letterSpacing: -4, lineHeight: 0.9, color: '#111110' }),
      text(90, 500, 900, 120, 'OFF EVERYTHING', { fontFamily: 'Bebas Neue', fontSize: 104, fontWeight: 400, lineHeight: 1, color: '#111110' }),
      rect(90, 648, 900, 1, { fill: '#111110' }),
      text(90, 684, 620, 70, 'Use code APOLLO50 at checkout.\nEnds Sunday at midnight.', { fontSize: 20, fontWeight: 400, lineHeight: 1.5, color: '#63615C' }),
      button(90, 812, 330, 62, 'SHOP THE SALE', { background: '#111110', color: '#F0EEE9', fontSize: 16 }),
      text(90, 960, 900, 20, 'APOLLO.DESIGN', { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 400, letterSpacing: 3, color: '#95928B' }),
    ],
  },

  {
    id: 'meridian-menu',
    name: 'Restaurant menu',
    category: 'Print',
    canvas: { width: 1200, height: 1800, background: '#12100E' },
    elements: [
      text(0, 150, 1200, 30, 'EST. 2019', { fontSize: 12, fontWeight: 600, letterSpacing: 6, align: 'center', color: '#C6902A' }),
      text(0, 196, 1200, 120, 'MERIDIAN', { fontFamily: 'Playfair Display', fontSize: 88, fontWeight: 700, letterSpacing: 6, align: 'center', lineHeight: 1.1, color: '#F0E9DC' }),
      text(0, 322, 1200, 26, 'KITCHEN & BAR', { fontSize: 13, fontWeight: 500, letterSpacing: 8, align: 'center', color: '#8C8378' }),
      rect(540, 400, 120, 1, { fill: '#3A342C' }),

      text(140, 470, 920, 26, 'STARTERS', { fontSize: 14, fontWeight: 700, letterSpacing: 5, color: '#C6902A' }),
      rect(140, 512, 920, 1, { fill: '#2A2621' }),
      ...menuRow(546, 'Charred octopus', 'Smoked paprika, confit potato, lemon', '480'),
      ...menuRow(656, 'Burrata & heirloom', 'Aged balsamic, basil oil, sourdough', '420'),
      ...menuRow(766, 'Tuna crudo', 'Yuzu, radish, toasted sesame', '540'),

      text(140, 916, 920, 26, 'MAINS', { fontSize: 14, fontWeight: 700, letterSpacing: 5, color: '#C6902A' }),
      rect(140, 958, 920, 1, { fill: '#2A2621' }),
      ...menuRow(992, 'Dry-aged sirloin', 'Bone marrow butter, watercress', '1,250'),
      ...menuRow(1102, 'Saffron risotto', 'Wild mushroom, aged parmesan', '760'),
      ...menuRow(1212, 'Line-caught seabass', 'Fennel, brown butter, capers', '980'),

      rect(140, 1400, 920, 1, { fill: '#2A2621' }),
      text(0, 1440, 1200, 26, 'SERVED 5PM UNTIL LATE · 24 HARBOUR STREET', { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 400, letterSpacing: 2, align: 'center', color: '#6E675E' }),
    ],
  },

  {
    id: 'wedding-invitation',
    name: 'Invitation',
    category: 'Brand',
    canvas: { width: 1240, height: 1750, background: '#F2EFE8' },
    elements: [
      rect(70, 70, 1100, 1610, { fill: 'transparent', borderColor: '#C9C3B7', borderWidth: 1 }),
      text(0, 240, 1240, 24, 'TOGETHER WITH THEIR FAMILIES', { fontSize: 12, fontWeight: 600, letterSpacing: 5, align: 'center', color: '#6B675E' }),
      text(0, 330, 1240, 130, 'Amara', { fontFamily: 'Instrument Serif', fontSize: 104, fontWeight: 400, align: 'center', lineHeight: 1.15, color: '#111110' }),
      text(0, 466, 1240, 60, '&', { fontFamily: 'Instrument Serif', fontSize: 46, fontWeight: 400, align: 'center', color: '#B0801F' }),
      text(0, 536, 1240, 130, 'Nikhil', { fontFamily: 'Instrument Serif', fontSize: 104, fontWeight: 400, align: 'center', lineHeight: 1.15, color: '#111110' }),
      rect(560, 730, 120, 1, { fill: '#C9C3B7' }),
      text(0, 786, 1240, 34, 'invite you to celebrate their wedding', { fontSize: 19, fontWeight: 400, align: 'center', color: '#6B675E' }),
      text(0, 900, 1240, 40, 'SATURDAY, 14 SEPTEMBER', { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 400, letterSpacing: 2, align: 'center', color: '#111110' }),
      text(0, 956, 1240, 26, 'FOUR O’CLOCK IN THE AFTERNOON', { fontSize: 13, fontWeight: 500, letterSpacing: 4, align: 'center', color: '#6B675E' }),
      text(0, 1180, 1240, 26, 'THE OLIVE GARDEN · JAIPUR', { fontSize: 13, fontWeight: 600, letterSpacing: 4, align: 'center', color: '#111110' }),
      text(0, 1540, 1240, 24, 'RSVP BY 1 AUGUST', { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 400, letterSpacing: 3, align: 'center', color: '#95928B' }),
    ],
  },

  {
    id: 'product-story',
    name: 'Product story',
    category: 'Social',
    canvas: { width: 1080, height: 1920, background: '#0A0A0B' },
    elements: [
      slot(0, 0, 1080, 1920),
      rect(0, 1020, 1080, 900, { fill: '#0A0A0B' }, { opacity: 0.74 }),
      text(80, 1180, 920, 24, 'NEW ARRIVAL', { fontSize: 13, fontWeight: 600, letterSpacing: 5, color: '#D9A441' }),
      text(80, 1240, 920, 280, 'The\nEveryday\nJacket', { fontFamily: 'Instrument Sans', fontSize: 88, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, color: '#F5F4F1' }),
      text(80, 1530, 700, 60, 'Water-resistant shell, brushed cotton lining. Made in limited numbers.', { fontSize: 19, fontWeight: 400, lineHeight: 1.5, color: '#A3A199' }),
      button(80, 1650, 300, 60, 'SHOP NOW', { background: '#F5F4F1', color: '#0A0A0B', fontSize: 15 }),
      text(412, 1668, 300, 30, '₹ 4,890', { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 400, color: '#F5F4F1' }),
    ],
  },

  {
    id: 'video-thumbnail',
    name: 'Video thumbnail',
    category: 'Social',
    canvas: { width: 1280, height: 720, background: '#0E0E10' },
    elements: [
      slot(700, 0, 580, 720),
      rect(0, 0, 740, 720, { fill: '#0E0E10' }),
      rect(64, 152, 12, 216, { fill: '#D9A441' }),
      text(110, 140, 580, 250, 'STOP\nWASTING\nTIME', { fontFamily: 'Bebas Neue', fontSize: 92, fontWeight: 400, lineHeight: 0.98, color: '#F5F4F1' }),
      text(110, 430, 560, 36, '7 systems that actually work', { fontSize: 24, fontWeight: 400, color: '#A3A199' }),
      glyph(110, 518, 28, 'Play', '#D9A441'),
      text(152, 524, 320, 24, 'APOLLO STUDIO', { fontSize: 14, fontWeight: 600, letterSpacing: 4, color: '#6F6D66' }),
    ],
  },

  {
    id: 'editorial-quote',
    name: 'Editorial quote',
    category: 'Social',
    canvas: { width: 1080, height: 1080, background: '#F5F4F1' },
    elements: [
      text(120, 250, 840, 400, 'Design is not what it looks like. It is how clearly it lets you decide.', { fontFamily: 'Instrument Serif', fontSize: 68, fontWeight: 400, lineHeight: 1.25, color: '#111110' }),
      rect(120, 726, 56, 1, { fill: '#111110' }),
      text(120, 762, 840, 26, 'ELENA VOSS', { fontSize: 14, fontWeight: 600, letterSpacing: 4, color: '#111110' }),
      text(120, 796, 840, 28, 'Creative Director, Meridian', { fontSize: 16, fontWeight: 400, color: '#63615C' }),
      text(120, 960, 400, 22, 'APOLLO', { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 400, letterSpacing: 4, color: '#95928B' }),
    ],
  },

  {
    id: 'studio-mark',
    name: 'Studio mark',
    category: 'Brand',
    canvas: { width: 800, height: 800, background: '#0A0A0B' },
    elements: [
      circle(280, 190, 240, { fill: 'transparent', borderColor: '#D9A441', borderWidth: 1 }),
      text(280, 262, 240, 100, 'AV', { fontFamily: 'Instrument Serif', fontSize: 76, fontWeight: 400, align: 'center', lineHeight: 1.1, color: '#F5F4F1' }),
      text(0, 500, 800, 60, 'AVIARY', { fontSize: 38, fontWeight: 600, letterSpacing: 14, align: 'center', color: '#F5F4F1' }),
      rect(370, 584, 60, 1, { fill: '#37332B' }),
      text(0, 614, 800, 24, 'CRAFT · STUDIO · SINCE 2021', { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 400, letterSpacing: 4, align: 'center', color: '#6F6D66' }),
    ],
  },

  {
    id: 'grand-opening',
    name: 'Grand opening',
    category: 'Print',
    canvas: { width: 1080, height: 1350, background: '#111110' },
    elements: [
      text(90, 120, 900, 24, 'YOU ARE INVITED', { fontSize: 13, fontWeight: 600, letterSpacing: 6, color: '#D9A441' }),
      text(84, 190, 920, 380, 'GRAND\nOPENING', { fontFamily: 'Bebas Neue', fontSize: 170, fontWeight: 400, letterSpacing: 2, lineHeight: 0.92, color: '#F5F4F1' }),
      rect(90, 620, 900, 1, { fill: '#37332B' }),
      text(90, 658, 500, 34, 'SATURDAY 12 OCTOBER', { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 400, color: '#F5F4F1' }),
      text(90, 706, 620, 26, '10 AM UNTIL LATE · LIVE MUSIC · FREE COFFEE', { fontSize: 15, fontWeight: 400, color: '#A3A199' }),
      slot(90, 790, 900, 380),
      text(90, 1212, 620, 26, '24 HARBOUR STREET, GOA', { fontSize: 15, fontWeight: 600, letterSpacing: 2, color: '#F5F4F1' }),
      text(90, 1248, 620, 26, 'apollo.design/opening', { fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 400, color: '#6F6D66' }),
      glyph(936, 1204, 44, 'Flame', '#D9A441'),
    ],
  },

  {
    id: 'launch-banner',
    name: 'Product launch',
    category: 'Marketing',
    canvas: { width: 1200, height: 628, background: '#F6F5F3' },
    elements: [
      slot(700, 44, 456, 540, { borderRadius: 8 }),
      text(88, 132, 520, 22, 'APOLLO · RELEASE 2.4', { fontSize: 12, fontWeight: 600, letterSpacing: 4, color: '#8A6215' }),
      text(88, 180, 560, 180, 'Ship the design,\nnot the debate.', { fontFamily: 'Instrument Sans', fontSize: 52, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.12, color: '#111110' }),
      text(88, 372, 500, 80, 'Turn a sentence into an editable layout in seconds — then tune every layer by hand.', { fontSize: 17, fontWeight: 400, lineHeight: 1.5, color: '#63615C' }),
      button(88, 476, 170, 48, 'Try Apollo', { background: '#111110', color: '#F6F5F3', fontSize: 15, fontWeight: 600, borderRadius: 6 }),
      text(280, 490, 260, 24, 'No account needed', { fontSize: 14, fontWeight: 400, color: '#95928B' }),
    ],
  },
];

export const TEMPLATE_CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))];

/** Turns a template into a real, id-stamped Apollo document. */
export function documentFromTemplate(template) {
  const doc = createEmptyDocument(template.canvas);
  doc.elements = template.elements.map((spec, i) => makeElement(spec.type, { ...spec, zIndex: i + 1 }));
  return doc;
}

export const findTemplate = (id) => TEMPLATES.find((t) => t.id === id) || null;
