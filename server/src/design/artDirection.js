/**
 * Apollo's art direction catalogue.
 *
 * This is the vocabulary the creative-director stage chooses from: visual
 * styles, palettes, type pairings, photography direction and canvas formats.
 * DeepSeek picks an entry (or overrides individual fields); the composer only
 * ever renders directions that exist here, which is what keeps output looking
 * art-directed rather than improvised.
 *
 * Pure data plus normalisation — no I/O, no model calls.
 */

import { adjust, contrastRatio, darken, distance, isDark, lighten, luminance, mix, readableOn } from './color.js';

/* ------------------------------- formats -------------------------------- */

/**
 * Canvas presets keyed by what people actually ask for. `keywords` are matched
 * against the raw prompt so "make an instagram story" sizes itself correctly
 * without the user picking a format first.
 */
export const FORMATS = [
  // `weak` keywords only apply when nothing more specific matched, so
  // "instagram story" resolves to a story rather than to a post.
  { id: 'instagram-post', label: 'Instagram post', width: 1080, height: 1080, keywords: ['instagram post', 'ig post', 'square post', 'social post'], weak: ['instagram', 'ig '] },
  { id: 'instagram-story', label: 'Instagram story', width: 1080, height: 1920, keywords: ['story', 'stories', 'reel', 'reels', 'tiktok', 'snapchat', 'vertical video'] },
  { id: 'poster', label: 'Poster', width: 1240, height: 1754, keywords: ['poster', 'a4', 'flyer', 'leaflet', 'handbill'] },
  { id: 'banner', label: 'Web banner', width: 1200, height: 628, keywords: ['banner', 'web banner', 'facebook post', 'linkedin post', 'og image', 'header'] },
  { id: 'thumbnail', label: 'Video thumbnail', width: 1280, height: 720, keywords: ['thumbnail', 'youtube', 'video cover'] },
  { id: 'presentation', label: 'Presentation slide', width: 1920, height: 1080, keywords: ['presentation', 'slide', 'deck', 'keynote'] },
  { id: 'pinterest', label: 'Pinterest pin', width: 1000, height: 1500, keywords: ['pinterest', 'pin'] },
  { id: 'menu', label: 'Menu', width: 1200, height: 1800, keywords: ['menu', 'price list'] },
  { id: 'business-card', label: 'Business card', width: 1050, height: 600, keywords: ['business card', 'visiting card', 'name card'] },
  { id: 'twitter', label: 'Wide social card', width: 1600, height: 900, keywords: ['twitter', 'x post', 'wide card'] },
];

/** Format implied by the prompt, or null to keep whatever canvas exists. */
export function detectFormat(prompt = '') {
  const text = prompt.toLowerCase();
  let best = null;
  let bestLength = 0;
  for (const format of FORMATS) {
    for (const keyword of format.keywords) {
      if (text.includes(keyword) && keyword.length > bestLength) {
        best = format;
        bestLength = keyword.length;
      }
    }
  }
  if (best) return best;
  for (const format of FORMATS) {
    if ((format.weak || []).some((keyword) => text.includes(keyword))) return format;
  }
  return null;
}

export const findFormat = (id) => FORMATS.find((f) => f.id === id) || null;

/* ------------------------------ typography ------------------------------ */

/**
 * Curated pairings from the eight faces the canvas can render. A pairing is a
 * voice, not a list: `display` carries the headline, `body` the supporting
 * copy, `meta` the small structural detail (dates, codes, urls).
 */
export const FONT_PAIRINGS = {
  poster: { id: 'poster', display: 'Bebas Neue', body: 'Inter', meta: 'JetBrains Mono', displayCase: 'uppercase', displayTracking: 0.01, tight: true },
  editorial: { id: 'editorial', display: 'Playfair Display', body: 'Inter', meta: 'JetBrains Mono', displayCase: 'none', displayTracking: -0.005 },
  elegant: { id: 'elegant', display: 'Instrument Serif', body: 'Inter', meta: 'JetBrains Mono', displayCase: 'none', displayTracking: 0 },
  modern: { id: 'modern', display: 'Instrument Sans', body: 'Inter', meta: 'JetBrains Mono', displayCase: 'none', displayTracking: -0.022 },
  neutral: { id: 'neutral', display: 'Inter', body: 'Inter', meta: 'JetBrains Mono', displayCase: 'none', displayTracking: -0.02 },
  classic: { id: 'classic', display: 'Georgia', body: 'Inter', meta: 'JetBrains Mono', displayCase: 'none', displayTracking: -0.005 },
};

