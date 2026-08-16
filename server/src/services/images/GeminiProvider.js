import { config } from '../../config/env.js';

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

  async _call(model, contents, { generationConfig } = {}) {
    const res = await fetch(`${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, ...(generationConfig ? { generationConfig } : {}) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
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
