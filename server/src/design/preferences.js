/**
 * Creative preferences — the short conversation Apollo has before it draws.
 *
 * These are *constraints on the brief*, not decoration. Everything here either
 * forces or biases a decision the art-direction stage would otherwise make
 * alone: the style, the layout family, the palette, the type voice and whether
 * there is photography at all. A preference the pipeline cannot act on has no
 * business being asked for, so this module is the single definition of what
 * Apollo is allowed to ask.
 *
 * Preferences are applied to the *raw plan*, before `normalizeBrief` — so the
 * planner's output and the user's answers go through exactly the same
 * validation, aspect-ratio filtering and palette repair. The model is told
 * about them too (see `describePreferences`), but it is never trusted to have
 * obeyed: this module is the enforcement.
 */

import { adjust, isDark, luminance, mix } from './color.js';
import { findLayout, findStyle, layoutsForAspect } from './artDirection.js';

/* -------------------------------- vocabulary ------------------------------ */

/**
 * Design tone. Orthogonal to style: "elegant" is a way of handling any subject,
 * so a tone steers structure and type voice rather than replacing the style.
 */
export const TONES = {
  minimal: {
    label: 'Minimal',
    layouts: ['minimal-frame', 'split-vertical', 'banner-lockup', 'editorial-asymmetric'],
    pairing: 'modern',
    note: 'Strip it back — generous space, few elements, quiet type.',
  },
  bold: {
    label: 'Bold',
    layouts: ['type-poster', 'full-bleed-hero', 'band-stack', 'overlap-collage'],
    pairing: 'poster',
    note: 'Go large and graphic — enormous type, high contrast, strong colour blocking.',
  },
  elegant: {
    label: 'Elegant',
    layouts: ['minimal-frame', 'editorial-asymmetric', 'split-vertical'],
    pairing: 'elegant',
    note: 'Refined and restrained — hairlines, small confident type, a serif voice.',
  },
  playful: {
    label: 'Playful',
    layouts: ['corner-hero', 'overlap-collage', 'band-stack', 'grid-editorial'],
    pairing: 'modern',
    note: 'Warm and friendly — rounded geometry, bright colour, a little asymmetry.',
  },
};

/** Where the picture comes from, and whether there is one at all. */
export const IMAGERY = {
  photography: { label: 'Photography', note: 'Real photography, art-directed and colour-graded.' },
  illustration: {
    label: 'Illustration',
    keywords: 'illustrated artwork, graphic, flat vector illustration, editorial illustration',
    note: 'Illustrated artwork rather than a photograph.',
  },
  abstract: {
    label: 'Abstract',
    keywords: 'abstract texture, gradient field, macro detail, non-literal composition',
    note: 'Abstract texture or form rather than a literal subject.',
  },
  none: { label: 'Type only', note: 'No imagery at all — typography carries the whole design.' },
};

/** Overall colour temperament, applied on top of whatever palette is chosen. */
export const COLOR_MOODS = {
  dark: { label: 'Dark', note: 'A dark, deep ground.' },
  light: { label: 'Light', note: 'A light, airy ground.' },
  vivid: { label: 'Vivid', note: 'Saturated, high-energy colour.' },
  muted: { label: 'Muted', note: 'Desaturated, understated colour.' },
};

/* ------------------------------- sanitising ------------------------------- */

const HEX = /^#?[0-9a-f]{6}$/i;

const hex = (value) => {
  if (typeof value !== 'string' || !HEX.test(value.trim())) return null;
  const v = value.trim();
  return (v.startsWith('#') ? v : `#${v}`).toUpperCase();
};

const oneOf = (value, allowed) => (typeof value === 'string' && allowed.includes(value) ? value : null);

const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/**
 * Everything that arrives from the client, reduced to what the pipeline can
 * actually use. Returns null when nothing usable was supplied, so "skipped" and
 * "answered nothing" are the same thing downstream.
 */
export function normalizePreferences(input) {
  if (!input || typeof input !== 'object') return null;

  const prefs = {
    style: findStyle(input.style)?.id || null,
    tone: oneOf(input.tone, Object.keys(TONES)),
    imagery: oneOf(input.imagery, Object.keys(IMAGERY)),
    colorMood: oneOf(input.colorMood, Object.keys(COLOR_MOODS)),
    colors: Array.isArray(input.colors) ? input.colors.map(hex).filter(Boolean).slice(0, 3) : [],
    mood: Array.isArray(input.mood)
      ? input.mood
          .filter((m) => typeof m === 'string' && m.trim())
          .slice(0, 4)
          .map((m) => m.trim().slice(0, 24))
      : [],
    audience: text(input.audience, 60),
    notes: text(input.notes, 240),
  };

  const answered = Object.values(prefs).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null));
  return answered ? prefs : null;
}

/* --------------------------- applying to the plan ------------------------- */

/**
 * Fold the user's answers into the planner's raw output.
 *
 * Returns `{ plan, forceLayout }`. `forceLayout` is set only for "type only",
 * which has to beat the aspect-ratio filter: a wide typographic banner is a
 * legitimate thing to ask for, and silently adding a photograph because the
 * canvas is wide would be ignoring the one instruction the user gave.
 */
