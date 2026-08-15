import { AIProvider } from './AIProvider.js';
import { detectIndustry } from '../../design/industries.js';
import { findStyle, layoutsForAspect, pickStyleFor, STYLES } from '../../design/artDirection.js';
import { seededRandom } from '../../design/layout.js';

/**
 * Deterministic, rule-based provider used when no DEEPSEEK_API_KEY is set.
 *
 * It is not a language model — it is a heuristic art director. Crucially it
 * produces the *same brief format* DeepSeek does, so the composer, the curator
 * and the critic all run identically with or without a key. A keyless install
 * gets real layouts, real palettes and real photography, not a placeholder.
 */
export class MockProvider extends AIProvider {
  /** The creative-director pass, without a model. */
  async planDesign({ message = '', canvas, variation }) {
    const industry = detectIndustry(message);
    const style = pickStyleFor(message) || findStyle(industry?.style) || STYLES[2];
    const rand = seededRandom(`${message}:${variation?.id || 'base'}`);

    const ratio = (canvas?.width || 1080) / (canvas?.height || 1080);
    const allowed = layoutsForAspect(ratio);
    const preferred = (variation?.layouts || style.layouts).filter((id) => allowed.includes(id));
    const layout = preferred.length ? preferred[Math.floor(rand() * preferred.length)] : allowed[0];

    const brand = extractBrand(message);
    const accent = extractColor(message);
    const offer = extractOffer(message);
    const headline = extractQuoted(message) || offer?.headline || industry?.headline || defaultHeadline(message);

    return {
      designType: describeType(message, canvas),
      audience: industry ? `${industry.label} customers` : 'a general audience',
      mood: style.mood.slice(0, 3),
      style: style.id,
      layout,
      fontPairing: variation?.pairing || style.pairing,
      focal: layout === 'type-poster' ? 'type' : 'image',
      palette: accent ? { ...style.palette, accent } : style.palette,
      copy: {
        eyebrow: offer?.eyebrow || industry?.eyebrow || (brand ? brand.toUpperCase() : ''),
        headline,
        subhead: industry?.subtitle || defaultSubhead(message),
        cta: extractCTA(message, industry),
        details: extractDetails(message),
        meta: brand || industry?.label || '',
      },
      images: [
        {
          role: 'hero',
          query: buildImageQuery(message, industry, style),
          subject: industry?.subject || 'subject',
          orientation: ratio > 1.25 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square',
          negativeSpace: industry?.negativeSpace || 'any',
        },
      ],
      rationale: `${style.label} direction chosen from the subject of the request.`,
    };
  }

  /* ----------------------------- Editing ---------------------------- */

  async generateOperations({ message = '', document, selectedElementId }) {
    return this.editDesign(message, document, selectedElementId);
  }

  editDesign(message, document, selectedElementId) {
    const text = message.toLowerCase();
    const elements = document?.elements || [];
    const target = resolveTarget(text, elements, selectedElementId);

    if (!target) {
      return { operations: [], message: "I couldn't tell which element to change — select one on the canvas, then tell me what to do." };
    }

    if (/\bbigger|larger|increase\b/.test(text)) {
      const fs = Math.round((target.properties.fontSize || 32) * 1.25);
      return op(target, { fontSize: fs }, `Made "${label(target)}" bigger (font size ${fs}).`);
    }
    if (/\bsmaller|reduce|decrease\b/.test(text)) {
      const fs = Math.round((target.properties.fontSize || 32) * 0.8);
      return op(target, { fontSize: fs }, `Made "${label(target)}" smaller (font size ${fs}).`);
    }
    const color = extractColor(text);
    if ((color && /\bcolor|colour\b/.test(text)) || (color && /\bred|blue|green|black|white|gold|orange|purple|pink|yellow\b/.test(text))) {
      const key =
        target.type === 'button' || target.type === 'rectangle' || target.type === 'circle'
          ? 'background' in target.properties
            ? 'background'
            : 'fill'
          : 'color';
      return op(target, { [key]: color }, `Changed "${label(target)}" colour to ${color}.`);
    }
    if (/\bmove\b|\bright\b|\bleft\b|\bup\b|\bdown\b/.test(text)) {
      const dx = /\bright\b/.test(text) ? 60 : /\bleft\b/.test(text) ? -60 : 0;
      const dy = /\bdown\b/.test(text) ? 60 : /\bup\b/.test(text) ? -60 : 0;
      return {
        operations: [{ type: 'MOVE_ELEMENT', targetId: target.id, changes: { x: target.x + dx, y: target.y + dy } }],
        message: `Moved "${label(target)}".`,
      };
    }
    if (/\bbold|bolder|premium|heavier\b/.test(text)) {
      return op(target, { fontWeight: 900, letterSpacing: 1 }, `Gave "${label(target)}" a bolder, more premium weight.`);
    }
    const quoted = extractQuoted(message);
    if (quoted && (target.type === 'text' || target.type === 'button')) {
      return op(target, { text: quoted }, `Updated the text to "${quoted}".`);
    }

    return {
      operations: [],
      message: `I understood you want to edit "${label(target)}", but not the exact change. Try: "make it bigger", "change colour to blue", or "move it right".`,
    };
  }
}

