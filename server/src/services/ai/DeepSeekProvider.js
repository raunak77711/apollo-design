import { AIProvider } from './AIProvider.js';
import { fetchWithTimeout, statusError } from '../upstream.js';
import { OPERATION_TYPES } from '../../design/operations.js';
import { ELEMENT_TYPES, ALLOWED_ICONS, BLEND_MODES, STROKE_STYLES, SIGNED_ADJUST_KEYS, UNSIGNED_ADJUST_KEYS } from '../../design/schema.js';
import { FONT_PAIRINGS, LAYOUTS, STYLES } from '../../design/artDirection.js';

/** Generous for a reasoning call, finite so a silent model can't stall a design. */
const CHAT_TIMEOUT_MS = 45_000;

/**
 * DeepSeek-backed provider, used for two very different jobs.
 *
 * 1. `planDesign` — the creative-director pass. It returns a *design brief*:
 *    style, palette, type pairing, layout, copy and photographic direction.
 *    No coordinates. Deciding where pixels go is the composer's job, and
 *    keeping the model out of geometry is what stops designs coming back
 *    misaligned, overflowing or randomly placed.
 *
 * 2. `generateOperations` — the editing pass, used once a design exists. Here
 *    the model does emit operations, because the user is asking for a specific
 *    change to a specific layer.
 *
 * The model never returns HTML, SVG or CSS, and everything it does return is
 * re-validated before it touches a document.
 */
export class DeepSeekProvider extends AIProvider {
  constructor({ apiKey, baseUrl, model }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async chat({ system, user, temperature = 0.6, maxTokens = 2400 }) {
    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature,
        max_tokens: maxTokens,
      }),
      // The art-direction call is legitimately slow, but a model that has
      // stopped answering must still surface as an error — `safePlan` can only
      // fall back to the heuristic planner if this actually throws.
      timeoutMs: CHAT_TIMEOUT_MS,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw statusError(`DeepSeek API error ${res.status}: ${detail.slice(0, 300)}`, res.status);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    try {
      return JSON.parse(content);
    } catch {
      throw new Error('DeepSeek returned non-JSON content');
    }
  }

  /**
   * Turn a one-line request into a full art-direction brief.
   *
   * `critique` is fed back on a second attempt, which is how a weak first pass
   * gets genuinely reconsidered rather than nudged.
   */
  async planDesign({ message, canvas, variation, critique, previous, referenceNote, preferenceNote }) {
    const parsed = await this.chat({
      system: buildDirectorPrompt(),
      user: buildBriefPrompt({ message, canvas, variation, critique, previous, referenceNote, preferenceNote }),
      // Art direction benefits from real temperature; the schema keeps it safe.
      temperature: critique ? 0.85 : 1.0,
      maxTokens: 1800,
    });
    return parsed && typeof parsed === 'object' ? parsed : {};
  }

  async generateOperations({ message, document, selectedElementId }) {
    const parsed = await this.chat({
      system: buildEditorPrompt(),
      user: buildEditPrompt({ message, document, selectedElementId }),
      temperature: 0.3,
      maxTokens: 3000,
    });
    return {
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      message: typeof parsed.message === 'string' ? parsed.message : 'Done.',
    };
  }
}

/* ---------------------------- creative director --------------------------- */

