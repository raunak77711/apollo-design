import { config } from '../../config/env.js';
import { imageCache } from '../../store/index.js';
import { PexelsProvider } from './PexelsProvider.js';
import { UnsplashProvider } from './UnsplashProvider.js';
import { PlaceholderProvider } from './PlaceholderProvider.js';

let provider = null;
let providerName = 'placeholder';

export function getImageProvider() {
  if (provider) return provider;

  if (config.images.provider === 'pexels' && config.images.pexelsApiKey) {
    provider = new PexelsProvider({ apiKey: config.images.pexelsApiKey });
    providerName = 'pexels';
    console.log('[images] Using PexelsProvider');
  } else if (config.images.provider === 'unsplash' && config.images.unsplashAccessKey) {
    provider = new UnsplashProvider({ accessKey: config.images.unsplashAccessKey });
    providerName = 'unsplash';
    console.log('[images] Using UnsplashProvider');
  } else {
    provider = new PlaceholderProvider();
    providerName = 'placeholder';
    console.log('[images] No image API key set — using keyless PlaceholderProvider');
  }
  return provider;
}

const cacheKey = (query, perPage) => `${providerName}:${query.trim().toLowerCase()}:${perPage}`;

/**
 * Search, checking the persistent cache first. Every search — manual or
 * AI-triggered — is saved, so the same query (or the same industry image
 * request DeepSeek/Mock keeps reaching for) resolves instantly and without
 * burning API quota on repeat.
 */
export async function searchImages(query, { perPage = 12 } = {}) {
  getImageProvider(); // ensures providerName is set
  const key = cacheKey(query, perPage);
  const cached = await imageCache.get(key);
  if (cached) return cached;

  const results = await getImageProvider().search(query, { perPage });
  await imageCache.set(key, { provider: providerName, query, results });
  return results;
}

/** Resolve a single best image URL for a query (used by the AI service). */
export async function resolveImageUrl(query) {
  try {
    const results = await searchImages(query, { perPage: 3 });
    return results[0]?.url || null;
  } catch (err) {
    console.warn(`[images] resolveImageUrl failed for "${query}": ${err.message}`);
    // Fall back to a deterministic placeholder so generation never breaks.
    return `https://picsum.photos/seed/${encodeURIComponent(query || 'apollo')}/1200/1200`;
  }
}