export const findPairing = (id) => FONT_PAIRINGS[id] || null;

/* -------------------------------- styles -------------------------------- */

/**
 * Visual styles. Each one is a complete direction — palette, type voice,
 * photography treatment, geometry and the compositions it suits — so a luxury
 * restaurant and a kids' party never come out looking the same.
 *
 * `layouts` is a preference order, not a restriction: the planner may pick any
 * layout, but when it does not care, the first entries here are used.
 */
export const STYLES = [
  {
    id: 'luxury-editorial',
    label: 'Luxury editorial',
    mood: ['refined', 'timeless', 'quiet', 'premium'],
    pairing: 'elegant',
    palette: { background: '#0F0D0B', surface: '#171310', primary: '#F2EDE4', accent: '#C9A227', muted: '#9A9186' },
    layouts: ['minimal-frame', 'editorial-asymmetric', 'split-vertical', 'full-bleed-hero'],
    photo: { treatment: 'moody', keywords: 'soft directional light, shallow depth of field, rich shadows, editorial', contrast: 106, saturation: 92, vignette: 22, grain: 6 },
    geometry: { radius: 0, rule: 1, density: 'airy' },
    type: { eyebrowTracking: 0.34, headlineWeight: 400, ctaCase: 'uppercase' },
  },
  {
    id: 'bold-poster',
    label: 'Bold poster',
    mood: ['loud', 'confident', 'high-impact', 'athletic'],
    pairing: 'poster',
    palette: { background: '#0B0B0C', surface: '#141416', primary: '#F7F6F3', accent: '#E4322B', muted: '#8E8C88' },
    layouts: ['type-poster', 'full-bleed-hero', 'overlap-collage', 'band-stack'],
    photo: { treatment: 'punchy', keywords: 'dramatic lighting, strong silhouette, high contrast, dynamic action', contrast: 122, saturation: 104, vignette: 26, grain: 8 },
    geometry: { radius: 0, rule: 4, density: 'dense' },
    type: { eyebrowTracking: 0.4, headlineWeight: 400, ctaCase: 'uppercase' },
  },
  {
    id: 'modern-minimal',
    label: 'Modern minimal',
    mood: ['clean', 'calm', 'considered', 'contemporary'],
    pairing: 'modern',
    palette: { background: '#F4F3F0', surface: '#FFFFFF', primary: '#111110', accent: '#1F5EFF', muted: '#6B6A66' },
    layouts: ['minimal-frame', 'split-vertical', 'editorial-asymmetric', 'grid-editorial'],
    photo: { treatment: 'clean', keywords: 'bright natural light, clean background, minimal composition, negative space', contrast: 102, saturation: 98, vignette: 0, grain: 0 },
    geometry: { radius: 8, rule: 1, density: 'airy' },
    type: { eyebrowTracking: 0.26, headlineWeight: 600, ctaCase: 'none' },
  },
  {
    id: 'vibrant-energetic',
    label: 'Vibrant & energetic',
    mood: ['energetic', 'young', 'fun', 'loud'],
    pairing: 'poster',
    palette: { background: '#120A2E', surface: '#1D1147', primary: '#FFFFFF', accent: '#FF3D7F', muted: '#B9AEDC' },
    layouts: ['overlap-collage', 'corner-hero', 'band-stack', 'full-bleed-hero'],
    photo: { treatment: 'punchy', keywords: 'vivid colour, motion, joyful energy, bold lighting', contrast: 116, saturation: 124, vignette: 10, grain: 0 },
    geometry: { radius: 20, rule: 6, density: 'dense' },
    type: { eyebrowTracking: 0.3, headlineWeight: 400, ctaCase: 'uppercase' },
  },
  {
    id: 'tech-futuristic',
    label: 'Technology',
    mood: ['precise', 'engineered', 'forward', 'confident'],
    pairing: 'modern',
    palette: { background: '#07090F', surface: '#0E121C', primary: '#F2F5FA', accent: '#4C8DFF', muted: '#7C8798' },
    layouts: ['split-vertical', 'editorial-asymmetric', 'full-bleed-hero', 'grid-editorial'],
    photo: { treatment: 'cool', keywords: 'abstract technology, cool blue light, macro detail, dark background', contrast: 110, saturation: 88, temperature: -14, vignette: 18, grain: 4 },
    geometry: { radius: 10, rule: 2, density: 'balanced' },
    type: { eyebrowTracking: 0.32, headlineWeight: 600, ctaCase: 'none' },
  },
  {
    id: 'warm-organic',
    label: 'Warm & organic',
    mood: ['warm', 'honest', 'crafted', 'welcoming'],
    pairing: 'editorial',
    palette: { background: '#F6EFE4', surface: '#FFFBF4', primary: '#241C12', accent: '#B4531F', muted: '#7A6A57' },
    layouts: ['editorial-asymmetric', 'split-vertical', 'minimal-frame', 'grid-editorial'],
    photo: { treatment: 'warm', keywords: 'warm natural light, textured, handmade, earthy tones', contrast: 102, saturation: 106, temperature: 16, vignette: 8, grain: 6 },
    geometry: { radius: 14, rule: 1, density: 'balanced' },
    type: { eyebrowTracking: 0.28, headlineWeight: 400, ctaCase: 'none' },
  },
  {
    id: 'playful-bright',
    label: 'Playful & bright',
    mood: ['cheerful', 'friendly', 'childlike', 'light'],
    pairing: 'modern',
    palette: { background: '#FFF6E9', surface: '#FFFFFF', primary: '#1B1B2F', accent: '#FF7A1A', muted: '#7B7286' },
    layouts: ['corner-hero', 'overlap-collage', 'band-stack', 'grid-editorial'],
    photo: { treatment: 'bright', keywords: 'bright cheerful, candid, colourful, soft daylight', contrast: 104, saturation: 118, vignette: 0, grain: 0 },
    geometry: { radius: 28, rule: 5, density: 'dense' },
    type: { eyebrowTracking: 0.22, headlineWeight: 700, ctaCase: 'none' },
  },
  {
    id: 'street-urban',
    label: 'Street & urban',
    mood: ['raw', 'nocturnal', 'rebellious', 'underground'],
    pairing: 'poster',
    palette: { background: '#0A0A0A', surface: '#151515', primary: '#F2F2F2', accent: '#D6FF3D', muted: '#8A8A8A' },
    layouts: ['full-bleed-hero', 'type-poster', 'overlap-collage', 'band-stack'],
    photo: { treatment: 'gritty', keywords: 'night city, neon reflections, high contrast street photography, grain', contrast: 128, saturation: 86, vignette: 34, grain: 18, clarity: 20 },
    geometry: { radius: 0, rule: 3, density: 'dense' },
    type: { eyebrowTracking: 0.42, headlineWeight: 400, ctaCase: 'uppercase' },
  },
  {
    id: 'soft-elegant',
    label: 'Soft & elegant',
    mood: ['gentle', 'romantic', 'serene', 'feminine'],
    pairing: 'elegant',
    palette: { background: '#F4EDE9', surface: '#FDF9F7', primary: '#2E2621', accent: '#B98070', muted: '#8B7C74' },
    layouts: ['minimal-frame', 'editorial-asymmetric', 'split-vertical', 'grid-editorial'],
    photo: { treatment: 'airy', keywords: 'soft diffused light, pastel tones, delicate, airy composition', contrast: 96, saturation: 94, vignette: 0, grain: 4, bloom: 14 },
    geometry: { radius: 200, rule: 1, density: 'airy' },
    type: { eyebrowTracking: 0.3, headlineWeight: 400, ctaCase: 'none' },
  },
  {
    id: 'corporate-clean',
    label: 'Corporate',
    mood: ['trustworthy', 'structured', 'professional', 'sober'],
    pairing: 'neutral',
    palette: { background: '#0C1B2A', surface: '#12293F', primary: '#F4F7FA', accent: '#2E9BFF', muted: '#8AA0B4' },
    layouts: ['split-vertical', 'grid-editorial', 'editorial-asymmetric', 'banner-lockup'],
    photo: { treatment: 'clean', keywords: 'professional environment, natural window light, modern workspace', contrast: 104, saturation: 94, vignette: 6, grain: 0 },
    geometry: { radius: 6, rule: 2, density: 'balanced' },
    type: { eyebrowTracking: 0.3, headlineWeight: 600, ctaCase: 'none' },
  },
];

