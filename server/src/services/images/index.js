import { config } from '../../config/env.js';
import { PexelsProvider } from './PexelsProvider.js';
import { UnsplashProvider } from './UnsplashProvider.js';
import { PlaceholderProvider } from './PlaceholderProvider.js';

let provider = null;

export function getImageProvider() {
  if (provider) return provider;

  if (config.images.provider === 'pexels' && config.images.pexelsApiKey) {
    provider = new PexelsProvider({ apiKey: config.images.pexelsApiKey });
    console.log('[images] Using PexelsProvider');
  } else if (config.images.provider === 'unsplash' && config.images.unsplashAccessKey) {
    provider = new UnsplashProvider({ accessKey: config.images.unsplashAccessKey });
    console.log('[images] Using UnsplashProvider');
  } else {
    provider = new PlaceholderProvider();
    console.log('[images] No image API key set — using keyless PlaceholderProvider');
  }
  return provider;
}

/** Resolve a single best image URL for a query (used by the AI service). */
export async function resolveImageUrl(query) {
  try {
    const results = await getImageProvider().search(query, { perPage: 3 });
    return results[0]?.url || null;
  } catch (err) {
    console.warn(`[images] resolveImageUrl failed for "${query}": ${err.message}`);
    // Fall back to a deterministic placeholder so generation never breaks.
    return `https://picsum.photos/seed/${encodeURIComponent(query || 'apollo')}/1200/1200`;
  }
}