/* ------------------------------ helpers ------------------------------ */

function op(target, changes, message) {
  return { operations: [{ type: 'UPDATE_ELEMENT', targetId: target.id, changes }], message };
}

function resolveTarget(text, elements, selectedElementId) {
  if (/\bheadline|title|heading\b/.test(text)) {
    return [...elements].filter((e) => e.type === 'text').sort((a, b) => (b.properties.fontSize || 0) - (a.properties.fontSize || 0))[0];
  }
  if (/\bbutton|cta\b/.test(text)) return elements.find((e) => e.type === 'button');
  if (/\bimage|photo|picture\b/.test(text)) return elements.find((e) => e.type === 'image');
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
  return el.name || el.type;
}

function extractBrand(message) {
  const m = message.match(/(?:for|called|named)\s+([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/);
  if (!m) return null;
  return m[1].replace(/\b(gym|store|shop|restaurant|company|brand)\b/gi, '').trim() || m[1].trim();
}

function extractQuoted(message) {
  const m = message.match(/["“']([^"”']{2,60})["”']/);
  return m ? m[1] : null;
}

/** Percentage or money offers make far better headlines than an adjective. */
function extractOffer(message) {
  const percent = message.match(/(\d{1,2})\s*%\s*(?:off|discount)?/i);
  if (percent) return { headline: `${percent[1]}% OFF`, eyebrow: 'LIMITED TIME' };
  const free = /\bfree\s+(trial|month|class|session|delivery|consultation)\b/i.exec(message);
  if (free) return { headline: `FREE ${free[1].toUpperCase()}`, eyebrow: 'THIS MONTH' };
  return null;
}

/** Dates, times and prices become detail lines rather than headline noise. */
function extractDetails(message) {
  const details = [];
  const date = message.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/i);
  if (date) details.push(date[1].toUpperCase());
  const time = message.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (time) details.push(time[1].toUpperCase());
  const price = message.match(/([$£€₹]\s?\d[\d,.]*)/);
  if (price) details.push(price[1]);
  return details.slice(0, 3);
}

function extractColor(text) {
  const hex = text.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  if (hex) return hex[0];
  const map = {
    red: '#E4322B', blue: '#2563EB', green: '#16A34A', black: '#0A0A0A', white: '#FFFFFF',
    gold: '#C9A227', orange: '#EA580C', purple: '#7C3AED', pink: '#EC4899', yellow: '#EAB308',
    teal: '#0D9488', navy: '#12293F',
  };
  const found = Object.keys(map).find((c) => new RegExp(`\\b${c}\\b`).test(text));
  return found ? map[found] : null;
}

function buildImageQuery(message, industry, style) {
  const explicit = message.match(/\b(?:with|showing|featuring)\s+(?:a |an )?([a-z ]{3,48})/i);
  if (explicit) return `${explicit[1].trim()}, ${style.photo.keywords}`;
  if (industry) return industry.imageQuery;
  return style.photo.keywords;
}

function describeType(message, canvas) {
  const t = message.toLowerCase();
  if (/story|reel/.test(t)) return 'story';
  if (/poster|flyer/.test(t)) return 'poster';
  if (/banner/.test(t)) return 'banner';
  if (/thumbnail/.test(t)) return 'thumbnail';
  if (canvas && canvas.width === canvas.height) return 'social post';
  return 'design';
}

function defaultHeadline(message) {
  const t = message.toLowerCase();
  if (/job|career|hiring/.test(t)) return 'We are hiring';
  if (/launch|new/.test(t)) return 'Out now';
  if (/open/.test(t)) return 'Now open';
  return 'Made properly';
}

function defaultSubhead(message) {
  const t = message.toLowerCase();
  if (/job|career|hiring/.test(t)) return 'Roles open across design, engineering and support.';
  return 'Considered work for people who notice the difference.';
}

function extractCTA(message, industry) {
  const m = message.match(/["“']([^"”']+)["”']\s*button/i);
  if (m) return m[1];
  if (industry) return industry.cta;
  if (/job|career|apply/i.test(message)) return 'Apply now';
  return 'Learn more';
}