export const findStyle = (id) => STYLES.find((s) => s.id === id) || null;

/* ------------------------------- layouts -------------------------------- */

/**
 * The compositions the layout engine can build. Descriptions are written for
 * the planner — they are what DeepSeek reads when choosing a structure — and
 * `needsImage` tells the pipeline how many photographs to source.
 */
export const LAYOUTS = [
  { id: 'full-bleed-hero', label: 'Full-bleed hero', images: 1, description: 'One photograph fills the canvas; a directional scrim carries the type. Maximum atmosphere. Best when the subject is strong and the message is short.' },
  { id: 'split-vertical', label: 'Split composition', images: 1, description: 'Canvas divided into a photographic field and a colour field. Calm, commercial, very legible. Good for offers and product news.' },
  { id: 'editorial-asymmetric', label: 'Editorial asymmetric', images: 1, description: 'Offset image panel, type hanging off a strong left axis, hairline rules and small meta type. Magazine feel, sophisticated.' },
  { id: 'type-poster', label: 'Typographic poster', images: 0, description: 'Typography is the image: enormous display type, colour blocking, almost no photography. Loud and graphic.' },
  { id: 'minimal-frame', label: 'Minimal luxury', images: 1, description: 'Generous negative space, a small centred image or none, hairline rules, restrained centred type. Premium and quiet.' },
  { id: 'overlap-collage', label: 'Overlapping collage', images: 1, description: 'Image panel and colour block overlap, with type crossing the boundary for depth. Energetic and modern.' },
  { id: 'band-stack', label: 'Colour bands', images: 1, description: 'Horizontal bands of colour and photography stacked with a firm rhythm. Bold, promotional, poster-like.' },
  { id: 'corner-hero', label: 'Corner hero', images: 1, description: 'Image anchored into one corner behind a rounded mask, type on the diagonal opposite. Playful and dynamic.' },
  { id: 'grid-editorial', label: 'Editorial grid', images: 3, description: 'A modular grid of several images with type occupying one cell. Great for collections, menus and multi-item stories.' },
  { id: 'banner-lockup', label: 'Wide lockup', images: 1, description: 'Horizontal lockup for wide canvases: type left, photograph right, aligned to a firm baseline. Clean and corporate.' },
];

