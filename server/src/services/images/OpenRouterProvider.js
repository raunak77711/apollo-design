import { config } from '../../config/env.js';
import { fetchWithTimeout, statusError } from '../upstream.js';
import { buildScribblePrompt } from './GeminiProvider.js';

/** Bespoke art is worth waiting a little longer for than a caption call, but not forever. */
const CALL_TIMEOUT_MS = 30_000;

/**
 * OpenRouter — two jobs:
 *
 * 1. `generateImage` — the unified image API. Bespoke background art for
 *    scribble-originated designs, and for chat edits that ask for new
 *    imagery rather than a stock photo ("make the background a starry
 *    night"). Text-to-image only: no reference image to condition on.
 *
 * 2. `readScribble` — a chat/completions vision call, used as the fallback
 *    scribble reader when Gemini is unconfigured or rejects the call. Gemini's
 *    free tier is 20 requests/day and exhausts almost immediately in
 *    practice, at which point every scribble reading silently degrades to
 *    geometry-only (real layout, but no idea *what* was drawn) — this is what
 *    keeps "I drew a boat" from turning into a generic, unrelated image.
 *    Same request shape `design/scribble.js` already expects, via the exact
 *    prompt Gemini uses.
 *
 * Both optional and a silent no-op without a key.
 */
export class OpenRouterProvider {
  constructor({ apiKey, baseUrl, imageModel, imageEditModel, visionModel }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.imageModel = imageModel;
    // Distinct from `imageModel`: the text-to-image route (FLUX) cannot take
    // a reference image at all, so honouring a drawing needs a second model.
    this.imageEditModel = imageEditModel;
    this.visionModel = visionModel;
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  /**
   * Generate one image sized for `width`×`height`. Returns { buffer, mimeType }
   * or null if the model returned nothing (safety block, empty response).
   */
  async generateImage({ prompt, width, height, negativePrompt } = {}) {
    if (!this.configured) return null;

    const instruction = [
      prompt,
      'Photographic or graphic image only. Absolutely no rendered text, words, letters, numbers, watermarks or captions anywhere in the image — if the subject implies text (a sign, a label, a book cover), leave that area blank or abstract instead.',
      negativePrompt ? `Avoid: ${negativePrompt}.` : '',
    ].filter(Boolean).join(' ');

    const res = await fetchWithTimeout(`${this.baseUrl}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.imageModel,
        prompt: instruction,
        aspect_ratio: aspectRatioFor(width, height),
        output_format: 'png',
        n: 1,
      }),
      timeoutMs: CALL_TIMEOUT_MS,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw statusError(`OpenRouter API error ${res.status}: ${detail.slice(0, 300)}`, res.status);
    }

    const data = await res.json();
    const image = data?.data?.[0];
    if (!image?.b64_json) return null;
    return {
      buffer: Buffer.from(image.b64_json, 'base64'),
      mimeType: image.media_type || 'image/png',
    };
  }

  /**
   * Generate one image *from a reference image* — the drawing goes in, a
   * finished picture of that same drawing comes out.
   *
   * A separate method rather than an option on `generateImage` because it is
   * a different endpoint and a different model: the `/images` route above is
   * FLUX, which takes a prompt and nothing else, so a sketch cannot reach it.
   * Image-editing models are reached through chat/completions instead, asking
   * for an image modality back and attaching the reference as an ordinary
   * image part — the same request shape `readScribble` below already uses.
   *
   * This is what routes around Gemini's own quota: the same nano-banana model
   * is available on the OpenRouter key, so a project whose Google image quota
   * is exhausted still gets its drawing honoured.
   *
   * Returns { buffer, mimeType }, or null if the model replied with text but
   * no picture (a safety block, or a model that ignored the modality).
   */
  async generateImageFromReference({ prompt, referenceImages = [], negativePrompt } = {}) {
    if (!this.configured) return null;
    const references = referenceImages.filter((url) => typeof url === 'string' && url.startsWith('data:image/'));
    if (!references.length) return null;

    const instruction = [
      prompt,
      'Output an image only. Absolutely no rendered text, words, letters, numbers, watermarks or captions anywhere in the image.',
      negativePrompt ? `Avoid: ${negativePrompt}.` : '',
    ].filter(Boolean).join(' ');

    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.imageEditModel,
        modalities: ['image', 'text'],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: instruction },
              // Three at most: the reference budget these models actually honour.
              ...references.slice(0, 3).map((url) => ({ type: 'image_url', image_url: { url } })),
            ],
          },
        ],
      }),
      timeoutMs: CALL_TIMEOUT_MS,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw statusError(`OpenRouter API error ${res.status}: ${detail.slice(0, 300)}`, res.status);
    }

    const data = await res.json();
    const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const match = typeof url === 'string' && url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!match) return null;
    return { buffer: Buffer.from(match[2], 'base64'), mimeType: match[1] };
  }

  /**
   * Read a rough drawing as a layout brief — same contract as
   * `GeminiProvider.readScribble`: located regions, or null. Returns a raw
   * object for `normalizeScribble` to sanitise; every box is checked against
   * the measured ink before anything acts on it, same as the Gemini path.
   */
  async readScribble(dataUrl, { prompt = '', timeoutMs } = {}) {
    if (!this.configured) return null;

    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: buildScribblePrompt(prompt) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      timeoutMs: timeoutMs || CALL_TIMEOUT_MS,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw statusError(`OpenRouter API error ${res.status}: ${detail.slice(0, 300)}`, res.status);
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

/**
 * The nearest aspect-ratio label OpenRouter's FLUX.2 route accepts. This is
 * the provider's own accepted set (confirmed live — it rejected "9:21" with
 * the full list in its error), not the API's general documentation: it is
 * asymmetric, with a wide extreme (21:9) but no tall equivalent, so anything
 * taller than 9:16 still rounds to 9:16 rather than being rejected.
 */
function aspectRatioFor(width, height) {
  if (!width || !height) return '1:1';
  const ratio = width / height;
  const known = [
    ['21:9', 21 / 9], ['16:9', 16 / 9], ['3:2', 3 / 2], ['4:3', 4 / 3],
    ['1:1', 1], ['3:4', 3 / 4], ['2:3', 2 / 3], ['9:16', 9 / 16],
  ];
  let best = known[4];
  let bestDelta = Infinity;
  for (const entry of known) {
    const delta = Math.abs(Math.log(ratio / entry[1]));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = entry;
    }
  }
  return best[0];
}

let instance = null;

export function getOpenRouterProvider() {
  if (instance) return instance;
  instance = new OpenRouterProvider(config.openrouter);
  return instance;
}