function buildDirectorPrompt() {
  const styles = STYLES.map((s) => `- ${s.id}: ${s.label} — ${s.mood.join(', ')}`).join('\n');
  const layouts = LAYOUTS.map((l) => `- ${l.id}: ${l.description}`).join('\n');
  const pairings = Object.values(FONT_PAIRINGS)
    .map((p) => `- ${p.id}: ${p.display} headlines with ${p.body} body`)
    .join('\n');

  return `You are the art director at a design studio whose work wins awards. You are briefing a
compositor who will build the artwork exactly to your specification. You decide the *creative
direction*; the compositor handles grid, alignment, sizing and spacing — so never give coordinates,
pixel sizes or font sizes.

Return ONLY a JSON object with this shape:

{
  "designType": "instagram post" | "poster" | "banner" | ...,
  "audience": "who this speaks to, one short phrase",
  "mood": ["three", "adjectives", "max"],
  "style": "<one style id>",
  "layout": "<one layout id>",
  "fontPairing": "<one pairing id>",
  "focal": "image" | "type",
  "palette": {
    "background": "#hex", "surface": "#hex", "primary": "#hex",
    "accent": "#hex", "muted": "#hex"
  },
  "copy": {
    "eyebrow": "SHORT LABEL ABOVE THE HEADLINE (2-4 words, may be empty)",
    "headline": "the line that carries the design",
    "subhead": "one supporting sentence, may be empty",
    "cta": "2-3 word action, may be empty",
    "details": ["short lines rendered as a stacked, divided list — 0 to 12 of them"],
    "meta": "brand or url line, may be empty"
  },
  "images": [
    {
      "role": "hero" | "logo",
      "query": "a described photograph, not a subject",
      "subject": "the literal subject, 2-4 words",
      "orientation": "landscape" | "portrait" | "square" | "any",
      "negativeSpace": "left" | "right" | "top" | "bottom" | "center" | "any"
    }
  ],
  "rationale": "one sentence on why this direction suits the brief"
}

STYLES — pick the one that genuinely fits the subject:
${styles}

LAYOUTS — pick for the message, not out of habit. Do not default to the same one:
${layouts}

TYPE PAIRINGS:
${pairings}

How to art-direct well:

COLOUR. Choose a palette with intent, from the product and the emotion — not grey on white. Dark,
saturated or deeply tinted grounds usually look more expensive than pale ones. The accent must be a
real colour that can carry a button and a rule, and must be clearly visible on the background.
Three colours plus neutrals, never more. Colour psychology matters: a fine-dining brand is not
cyan, a children's party is not charcoal.

COPY. Write like a copywriter, not a placeholder generator. The headline is 2-6 words, specific and
confident — no "Welcome to", no "Your headline here", no exclamation marks, no filler like "Elevate
your experience". Prefer a concrete promise or a sharp image. The eyebrow is a category or a date,
not a sentence. The subhead is one sentence that adds information the headline does not.
Only include a CTA if the design is genuinely asking for an action.

CONTENT. Read the request for what it actually is before reaching for marketing language. Not
every brief is an offer with a headline and a CTA — some are informational: a class handout, a
recipe, a schedule, a price list, a set of instructions, a times table. When the request is
informational, say so plainly: the headline names the subject ("8 Times Table", "Sourdough —
Day 1"), and every discrete fact or row (each multiplication line, each step, each price) becomes
one entry in "details", in order, one fact per line, exactly as it should read — do not summarise,
sample, or truncate the list down to a few representative lines. "details" renders as a real
stacked list with dividers, so it is the right place for this, not prose stuffed into the subhead.
Only fall back to a headline + one-line subhead when the brief genuinely has no list of facts to
enumerate.

PHOTOGRAPHY. Write the query as a photographer's brief: subject, angle, lighting, environment,
mood. "low angle of a boxer wrapping their hands, single hard light, dark gym" — not "gym". Say
where the frame should be quiet via negativeSpace, because the type will sit there. Match the
orientation to the layout. For layouts with no images, return an empty array. Images are generated
or sourced separately and NEVER contain rendered words, letters or logotype text — headlines and
labels are always their own live text layers, so never rely on an image to carry a message. Only
propose role "logo" when the brief genuinely calls for a distinct brand mark (a real business name,
not a generic offer) — describe it as an icon-like graphic, not a photograph, and keep it to at most
one per design.

LAYOUT. Match structure to message. A short punchy offer wants type-poster or full-bleed-hero. A
premium brand wants minimal-frame or editorial-asymmetric. A multi-item story wants grid-editorial.
Do not put everything in the middle of the canvas.

RESTRAINT. Every element must earn its place. A design can be almost empty and still be powerful;
it cannot be crowded and be good. Never add decoration for its own sake.

Respond with valid JSON only.`;
}

function buildBriefPrompt({ message, canvas, variation, critique, previous, referenceNote, preferenceNote }) {
  const ratio = canvas ? (canvas.width / canvas.height).toFixed(2) : '1.00';
  const shape = Number(ratio) > 1.25 ? 'landscape' : Number(ratio) < 0.85 ? 'portrait' : 'square';

  const parts = [
    `Request: ${message}`,
    `Canvas: ${canvas?.width}×${canvas?.height}px (${shape}, ratio ${ratio}).`,
  ];

  if (preferenceNote) parts.push(preferenceNote);

  if (referenceNote) {
    parts.push(
      `The user also attached a reference image. What it shows: ${referenceNote} Let it inform subject, mood and palette choices — the image itself will be generated separately using this same reference.`
    );
  }

  if (variation) {
    parts.push(
      `This is the "${variation.label}" direction. It must be a genuinely different composition from the other directions — prefer one of these layouts: ${variation.layouts.join(', ')}. ${
        variation.id === 'bold'
          ? 'Go large, graphic and high-contrast.'
          : variation.id === 'minimal'
            ? 'Strip it back: more space, less type, quieter palette.'
            : 'Treat it as an editorial spread: structure, hairlines, small confident type.'
      }`
    );
  }

  if (critique?.length) {
    parts.push(
      `Your previous direction was built and reviewed. It failed on: ${critique.join('; ')}.`,
      `Previous direction was style "${previous?.style}" with layout "${previous?.layout}" and headline "${previous?.copy?.headline}".`,
      'Fix this properly — change the layout, palette or copy length as needed. Do not repeat the same choices.'
    );
  }

  return parts.join('\n\n');
}

/* -------------------------------- editor --------------------------------- */

