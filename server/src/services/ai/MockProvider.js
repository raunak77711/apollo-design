import { AIProvider } from './AIProvider.js';
import { ALLOWED_ICONS } from '../../design/schema.js';
import { detectIndustry } from '../../design/industries.js';

/**
 * Deterministic, rule-based provider used when no DEEPSEEK_API_KEY is set.
 * It is NOT a language model — it's a heuristic planner that lets the full
 * Apollo pipeline (operations → validation → renderer → editable canvas) be
 * demonstrated end-to-end with zero external keys. DeepSeekProvider replaces it
 * transparently once a key is configured.
 */
export class MockProvider extends AIProvider {
  async generateOperations({ message = '', document, selectedElementId }) {
    const text = message.toLowerCase();
    const elements = document?.elements || [];
    const isEmpty = elements.length === 0;

    // No elements yet, or an explicit "create" instruction → generate a design.
    if (isEmpty || /\b(create|make|design|build|generate)\b/.test(text) && !hasEditIntent(text)) {
      if (isEmpty) return this.generateDesign(message, document);
    }
    return this.editDesign(message, document, selectedElementId);
  }

  /* --------------------------- Generation --------------------------- */

  generateDesign(message, document) {
    const industry = detectIndustry(message);
    const brand = extractBrand(message) || 'Your Brand';
    const headline = extractQuoted(message) || industry?.headline || defaultHeadline(message);
    const accent = extractColor(message) || industry?.accent || '#D9A441';
    const dark = industry ? industry.dark : /\bdark|premium|modern|luxury\b/.test(message.toLowerCase());
    const bg = dark ? '#0A0A0A' : '#111827';
    const { width, height } = document?.canvas || { width: 1200, height: 628 };

    const imageQuery = buildImageQuery(message, industry);
    const icon = pickIcon(message, industry);

    const operations = [
      { type: 'SET_CANVAS', changes: { background: bg } },
      // Hero image on the right half.
      {
        type: 'CREATE_ELEMENT',
        element: {
          type: 'image', x: width * 0.52, y: 0, width: width * 0.48, height,
          zIndex: 1,
          query: imageQuery, // resolved to a real URL by the AI service
          properties: { fit: 'cover', alt: imageQuery },
        },
      },
      // Dark gradient overlay panel for text legibility.
      {
        type: 'CREATE_ELEMENT',
        element: {
          type: 'rectangle', x: 0, y: 0, width: width * 0.62, height, zIndex: 2,
          opacity: 0.72,
          properties: { fill: bg, borderRadius: 0 },
        },
      },
      // Accent bar.
      {
        type: 'CREATE_ELEMENT',
        element: { type: 'rectangle', x: 80, y: 132, width: 64, height: 6, zIndex: 3,
          properties: { fill: accent, borderRadius: 3 } },
      },
      // Icon + brand row.
      {
        type: 'CREATE_ELEMENT',
        element: { type: 'icon', x: 80, y: 64, width: 34, height: 34, zIndex: 4,
          properties: { name: icon, size: 34, color: accent } },
      },
      {
        type: 'CREATE_ELEMENT',
        element: { type: 'text', x: 128, y: 66, width: 300, height: 34, zIndex: 4,
          properties: { text: brand, fontSize: 22, fontWeight: 700, color: '#FFFFFF', align: 'left', letterSpacing: 2 } },
      },
      // Headline.
      {
        type: 'CREATE_ELEMENT',
        element: { type: 'text', x: 80, y: 168, width: width * 0.5, height: 180, zIndex: 5,
          properties: { text: headline, fontSize: 66, fontWeight: 900, color: '#FFFFFF', align: 'left', lineHeight: 1.05 } },
      },
      // Subtitle.
      {
        type: 'CREATE_ELEMENT',
        element: { type: 'text', x: 80, y: 372, width: width * 0.44, height: 60, zIndex: 6,
          properties: { text: defaultSubtitle(message, industry), fontSize: 22, fontWeight: 400, color: '#D1D5DB', align: 'left', lineHeight: 1.35 } },
      },
      // CTA button.
      {
        type: 'CREATE_ELEMENT',
        element: { type: 'button', x: 80, y: 456, width: 220, height: 60, zIndex: 7,
          properties: { text: extractCTA(message, industry), background: accent, color: readableOn(accent), fontSize: 20, fontWeight: 800, borderRadius: 8 } },
      },
    ];

    return {
      operations,
      message: `Created a ${dark ? 'dark, premium' : 'modern'} design for "${brand}" with a hero image, headline "${headline}", subtitle, and a call-to-action button. Every layer is editable — try selecting one.`,
    };
  }

  /* ----------------------------- Editing ---------------------------- */

