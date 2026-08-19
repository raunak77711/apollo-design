import { config } from '../../config/env.js';
import { fetchWithTimeout, statusError } from '../upstream.js';

/** Captioning happens before the first stage is even announced — keep it short. */
const CALL_TIMEOUT_MS = 20_000;

/**
 * Gemini ("nano banana") — bespoke image generation and reference-image
 * understanding.
 *
 * Two jobs, both optional and both silent no-ops without a key:
 *
 * 1. `generateImage` — a real photograph or mark, generated rather than
 *    sourced, for the hero/support slots a design brief calls for. Every
 *    prompt explicitly forbids rendered text: words baked into a picture
 *    can't be edited afterwards, and image models spell badly anyway. Text
 *    stays a live layer, always.
 *
 * 2. `describeReference` — when the user attaches a reference photo, this is
 *    how the (text-only) DeepSeek art director gets to "see" it too: Gemini
 *    is asked to caption it in art-direction terms, and that caption is
 *    folded into the brief prompt.
 *
 * 3. `readScribble` — the same trick, but structured. A drawing is a layout
 *    brief, so a caption is not enough: the composer needs to know *where*
 *    each thing was put. This returns located regions, which
 *    `design/scribble.js` turns into a composition. Its geometry is always
 *    checked against the measured ink before anything acts on it.
 */
export class GeminiProvider {
  constructor({ apiKey, baseUrl, imageModel, visionModel }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.imageModel = imageModel;
    this.visionModel = visionModel;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  async _call(model, contents, { generationConfig, timeoutMs } = {}) {
    const res = await fetchWithTimeout(`${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...(generationConfig ? { generationConfig } : {}) }),
      timeoutMs: timeoutMs || CALL_TIMEOUT_MS,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw statusError(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`, res.status);
    }
    return res.json();
  }

  /**
   * Generate one image. `referenceImages` are data URLs used as style/subject
   * context (nano banana accepts image + text input and produces an edited
   * or newly composed image informed by it). Returns { buffer, mimeType } or
   * null if the model returned no image (safety block, empty response, etc).
   */
  async generateImage({ prompt, referenceImages = [], negativePrompt } = {}) {
    if (!this.configured) return null;

    const instruction = [
      prompt,
      'Photographic or graphic image only. Absolutely no rendered text, words, letters, numbers, watermarks or captions anywhere in the image — if the subject implies text (a sign, a label, a book cover), leave that area blank or abstract instead.',
      negativePrompt ? `Avoid: ${negativePrompt}.` : '',
    ].filter(Boolean).join(' ');

    const parts = [{ text: instruction }];
    for (const ref of referenceImages.slice(0, 3)) {
      const inline = dataUrlToInline(ref);
      if (inline) parts.push({ inlineData: inline });
    }

    const data = await this._call(this.imageModel, [{ role: 'user', parts }]);
    const imagePart = data?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data);
    if (!imagePart) return null;
    return {
      buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    };
  }

  /** A short art-direction caption for a reference image, or '' on any failure. */
  async describeReference(dataUrl) {
    if (!this.configured) return '';
    const inline = dataUrlToInline(dataUrl);
    if (!inline) return '';
    try {
      const data = await this._call(this.visionModel, [
        {
          role: 'user',
          parts: [
            {
              text: 'In one or two sentences, describe this reference image for a design brief: the literal subject, the visual style, the dominant colours, and the mood. Plain prose, no markdown.',
            },
            { inlineData: inline },
          ],
        },
      ]);
      const text = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
      return typeof text === 'string' ? text.trim().slice(0, 400) : '';
    } catch (err) {
      console.warn(`[gemini] describeReference failed: ${err.message}`);
      return '';
    }
  }

  /**
   * Read a rough drawing as a layout brief.
   *
   * The prompt asks for located regions rather than a description, because
   * the point of a scribble is *where* things are. Coordinates come back
   * normalised 0-1 so they survive any canvas size, and every box is checked
   * against the measured ink before the pipeline acts on it — see
   * `services/scribbleReader.js`.
   *
   * Returns a raw object for `normalizeScribble` to sanitise, or null.
   */
  async readScribble(dataUrl, { prompt = '', timeoutMs } = {}) {
    if (!this.configured) return null;
    const inline = dataUrlToInline(dataUrl);
    if (!inline) return null;

    const data = await this._call(
      this.visionModel,
      [
        {
          role: 'user',
          parts: [
            { text: buildScribblePrompt(prompt) },
            { inlineData: inline },
          ],
        },
      ],
      { generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }, timeoutMs }
    );

    const raw = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

/* ------------------------------ scribble prompt ---------------------------- */

function buildScribblePrompt(prompt) {
  return `You are looking at a rough sketch a person drew to plan a graphic design. It is deliberately
crude — stick figures, blobs, squiggles standing in for text. Your job is to read their INTENT and
the LAYOUT, not to judge the drawing.

Return ONLY JSON:

{
  "subject": "the main thing depicted, 2-6 words",
  "designType": "poster" | "flyer" | "banner" | "social post" | "menu" | "logo" | "invitation" | "advertisement",
  "mood": ["two", "or three", "adjectives"],
  "reading": "one or two sentences describing the whole composition as a designer would",
  "regions": [
    {
      "role": "subject" | "headline" | "body" | "cta" | "mark" | "frame" | "decoration",
      "label": "what this mark depicts, 1-4 words",
      "words": "any text legibly written here, else empty string",
      "box": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 },
      "weight": 0.0
    }
  ]
}

How to read it:
- "box" is the region's bounding box in fractions of the image: x/y are the TOP-LEFT corner,
  0,0 is the top-left of the canvas and 1,1 the bottom-right. Be accurate — these coordinates
  decide where things end up in the finished design.
- "role": a drawn OBJECT (a moon, a face, a bottle, a mountain) is "subject". Squiggly lines,
  lettering or a written word standing in for wording is "headline" for the largest/most
  prominent one and "body" for smaller ones. A word inside a drawn box or pill is "cta".
  A small emblem in a corner is "mark". A circle or box drawn AROUND other content to point at
  it is "frame". Arrows and stray marks are "decoration".
- "words": transcribe handwriting only when you can genuinely read it. Never guess, never
  invent plausible marketing copy — an empty string is the correct answer for a squiggle.
- "weight": how visually important this is in the sketch, 0 to 1.
- Report at most 10 regions. Merge marks that clearly belong to one object (a face and its
  body are one "subject") rather than listing every stroke.
- If the canvas is essentially blank, return an empty "regions" array.

${prompt ? `The person also described it as: "${String(prompt).slice(0, 400)}". Use that to name what you see, but the POSITIONS must come from the drawing itself.` : 'No description was given — read the drawing alone.'}

Respond with valid JSON only.`;
}

function dataUrlToInline(value) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(String(value || ''));
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

let instance = null;

export function getGeminiProvider() {
  if (instance) return instance;
  instance = new GeminiProvider(config.gemini);
  return instance;
}