function buildEditorPrompt() {
  return `You are Apollo, an AI design assistant editing an existing design. You NEVER output HTML,
SVG, CSS or code — only JSON operations, which Apollo re-validates before applying.

Return: { "operations": [...], "message": "short human summary" }.

Allowed operations: ${OPERATION_TYPES.join(', ')}.
Allowed element types: ${ELEMENT_TYPES.join(', ')}.
Allowed icon names (use ONLY these, from "lucide"): ${ALLOWED_ICONS.lucide.join(', ')}.
Blend modes: ${BLEND_MODES.join(', ')}. Stroke styles: ${STROKE_STYLES.join(', ')}.

Every element may carry: x, y, width, height, rotation, opacity (0-1), zIndex, blendMode,
layerBlur (0-40), shadow ({x,y,blur,color} or null), flipH, flipV, lockAspect, locked, hidden, name.

Type-specific "properties":
- text / button: text, fontFamily, fontSize, fontWeight (100-900), color, align (left|center|right),
  lineHeight, letterSpacing, italic, underline, textCase (none|uppercase|lowercase|capitalize).
  button also: background, borderRadius, borderColor, borderWidth, strokeStyle.
- rectangle / circle / polygon / star: fill, fillOpacity (0-1), borderColor, borderWidth, strokeStyle.
  rectangle also: borderRadius and "gradient" —
  { "type":"linear"|"radial", "angle":0-360 (0 = up, 90 = right), "stops":[{"color":"#RRGGBBAA","offset":0-100}] }.
  Use a gradient for scrims over photography and for depth in flat colour fields; a gradient
  overrides fill. polygon has "sides" (3-24). star has "points" (3-24) and "depth" (0.05-0.95).
- line: stroke, strokeWidth, strokeStyle.
- icon: name (from the list), library "lucide", size, color, strokeWidth.
- image: never invent a URL — set "query":"a described photograph" and Apollo sources it. Other
  properties: fit (cover|contain|fill), borderRadius, focalX/focalY (0-100), zoom (1-4),
  brightness/contrast/saturation (0-200, 100 = neutral), hue (-180..180), grayscale (0-100),
  blur (0-20). Signed adjustments (-100..100): ${SIGNED_ADJUST_KEYS.join(', ')}.
  Unsigned (0..100): ${UNSIGNED_ADJUST_KEYS.join(', ')}.

Operation shapes:
- CREATE_ELEMENT: { "type":"CREATE_ELEMENT", "element": { "type":"...", "x":n, "y":n, "width":n,
  "height":n, "zIndex":n, "properties":{...} } }
- UPDATE_ELEMENT / SET_STYLE / SET_CONTENT: { "type":"UPDATE_ELEMENT", "targetId":"<id>",
  "changes": { ...flattened element or property fields } }
- MOVE_ELEMENT / RESIZE_ELEMENT: { "type":"...", "targetId":"<id>", "changes": {...} }
- DELETE_ELEMENT / DUPLICATE_ELEMENT: { "type":"...", "targetId":"<id>" }
- REORDER_ELEMENT: { "type":"REORDER_ELEMENT", "targetId":"<id>", "direction":"front|back|forward|backward" }
- GROUP_ELEMENTS: { "type":"GROUP_ELEMENTS", "targetIds":["<id>","<id>"] }
- UNGROUP_ELEMENTS / SET_CANVAS: { "type":"UNGROUP_ELEMENTS", "targetId":"<id>" } /
  { "type":"SET_CANVAS", "changes": { "background":"#hex", "width":n, "height":n } }

Rules:
- Make the SMALLEST change that satisfies the request. Edit existing layers by targetId; never
  rebuild the design for a small ask.
- Keep the existing design's grid: match the x positions, margins and spacing already in use, and
  keep new elements aligned to the same axes. Read the current elements before choosing numbers.
- Preserve the design's palette and type pairing unless asked to change them. Do not introduce a
  new font or a new hue casually.
- Keep text inside its frame: roughly, a line holds width / (fontSize × 0.55) characters. If you
  enlarge type, widen or re-wrap its box too.
- Maintain contrast: light text on dark grounds, dark on light. Never place mid-grey on mid-grey.
- When asked to restyle, rearrange or apply an effect, actually change the relevant properties
  (shape, blendMode, shadow, gradient, adjustments) — do not just change a colour.
- Respond with valid JSON only.`;
}

function buildEditPrompt({ message, document, selectedElementId }) {
  const summary = {
    canvas: document?.canvas,
    elements: (document?.elements || []).map((e) => ({
      id: e.id,
      type: e.type,
      name: e.name,
      x: e.x, y: e.y, width: e.width, height: e.height,
      rotation: e.rotation, zIndex: e.zIndex, opacity: e.opacity,
      blendMode: e.blendMode, shadow: e.shadow, parentId: e.parentId,
      properties: e.properties,
    })),
    selectedElementId: selectedElementId || null,
  };
  return `Current design document:\n${JSON.stringify(summary)}\n\nUser instruction: ${message}`;
}