export const findLayout = (id) => LAYOUTS.find((l) => l.id === id) || null;

/**
 * Layouts that hold up at a given aspect ratio. A typographic poster is superb
 * at 4:5 and terrible at 16:9, so the planner's choice is filtered through this
 * before it reaches the composer.
 */
export function layoutsForAspect(ratio) {
  if (ratio >= 1.6) return ['banner-lockup', 'split-vertical', 'full-bleed-hero', 'editorial-asymmetric', 'overlap-collage', 'grid-editorial'];
  if (ratio >= 1.15) return ['banner-lockup', 'split-vertical', 'full-bleed-hero', 'editorial-asymmetric', 'overlap-collage', 'type-poster', 'grid-editorial'];
  if (ratio >= 0.85) return ['full-bleed-hero', 'split-vertical', 'editorial-asymmetric', 'overlap-collage', 'type-poster', 'minimal-frame', 'corner-hero', 'band-stack', 'grid-editorial'];
  return ['full-bleed-hero', 'editorial-asymmetric', 'type-poster', 'minimal-frame', 'band-stack', 'corner-hero', 'overlap-collage', 'grid-editorial', 'split-vertical'];
}

/* ------------------------------ variations ------------------------------ */

/**
 * Three genuinely different directions for the same brief — different layout
 * families and different type voices, not recoloured copies of one another.
 */
export const VARIATIONS = [
  { id: 'bold', label: 'Bold', layouts: ['type-poster', 'full-bleed-hero', 'band-stack', 'overlap-collage'], scale: 1.14, pairing: 'poster' },
  { id: 'minimal', label: 'Minimal', layouts: ['minimal-frame', 'split-vertical', 'banner-lockup'], scale: 0.84, pairing: 'modern' },
  { id: 'editorial', label: 'Editorial', layouts: ['editorial-asymmetric', 'grid-editorial', 'split-vertical'], scale: 1, pairing: 'editorial' },
];

/* ----------------------------- normalisation ---------------------------- */

const PALETTE_KEYS = ['background', 'surface', 'primary', 'accent', 'muted'];

/**
 * Turn a partial, possibly sloppy palette from the model into a complete and
 * self-consistent one. Missing roles are derived from what was given, and
 * `onAccent`/`textMuted` are measured rather than guessed.
 */
