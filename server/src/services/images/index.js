import { config } from '../../config/env.js';
import { imageCache } from '../../store/index.js';
import { PexelsProvider } from './PexelsProvider.js';
import { UnsplashProvider } from './UnsplashProvider.js';
import { PlaceholderProvider } from './PlaceholderProvider.js';

/**
 * Image sourcing.
 *
 * Both stock libraries are used together rather than one being picked at
 * startup: they index very different photography, and giving the curator two
 * pools to choose from is the cheapest available upgrade to the quality of
 * what lands on the canvas. `IMAGE_PROVIDER` still decides which library leads
 * when results are otherwise equal.
 */

let providers = null;

export function getImageProviders() {
  if (providers) return providers;

  const built = [];
  if (config.images.pexelsApiKey) built.push({ name: 'pexels', provider: new PexelsProvider({ apiKey: config.images.pexelsApiKey }) });
  if (config.images.unsplashAccessKey) built.push({ name: 'unsplash', provider: new UnsplashProvider({ accessKey: config.images.unsplashAccessKey }) });

  if (!built.length) {
    built.push({ name: 'placeholder', provider: new PlaceholderProvider() });
    console.log('[images] No image API key set — using keyless PlaceholderProvider');
  } else {
    // The configured preference leads; the other library still contributes.
    built.sort((a, b) => (a.name === config.images.provider ? -1 : b.name === config.images.provider ? 1 : 0));
    console.log(`[images] Using ${built.map((p) => p.name).join(' + ')}`);
  }

  providers = built;
  return providers;
}

/** Back-compat single provider accessor (the lead library). */
export function getImageProvider() {
  return getImageProviders()[0].provider;
}

const cacheKey = (query, perPage, orientation) =>
  `${getImageProviders().map((p) => p.name).join('+')}:${query.trim().toLowerCase()}:${perPage}:${orientation || 'any'}`;

/**
 * Search every configured library in parallel, interleaved so neither one
 * dominates the top of the list. Cached — manual browsing and AI generation
 * share the same cache, so repeat queries cost no quota.
 */
export async function searchImages(query, { perPage = 12, orientation } = {}) {
  const key = cacheKey(query, perPage, orientation);
  const cached = await imageCache.get(key);
  if (cached?.length) return cached;

  const active = getImageProviders();
  const settled = await Promise.allSettled(
    active.map(({ provider }) => provider.search(query, { perPage, orientation }))
  );

  const lists = settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`[images] ${active[i].name} search failed for "${query}": ${result.reason?.message}`);
    return [];
  });

  const results = interleave(lists).slice(0, perPage * active.length);
  if (results.length) await imageCache.set(key, { provider: active.map((p) => p.name).join('+'), query, results });
  return results;
}

/** Round-robin merge, so results alternate between libraries. */
function interleave(lists) {
  const out = [];
  const seen = new Set();
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth; i += 1) {
    for (const list of lists) {
      const item = list[i];
      if (!item || !item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out;
}

/**
 * Resolve a single image URL for a query. Kept for the AI edit path ("replace
 * the hero photo"); full generation goes through the curator instead, which
 * chooses on composition rather than on rank.
 */
export async function resolveImageUrl(query) {
  try {
    const results = await searchImages(query, { perPage: 6 });
    return results[0]?.url || null;
  } catch (err) {
    console.warn(`[images] resolveImageUrl failed for "${query}": ${err.message}`);
    return `https://picsum.photos/seed/${encodeURIComponent(query || 'apollo')}/1200/1200`;
  }
}
