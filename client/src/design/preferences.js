/**
 * The questions Apollo asks before it draws.
 *
 * Two rules shape this file.
 *
 * First, Apollo only asks what it can act on. Every option here maps to a
 * constraint the generation pipeline actually enforces — the style catalogue,
 * the layout families, the palette, the type pairing, whether there is
 * photography at all. Nothing is asked to look thoughtful.
 *
 * Second, it only asks what it cannot already tell. The brief is read first:
 * a prompt that says "dark, premium" has answered the tone question, one that
 * names a brand colour has answered the colour question, and one that says
 * "for new mums" has answered the audience question. Those questions are
 * dropped rather than asked back, so the sheet stays two or three questions
 * long and opens instantly — no round trip, because a model call here would
 * cost more time than the whole step is meant to take.
 *
 * The vocabulary mirrors `server/src/design/preferences.js`, which is the
 * authority: the server re-validates and re-derives everything that arrives.
 */

/* -------------------------------- vocabulary ------------------------------ */

/** Ten directions, matching the server's style catalogue exactly. */
export const STYLES = [
  { id: 'luxury-editorial', label: 'Luxury editorial', hint: 'Refined, timeless, quiet' },
  { id: 'bold-poster', label: 'Bold poster', hint: 'Loud, confident, high-impact' },
  { id: 'modern-minimal', label: 'Modern minimal', hint: 'Clean, calm, considered' },
  { id: 'vibrant-energetic', label: 'Vibrant', hint: 'Energetic, young, fun' },
  { id: 'tech-futuristic', label: 'Technology', hint: 'Precise, engineered, forward' },
  { id: 'warm-organic', label: 'Warm & organic', hint: 'Warm, honest, crafted' },
  { id: 'playful-bright', label: 'Playful & bright', hint: 'Cheerful, friendly, light' },
  { id: 'street-urban', label: 'Street & urban', hint: 'Raw, nocturnal, underground' },
  { id: 'soft-elegant', label: 'Soft & elegant', hint: 'Gentle, romantic, serene' },
  { id: 'corporate-clean', label: 'Corporate', hint: 'Trustworthy, structured, sober' },
];

export const TONES = [
  { id: 'minimal', label: 'Minimal', hint: 'Space and restraint' },
  { id: 'bold', label: 'Bold', hint: 'Big type, high contrast' },
  { id: 'elegant', label: 'Elegant', hint: 'Serif voice, hairlines' },
  { id: 'playful', label: 'Playful', hint: 'Rounded, bright, loose' },
];

export const COLOR_MOODS = [
  { id: 'dark', label: 'Dark', hint: 'Deep ground' },
  { id: 'light', label: 'Light', hint: 'Airy ground' },
  { id: 'vivid', label: 'Vivid', hint: 'Saturated' },
  { id: 'muted', label: 'Muted', hint: 'Understated' },
];

export const IMAGERY = [
  { id: 'photography', label: 'Photography', hint: 'Real, art-directed' },
  { id: 'illustration', label: 'Illustration', hint: 'Drawn artwork' },
  { id: 'abstract', label: 'Abstract', hint: 'Texture and form' },
  { id: 'none', label: 'Type only', hint: 'No imagery' },
];

export const MOODS = [
  'calm', 'confident', 'premium', 'energetic', 'warm',
  'serious', 'friendly', 'nostalgic', 'futuristic', 'dramatic',
];

export const EMPTY_PREFERENCES = {
  style: null,
  tone: null,
  colorMood: null,
  colors: [],
  mood: [],
  imagery: null,
  audience: null,
  notes: null,
};

/* ------------------------------ reading the brief ------------------------- */

/**
 * Style signals, in step with the server's own keyword planner. A prompt that
 * clearly names its world does not need to be asked what world it is in — but
 * the matched style is offered *first* in the list, so the guess is visible
 * and correctable rather than silent.
 */
const STYLE_SIGNALS = [
  ['luxury-editorial', ['luxury', 'fine dining', 'premium', 'exclusive', 'jewel', 'watch', 'gourmet', 'michelin', 'boutique hotel', 'wine', 'perfume']],
  ['bold-poster', ['gym', 'fitness', 'workout', 'crossfit', 'boxing', 'sale', 'sports', 'match', 'tournament', 'championship', 'marathon']],
  ['tech-futuristic', ['saas', 'software', 'app', 'ai', 'startup', 'platform', 'developer', 'cloud', 'data', 'crypto', 'cyber', 'technology']],
  ['warm-organic', ['bakery', 'coffee', 'cafe', 'farm', 'organic', 'handmade', 'artisan', 'craft', 'pottery', 'garden', 'sustainable']],
  ['playful-bright', ['kids', 'children', 'birthday', 'toy', 'nursery', 'playground', 'cartoon', 'candy', 'ice cream']],
  ['street-urban', ['street', 'hip hop', 'rap', 'skate', 'graffiti', 'nightclub', 'techno', 'rave', 'underground', 'sneaker', 'dj']],
  ['soft-elegant', ['spa', 'wedding', 'bridal', 'skincare', 'beauty', 'salon', 'yoga', 'wellness', 'floral', 'candle']],
  ['corporate-clean', ['corporate', 'consulting', 'finance', 'bank', 'insurance', 'b2b', 'conference', 'webinar', 'law', 'recruit']],
  ['vibrant-energetic', ['festival', 'concert', 'party', 'music', 'carnival', 'summer', 'dance', 'celebration']],
  ['modern-minimal', ['minimal', 'clean', 'architecture', 'furniture', 'portfolio', 'studio', 'gallery', 'product launch']],
];