export function normalizePalette(input = {}, fallback) {
  const base = { ...fallback };
  for (const key of PALETTE_KEYS) {
    if (typeof input[key] === 'string' && /^#?[0-9a-f]{3,8}$/i.test(input[key].trim())) {
      base[key] = input[key].trim().startsWith('#') ? input[key].trim() : `#${input[key].trim()}`;
    }
  }

  const dark = isDark(base.background);
  // A surface has to read as a distinct plane from the background, not a
  // near-identical grey — otherwise colour blocking disappears.
  if (!base.surface || Math.abs(luminance(base.background) - luminance(base.surface)) < 0.015) {
    base.surface = dark ? lighten(base.background, 0.07) : darken(base.background, 0.05);
  }
  if (!base.primary) base.primary = dark ? '#F5F4F1' : '#111110';
  base.primary = readableOn(base.background, [base.primary], 4.5);
  if (!base.accent) base.accent = fallback.accent;

  // Text and accent doing the same job is a wasted colour and a flat hierarchy.
  // The accent is the one worth keeping, so the text reverts to a near-neutral.
  if (distance(base.primary, base.accent) < 60) {
    base.primary = dark ? '#F5F4F1' : '#111110';
  }

  if (!base.muted) base.muted = mix(base.primary, base.background, 0.45);
  base.muted = readableOn(base.background, [base.muted, mix(base.primary, base.background, 0.3)], 3.2);

  // The accent only has to read as a *colour* against the ground here — it
  // carries blocks, rules and buttons. Where it is set as small type, the
  // composer derives a legible variant instead, so this stays a light touch
  // and a deliberately bright accent survives the trip.
  if (contrastRatio(base.accent, base.background) < 1.6) {
    base.accent = dark ? lighten(base.accent, 0.16) : darken(base.accent, 0.12);
  }

  return {
    ...base,
    onAccent: readableOn(base.accent, ['#FFFFFF', '#0A0A0A'], 4.5),
    onSurface: readableOn(base.surface, [base.primary, '#FFFFFF', '#0A0A0A'], 4.5),
    accentSoft: mix(base.accent, base.background, 0.72),
    dark,
  };
}

/**
 * Fill in everything the composer needs from whatever the planner produced.
 * Nothing downstream has to defend against a missing field.
 *
 * `forceLayout` bypasses the aspect-ratio filter for the one case where the
 * user has explicitly asked for a structure this canvas would normally rule
 * out — a typographic banner, say. It is never set from model output.
 */
export function normalizeBrief(input = {}, { canvas, prompt = '', forceLayout = null } = {}) {
  const style = findStyle(input.style) || pickStyleFor(prompt) || STYLES[2];
  const width = canvas?.width || 1080;
  const height = canvas?.height || 1080;
  const ratio = width / height;

  const allowed = layoutsForAspect(ratio);
  const requested = findLayout(input.layout)?.id;
  const layout =
    findLayout(forceLayout)?.id ||
    (allowed.includes(requested) ? requested : allowed.find((id) => style.layouts.includes(id)) || allowed[0]);

  const pairing = findPairing(input.fontPairing) || FONT_PAIRINGS[style.pairing];
  const palette = normalizePalette(input.palette, style.palette);

  return {
    designType: str(input.designType, 'design'),
    audience: str(input.audience, 'general audience'),
    mood: Array.isArray(input.mood) && input.mood.length ? input.mood.slice(0, 4).map(String) : style.mood.slice(0, 3),
    style: style.id,
    styleRef: style,
    layout,
    palette,
    fonts: pairing,
    copy: normalizeCopy(input.copy),
    images: normalizeImagePlan(input.images, style, findLayout(layout)),
    focal: input.focal === 'type' ? 'type' : 'image',
    rationale: str(input.rationale, ''),
    canvas: { width, height, background: palette.background },
  };
}

const str = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

function normalizeCopy(copy = {}) {
  const details = Array.isArray(copy.details)
    ? copy.details.filter((d) => typeof d === 'string' && d.trim()).slice(0, 4).map((d) => d.trim())
    : [];
  return {
    eyebrow: str(copy.eyebrow, '').slice(0, 46),
    headline: str(copy.headline, 'Your headline here').slice(0, 90),
    subhead: str(copy.subhead, '').slice(0, 180),
    cta: str(copy.cta, '').slice(0, 28),
    details,
    meta: str(copy.meta, '').slice(0, 60),
  };
}

/**
 * Each image request carries what the curator needs to *judge* candidates, not
 * just a search string: where the type will sit, what shape the slot is, and
 * which treatment the style wants applied.
 */
