import { config } from '../../config/env.js';

/**
 * Hugging Face — bespoke image generation via the Inference Providers router.
 * Configured model defaults to black-forest-labs/FLUX.1-Krea-dev, routed
 * through whichever backend (fal-ai, replicate, ...) Hugging Face currently
 * has live for it — that mapping is looked up once and cached rather than
 * hardcoded, so pointing HUGGINGFACE_IMAGE_MODEL at a different model just
 * works without a code change.
 *
 * Every prompt explicitly forbids rendered text: words baked into a picture
 * can't be edited afterwards, and image models spell badly anyway. Text
 * stays a live layer, always.
 */
export class HuggingFaceProvider {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
    this._route = null; // { provider, providerId } — resolved lazily, cached
  }

  get configured() {
    return Boolean(this.apiKey && this.model);
  }

  async _resolveRoute() {
    if (this._route) return this._route;
    const res = await fetch(
      `https://huggingface.co/api/models/${this.model}?expand[]=inferenceProviderMapping`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    if (!res.ok) throw new Error(`Hugging Face model lookup failed (${res.status})`);
    const data = await res.json();
    const mapping = data.inferenceProviderMapping || {};
    const [provider, info] = Object.entries(mapping).find(([, v]) => v.status === 'live') || [];
    if (!provider) throw new Error(`No live Hugging Face inference provider for ${this.model}`);
    this._route = { provider, providerId: info.providerId };
    return this._route;
  }

  /** Generate one image. Returns { buffer, mimeType }, or null on no result. */
  async generateImage({ prompt, negativePrompt } = {}) {
    if (!this.configured) return null;
    const { provider, providerId } = await this._resolveRoute();

    const instruction = [
      prompt,
      'No rendered text, words, letters, numbers, watermarks or captions anywhere in the image.',
      negativePrompt ? `Avoid: ${negativePrompt}.` : '',
    ].filter(Boolean).join(' ');

    const res = await fetch(`https://router.huggingface.co/${provider}/${providerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ prompt: instruction }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Hugging Face API error ${res.status}: ${detail.slice(0, 300)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    // Some providers return the image straight in the response body...
    if (contentType.startsWith('image/')) {
      return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: contentType };
    }
    // ...others (fal-ai included) return JSON with a URL to fetch separately.
    const data = await res.json();
    const image = data?.images?.[0] || data?.image;
    if (!image?.url) return null;
    const imgRes = await fetch(image.url);
    if (!imgRes.ok) return null;
    return {
      buffer: Buffer.from(await imgRes.arrayBuffer()),
      mimeType: image.content_type || imgRes.headers.get('content-type') || 'image/jpeg',
    };
  }
}

let instance = null;

export function getHuggingFaceProvider() {
  if (instance) return instance;
  instance = new HuggingFaceProvider({ apiKey: config.huggingface.apiKey, model: config.huggingface.imageModel });
  return instance;
}
