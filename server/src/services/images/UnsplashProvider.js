import { ImageProvider } from './ImageProvider.js';
import { statusError } from '../upstream.js';

/**
 * Unsplash search. `likes` is kept as a weak quality prior and the indexed
 * description as the relevance signal; both feed the curator's ranking.
 */
export class UnsplashProvider extends ImageProvider {
  constructor({ accessKey }) {
    super();
    this.accessKey = accessKey;
  }

  async search(query, { perPage = 12, orientation, signal } = {}) {
    const params = new URLSearchParams({ query, per_page: String(perPage) });
    if (orientation && orientation !== 'any') params.set('orientation', orientation === 'portrait' ? 'portrait' : orientation === 'square' ? 'squarish' : 'landscape');
    const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${this.accessKey}` },
      signal,
    });
    if (!res.ok) throw statusError(`Unsplash API error ${res.status}`, res.status);
    const data = await res.json();
    return (data.results || []).map((p, rank) => ({
      id: `unsplash_${p.id}`,
      provider: 'unsplash',
      rank,
      url: p.urls?.regular || p.urls?.full,
      thumbnail: p.urls?.small || p.urls?.thumb,
      tiny: p.urls?.thumb || p.urls?.small,
      width: p.width,
      height: p.height,
      description: p.alt_description || p.description || '',
      averageColor: p.color || '',
      likes: p.likes || 0,
      photographer: p.user?.name,
      sourceUrl: p.links?.html,
    }));
  }
}