function normalizeImagePlan(images, style, layout) {
  const wanted = layout?.images ?? 1;
  if (!wanted) return [];
  const list = Array.isArray(images) ? images : [];
  const out = [];
  for (let i = 0; i < wanted; i += 1) {
    const entry = list[i] || {};
    out.push({
      role: str(entry.role, i === 0 ? 'hero' : `support-${i}`),
      query: str(entry.query, style.photo.keywords),
      keywords: style.photo.keywords,
      // Where the type lands, so the curator can prefer usable empty space there.
      negativeSpace: ['left', 'right', 'top', 'bottom', 'center', 'any'].includes(entry.negativeSpace) ? entry.negativeSpace : 'any',
      orientation: ['landscape', 'portrait', 'square', 'any'].includes(entry.orientation) ? entry.orientation : 'any',
      subject: str(entry.subject, ''),
      treatment: str(entry.treatment, style.photo.treatment),
    });
  }
  return out;
}

/** Keyword-scored style guess — the fallback when no model is available. */
export function pickStyleFor(prompt = '') {
  const text = ` ${prompt.toLowerCase()} `;
  const signals = [
    ['luxury-editorial', ['luxury', 'fine dining', 'premium', 'exclusive', 'jewel', 'watch', 'gourmet', 'michelin', 'boutique hotel', 'wine', 'perfume', 'elegant restaurant']],
    ['bold-poster', ['gym', 'fitness', 'workout', 'crossfit', 'boxing', 'sale', 'sports', 'match', 'tournament', 'championship', 'bootcamp', 'marathon']],
    ['tech-futuristic', ['saas', 'software', 'app', 'ai', 'startup', 'platform', 'developer', 'cloud', 'data', 'crypto', 'cyber', 'technology']],
    ['warm-organic', ['bakery', 'coffee', 'cafe', 'farm', 'organic', 'handmade', 'artisan', 'craft', 'pottery', 'garden', 'sustainable']],
    ['playful-bright', ['kids', 'children', 'birthday', 'toy', 'nursery', 'playground', 'cartoon', 'school fair', 'candy', 'ice cream']],
    ['street-urban', ['street', 'hip hop', 'rap', 'skate', 'graffiti', 'nightclub', 'techno', 'rave', 'underground', 'sneaker', 'dj']],
    ['soft-elegant', ['spa', 'wedding', 'bridal', 'skincare', 'beauty', 'salon', 'yoga', 'wellness', 'floral', 'candle']],
    ['corporate-clean', ['corporate', 'consulting', 'finance', 'bank', 'insurance', 'b2b', 'conference', 'webinar', 'law', 'accounting', 'recruit']],
    ['vibrant-energetic', ['festival', 'concert', 'party', 'music', 'carnival', 'summer', 'dance', 'live show', 'celebration']],
    ['modern-minimal', ['minimal', 'clean', 'architecture', 'furniture', 'portfolio', 'studio', 'gallery', 'product launch']],
  ];
  let best = null;
  let bestScore = 0;
  for (const [id, keywords] of signals) {
    const score = keywords.reduce((sum, k) => (text.includes(k) ? sum + k.length : sum), 0);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return findStyle(best);
}

/**
 * Photographic direction for a style, expressed as image-layer adjustments the
 * canvas already understands. This is what stops sourced stock photography from
 * looking like stock photography.
 */
export function photoTreatment(style, { onDark = true } = {}) {
  const photo = style.photo || {};
  const out = {
    contrast: photo.contrast ?? 100,
    saturation: photo.saturation ?? 100,
    brightness: onDark ? 96 : 100,
    vignette: photo.vignette ?? 0,
    grain: photo.grain ?? 0,
  };
  if (photo.temperature) out.temperature = photo.temperature;
  if (photo.clarity) out.clarity = photo.clarity;
  if (photo.bloom) out.bloom = photo.bloom;
  return out;
}

/** Search terms that bias stock APIs towards art-directed frames. */
export function enrichQuery(query, style, { negativeSpace = 'any' } = {}) {
  const parts = [query];
  const photo = style?.photo?.keywords;
  if (photo) parts.push(photo.split(',')[0].trim());
  if (negativeSpace !== 'any' && negativeSpace !== 'center') parts.push('copy space');
  return parts.filter(Boolean).join(', ').slice(0, 120);
}

/** Accent variants used for depth: soft glows, tints and colour blocks. */
export function accentRamp(palette) {
  return {
    base: palette.accent,
    soft: mix(palette.accent, palette.background, 0.7),
    deep: adjust(palette.accent, { light: -0.12, sat: 0.06 }),
    tint: mix(palette.accent, palette.background, 0.88),
  };
}