const TONE_SIGNALS = [
  ['minimal', ['minimal', 'simple', 'clean', 'understated', 'restrained', 'stripped back']],
  ['bold', ['bold', 'loud', 'punchy', 'striking', 'high contrast', 'dramatic', 'in your face']],
  ['elegant', ['elegant', 'premium', 'luxury', 'refined', 'sophisticated', 'classy', 'upmarket']],
  ['playful', ['playful', 'fun', 'quirky', 'cheerful', 'friendly', 'cute', 'whimsical']],
];

const NAMED_COLORS = {
  red: '#E4322B', blue: '#2563EB', green: '#16A34A', black: '#0A0A0A', white: '#FFFFFF',
  gold: '#C9A227', orange: '#EA580C', purple: '#7C3AED', pink: '#EC4899', yellow: '#EAB308',
  teal: '#0D9488', navy: '#12293F', cream: '#F4EDE4', charcoal: '#1F1F22',
};

/** The strongest style match in a prompt, or null when it says nothing. */
function detectStyle(text) {
  let best = null;
  let score = 0;
  for (const [id, keywords] of STYLE_SIGNALS) {
    const total = keywords.reduce((sum, k) => (text.includes(k) ? sum + k.length : sum), 0);
    if (total > score) {
      best = id;
      score = total;
    }
  }
  // A single glancing keyword is a hint worth surfacing, not an answer.
  return score >= 4 ? { id: best, confident: score >= 9 } : null;
}

function detectTone(text) {
  for (const [id, keywords] of TONE_SIGNALS) {
    if (keywords.some((k) => text.includes(k))) return id;
  }
  return null;
}

function detectColors(text, raw) {
  const found = [];
  for (const hex of raw.match(/#[0-9a-f]{6}\b/gi) || []) found.push(hex.toUpperCase());
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    if (found.length >= 3) break;
    if (new RegExp(`\\b${name}\\b`).test(text) && !found.includes(hex)) found.push(hex);
  }
  return found.slice(0, 3);
}

const mentionsAudience = (text) =>
  /\bfor (young|new|busy|older|local)\b|\baudience\b|\bgen ?z\b|\bmillennial|\bstudents?\b|\bparents?\b|\bprofessionals?\b|\bbeginners?\b/.test(text);

const mentionsImagery = (text) =>
  /\bphoto|photograph|image|picture|illustration|illustrated|drawing|abstract|texture|type only|typographic|no image/.test(text);

/* ------------------------------ the questions ----------------------------- */

/**
 * Which preferences are worth asking about for this brief, and with which
 * options ordered how.
 *
 * Capped at three: past that it stops being a quick creative check and starts
 * being a form, which is the opposite of what this step is for.
 */
export function questionsFor(prompt = '') {
  const raw = String(prompt);
  const text = ` ${raw.toLowerCase()} `;

  const style = detectStyle(text);
  const tone = detectTone(text);
  const colors = detectColors(text, raw);
  const questions = [];

  /* Direction. Asked unless the brief named its world unmistakably. The
     detected style leads the list either way, so a confident guess still
     shows as a pre-selection rather than a decision made behind the user. */
  if (!style?.confident) {
    const ordered = style
      ? [...STYLES].sort((a, b) => (a.id === style.id ? -1 : b.id === style.id ? 1 : 0))
      : STYLES;
    questions.push({
      id: 'style',
      kind: 'single',
      question: 'What direction feels right?',
      options: ordered.slice(0, 6).map((s) => ({ value: s.id, label: s.label, hint: s.hint })),
      suggested: style?.id || null,
    });
  }

  /* Tone. Structure and type voice — a different axis from style, and the one
     users have the strongest instinct about. */
  if (!tone) {
    questions.push({
      id: 'tone',
      kind: 'single',
      question: 'How should it feel?',
      options: TONES.map((t) => ({ value: t.id, label: t.label, hint: t.hint })),
    });
  }

  /* Colour. Brand colours are the single most common hard requirement, so the
     swatch input is offered whenever the prompt did not already carry one. */
  if (colors.length) {
    questions.push({
      id: 'colorMood',
      kind: 'single',
      question: `Apollo picked up ${colors.length > 1 ? 'those colours' : 'that colour'} — how should the design sit around ${colors.length > 1 ? 'them' : 'it'}?`,
      options: COLOR_MOODS.map((c) => ({ value: c.id, label: c.label, hint: c.hint })),
      seeds: colors,
    });
  } else {
    questions.push({
      id: 'colors',
      kind: 'color',
      question: 'Any brand colours to work with?',
      hint: 'Apollo builds the palette around the first one.',
    });
  }

  /* Imagery. Worth asking only when the brief is silent about pictures and
     there is still room — it is the least often decisive of the four. */
  if (questions.length < 3 && !mentionsImagery(text)) {
    questions.push({
      id: 'imagery',
      kind: 'single',
      question: 'What kind of visuals?',
      options: IMAGERY.map((i) => ({ value: i.id, label: i.label, hint: i.hint })),
    });
  }

  if (questions.length < 3 && !mentionsAudience(text)) {
    questions.push({
      id: 'audience',
      kind: 'text',
      question: 'Who is this for?',
      hint: 'Apollo writes the copy for them.',
      placeholder: 'Busy parents, first-time buyers…',
    });
  }

  return questions.slice(0, 3);
}

/**
 * Fold the sheet's answers into the payload the server expects, dropping
 * everything untouched. Colours detected in the prompt travel too — the server
 * treats them as brand colours, which is what they were.
 */
export function toPreferences(answers, questions) {
  const prefs = { ...EMPTY_PREFERENCES, ...answers };

  const seeded = questions.find((q) => q.seeds)?.seeds;
  if (seeded && !prefs.colors.length) prefs.colors = seeded;

  const answered = Object.entries(prefs).some(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== ''));
  return answered ? prefs : null;
}
