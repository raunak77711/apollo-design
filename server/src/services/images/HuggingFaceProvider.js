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

  /**
   * Generate one image. Returns { buffer, mimeType }, or null on no result.
   *
   * `width`/`height` are the actual slot the picture has to fill. Without
   * them the model only ever sees a vague "wide/tall/square" hint in the
   * prompt text and defaults to its own (usually square) canvas, so a hero
   * meant for a 1080×1920 story comes back square and gets brutally cropped.
   * Sent as both top-level fields and `image_size`, since which one a given
   * routed provider (fal-ai, replicate, ...) honours varies and an unknown
   * extra field is harmless.
   */
  async generateImage({ prompt, negativePrompt, width, height } = {}) {
    if (!this.configured) return null;
    const { provider, providerId } = await this._resolveRoute();

    const instruction = [
      prompt,
      'No rendered text, words, letters, numbers, watermarks or captions anywhere in the image.',
      negativePrompt ? `Avoid: ${negativePrompt}.` : '',
    ].filter(Boolean).join(' ');

    const size = clampSize(width, height);

    const res = await fetch(`https://router.huggingface.co/${provider}/${providerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        prompt: instruction,
        ...(size ? { width: size.width, height: size.height, image_size: size } : {}),
      }),
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

/**
 * Fit the requested slot to a size FLUX-family models actually accept:
 * both sides multiples of 16, and within a sane cost/quality range, while
 * keeping the slot's aspect ratio so the picture doesn't get cropped later.
 */
function clampSize(width, height) {
  if (!width || !height) return null;
  const MIN_SIDE = 512;
  const MAX_SIDE = 1408;
  let w = width;
  let h = height;
  const down = Math.min(1, MAX_SIDE / Math.max(w, h));
  w *= down;
  h *= down;
  const up = Math.max(1, MIN_SIDE / Math.min(w, h));
  w *= up;
  h *= up;
  const round16 = (n) => Math.max(16, Math.round(n / 16) * 16);
  return { width: round16(w), height: round16(h) };
}

let instance = null;

export function getHuggingFaceProvider() {
  if (instance) return instance;
  instance = new HuggingFaceProvider({ apiKey: config.huggingface.apiKey, model: config.huggingface.imageModel });
  return instance;
}