  editDesign(message, document, selectedElementId) {
    const text = message.toLowerCase();
    const elements = document?.elements || [];
    const target = resolveTarget(text, elements, selectedElementId);

    if (!target) {
      return { operations: [], message: "I couldn't tell which element to change — select one on the canvas, then tell me what to do." };
    }

    // Size.
    if (/\bbigger|larger|increase\b/.test(text)) {
      const fs = Math.round((target.properties.fontSize || 32) * 1.25);
      return op(target, { fontSize: fs }, `Made "${label(target)}" bigger (font size ${fs}).`);
    }
    if (/\bsmaller|reduce|decrease\b/.test(text)) {
      const fs = Math.round((target.properties.fontSize || 32) * 0.8);
      return op(target, { fontSize: fs }, `Made "${label(target)}" smaller (font size ${fs}).`);
    }
    // Color.
    const color = extractColor(text);
    if (color && /\bcolor|colour\b/.test(text) || (color && /\bred|blue|green|black|white|gold|orange|purple|pink|yellow\b/.test(text))) {
      const key = target.type === 'button' || target.type === 'rectangle' || target.type === 'circle' ? 'background' in target.properties ? 'background' : 'fill' : 'color';
      return op(target, { [key]: color }, `Changed "${label(target)}" color to ${color}.`);
    }
    // Movement.
    if (/\bmove\b|\bright\b|\bleft\b|\bup\b|\bdown\b/.test(text)) {
      const dx = /\bright\b/.test(text) ? 60 : /\bleft\b/.test(text) ? -60 : 0;
      const dy = /\bdown\b/.test(text) ? 60 : /\bup\b/.test(text) ? -60 : 0;
      return {
        operations: [{ type: 'MOVE_ELEMENT', targetId: target.id, changes: { x: target.x + dx, y: target.y + dy } }],
        message: `Moved "${label(target)}".`,
      };
    }
    // Bolder / premium feel.
    if (/\bbold|bolder|premium|heavier\b/.test(text)) {
      return op(target, { fontWeight: 900, letterSpacing: 1 }, `Gave "${label(target)}" a bolder, more premium weight.`);
    }
    // Rename / set text.
    const quoted = extractQuoted(message);
    if (quoted && (target.type === 'text' || target.type === 'button')) {
      return op(target, { text: quoted }, `Updated the text to "${quoted}".`);
    }

    return { operations: [], message: `I understood you want to edit "${label(target)}", but not the exact change. Try: "make it bigger", "change color to blue", or "move it right".` };
  }
}

/* ------------------------------ helpers ------------------------------ */

function op(target, changes, message) {
  return { operations: [{ type: 'UPDATE_ELEMENT', targetId: target.id, changes }], message };
}

function hasEditIntent(text) {
  return /\bbigger|smaller|move|color|colour|bold|premium|replace|delete|remove\b/.test(text);
}

function resolveTarget(text, elements, selectedElementId) {
  if (/\bheadline|title|heading\b/.test(text)) {
    return [...elements].filter((e) => e.type === 'text').sort((a, b) => (b.properties.fontSize || 0) - (a.properties.fontSize || 0))[0];
  }
  if (/\bbutton|cta\b/.test(text)) return elements.find((e) => e.type === 'button');
  if (/\bimage|photo|picture|athlete|person\b/.test(text)) return elements.find((e) => e.type === 'image');
  if (/\bsubtitle|subheading\b/.test(text)) {
    const texts = elements.filter((e) => e.type === 'text').sort((a, b) => (a.properties.fontSize || 0) - (b.properties.fontSize || 0));
    return texts[0];
  }
  if (selectedElementId) return elements.find((e) => e.id === selectedElementId);
  return elements.find((e) => e.type === 'text') || elements[0];
}

function label(el) {
  if (!el) return 'element';
  if (el.type === 'text' || el.type === 'button') return el.properties.text || el.type;
  return el.type;
}

function extractBrand(message) {
  const m = message.match(/(?:for|called|named)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/);
  return m ? m[1].replace(/\b(gym|store|shop|restaurant|company|brand)\b/gi, '').trim() || m[1].trim() : null;
}

function extractQuoted(message) {
  const m = message.match(/["“']([^"”']{2,60})["”']/);
  return m ? m[1] : null;
}

/** Keeps CTA labels legible whichever accent the prompt asks for. */
function readableOn(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return '#FFFFFF';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.58 ? '#0A0A0A' : '#FFFFFF';
}

function extractColor(text) {
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (hex) return hex[0];
  const map = { red: '#E11D48', blue: '#2563EB', green: '#16A34A', black: '#0A0A0A', white: '#FFFFFF', gold: '#D4AF37', orange: '#EA580C', purple: '#7C3AED', pink: '#EC4899', yellow: '#EAB308' };
  const found = Object.keys(map).find((c) => new RegExp(`\\b${c}\\b`).test(text));
  return found ? map[found] : null;
}

/** Explicit signals in the prompt beat the detected industry, which beats a generic default. */
function pickIcon(message, industry) {
  const t = message.toLowerCase();
  if (/job|career|work|hiring/.test(t)) return 'Briefcase';
  if (/photo|camera/.test(t)) return 'Camera';
  const capitalized = message.split(/\s+/).find((w) => ALLOWED_ICONS.lucide.includes(w));
  return capitalized || industry?.icon || 'Star';
}

function buildImageQuery(message, industry) {
  const m = message.match(/\bwith (?:a |an )?([a-z ]{3,40})/i);
  if (m) return m[1].trim();
  if (industry) return industry.imageQuery;
  const t = message.toLowerCase();
  if (/job|career|office/.test(t)) return 'modern office professional';
  return 'abstract dark background';
}

function defaultHeadline(message) {
  const t = message.toLowerCase();
  if (/job|career/.test(t)) return 'FIND YOUR NEXT ROLE';
  return 'MAKE IT HAPPEN';
}

function defaultSubtitle(message, industry) {
  if (industry) return industry.subtitle;
  const t = message.toLowerCase();
  if (/job|career/.test(t)) return 'Thousands of opportunities. One perfect match.';
  return 'Premium quality, designed for people who expect more.';
}

function extractCTA(message, industry) {
  const m = message.match(/["“']([^"”']+)["”']\s*button/i);
  if (m) return m[1].toUpperCase();
  if (industry) return industry.cta;
  const t = message.toLowerCase();
  if (/job|career|apply/.test(t)) return 'APPLY NOW';
  return 'GET STARTED';
}