export function applyPreferences(plan, prefs, { canvas } = {}) {
  if (!prefs) return { plan, forceLayout: null };

  const next = { ...plan };
  const style = findStyle(prefs.style);
  if (style) next.style = style.id;

  /* ------------------------------- structure ----------------------------- */

  let forceLayout = null;
  if (prefs.imagery === 'none') {
    next.layout = 'type-poster';
    next.focal = 'type';
    next.images = [];
    forceLayout = 'type-poster';
  } else if (prefs.tone) {
    const ratio = (canvas?.width || 1080) / (canvas?.height || 1080);
    const allowed = layoutsForAspect(ratio);
    // Keep the planner's layout when it already sits in the tone's family —
    // it chose that structure for the actual subject, which is better
    // information than the tone alone.
    const wanted = TONES[prefs.tone].layouts;
    if (!wanted.includes(next.layout)) {
      const pick = wanted.find((id) => allowed.includes(id));
      if (pick) next.layout = pick;
    }
    next.fontPairing = TONES[prefs.tone].pairing;
  }

  /* -------------------------------- colour ------------------------------- */

  // Picking a style is picking its palette. When the user overrode the
  // planner's style, the planner's colours belonged to the style it *thought*
  // it was making and have to go with it; otherwise they stand.
  const overrode = style && style.id !== plan.style;
  const base = overrode ? { ...style.palette } : { ...(plan.palette || {}) };
  const seeded = seedPalette(prefs, base);
  if (seeded) next.palette = seeded;
  else if (overrode) next.palette = base;

  /* --------------------------------- voice ------------------------------- */

  if (prefs.mood.length) next.mood = prefs.mood;
  if (prefs.audience) next.audience = prefs.audience;

  /* -------------------------------- imagery ------------------------------ */

  const keywords = IMAGERY[prefs.imagery]?.keywords;
  if (keywords && Array.isArray(next.images)) {
    next.images = next.images.map((image) => ({
      ...image,
      query: [image?.query, keywords].filter(Boolean).join(', ').slice(0, 160),
    }));
  }

  // The layout may have moved to one that wants a different number of frames;
  // normalizeBrief pads and trims the plan to fit, so only the count that
  // survives matters here.
  const wantedImages = findLayout(next.layout)?.images ?? 1;
  if (Array.isArray(next.images) && next.images.length > wantedImages) {
    next.images = next.images.slice(0, wantedImages);
  }

  return { plan: next, forceLayout };
}

/**
 * Seed a palette from brand colours.
 *
 * The first colour is the accent — it is the one a brand actually owns, and the
 * one that has to survive onto a button or a rule. A second colour is only
 * taken as the ground when it reads as one (clearly dark or clearly light);
 * two mid-tones fighting for the same job is how a design loses its contrast.
 * Roles that must be re-derived are deleted rather than guessed: `normalizePalette`
 * treats absent as missing and measures a legible replacement.
 */
function seedPalette(prefs, base) {
  if (!prefs.colors.length && !prefs.colorMood) return null;
  const out = { ...base };

  const [first, second] = prefs.colors;
  if (first) out.accent = first;

  if (second) {
    const l = luminance(second);
    if (l < 0.16 || l > 0.82) {
      out.background = second;
      out.surface = isDark(second) ? mix(second, '#FFFFFF', 0.08) : mix(second, '#000000', 0.06);
      delete out.primary;
      delete out.muted;
    } else {
      // A mid-tone second colour is a secondary accent, not a ground: it goes
      // to the muted role, where it carries rules and small type.
      out.muted = second;
    }
  }

  switch (prefs.colorMood) {
    case 'dark':
      if (!isDark(out.background)) {
        out.background = '#0B0B0C';
        out.surface = '#16161A';
        delete out.primary;
        delete out.muted;
      }
      break;
    case 'light':
      if (isDark(out.background)) {
        out.background = '#F5F4F1';
        out.surface = '#FFFFFF';
        delete out.primary;
        delete out.muted;
      }
      break;
    case 'vivid':
      if (out.accent) out.accent = adjust(out.accent, { sat: 0.22, light: 0.04 });
      break;
    case 'muted':
      if (out.accent) out.accent = adjust(out.accent, { sat: -0.3 });
      break;
    default:
      break;
  }

  return out;
}

/**
 * The preferences written out for the creative-director prompt. Plain sentences
 * because that is what the model reads best, and short because a long preamble
 * drowns the actual request.
 */
export function describePreferences(prefs) {
  if (!prefs) return null;
  const lines = [];

  const style = findStyle(prefs.style);
  if (style) lines.push(`Visual style: ${style.label} — use style id "${style.id}".`);
  if (prefs.tone) lines.push(`Tone: ${TONES[prefs.tone].label}. ${TONES[prefs.tone].note}`);
  if (prefs.mood.length) lines.push(`Mood: ${prefs.mood.join(', ')}.`);
  if (prefs.colors.length) {
    lines.push(
      `Brand colours that must appear: ${prefs.colors.join(', ')}. Build the palette around ${prefs.colors[0]} as the accent — do not substitute a different hue.`
    );
  }
  if (prefs.colorMood) lines.push(`Colour: ${COLOR_MOODS[prefs.colorMood].note}`);
  if (prefs.audience) lines.push(`Audience: ${prefs.audience}. Write the copy for these people specifically.`);
  if (prefs.imagery) lines.push(`Imagery: ${IMAGERY[prefs.imagery].note}`);
  if (prefs.notes) lines.push(`The user also said: "${prefs.notes}"`);

  if (!lines.length) return null;
  return `The user was asked what they wanted before you were briefed. Honour these — they outrank your own instincts, but you still choose everything they did not mention:\n${lines
    .map((l) => `- ${l}`)
    .join('\n')}`;
}
