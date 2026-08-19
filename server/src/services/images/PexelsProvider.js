import { ImageProvider } from './ImageProvider.js';
import { statusError } from '../upstream.js';

/**
 * Pexels search. Beyond the URL, the curator needs the fields that let it
 * *judge* a photograph without downloading it — the description it was indexed
 * under, its true dimensions and its average colour — so those are carried
 * through rather than dropped.
 */
export class PexelsProvider extends ImageProvider {
  constructor({ apiKey }) {
    super();
    this.apiKey = apiKey;
  }

  async search(query, { perPage = 12, orientation, signal } = {}) {
    const params = new URLSearchParams({ query, per_page: String(perPage) });
    if (orientation && orientation !== 'any') params.set('orientation', orientation);
    const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: this.apiKey },
      signal,
    });
    if (!res.ok) throw statusError(`Pexels API error ${res.status}`, res.status);
    const data = await res.json();
    return (data.photos || []).map((p, rank) => ({
      id: `pexels_${p.id}`,
      provider: 'pexels',
      rank,
      url: p.src?.large2x || p.src?.large || p.src?.original,
      thumbnail: p.src?.medium || p.src?.small,
      // The smallest crop Pexels offers — used for composition analysis, so it
      // is worth a request even when the full image never gets downloaded.
      tiny: p.src?.tiny || p.src?.small,
      width: p.width,
      height: p.height,
      description: p.alt || '',
      averageColor: p.avg_color || '',
      photographer: p.photographer,
      sourceUrl: p.url,
    }));
  }
}
