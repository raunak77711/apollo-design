import { ImageProvider } from './ImageProvider.js';

export class PexelsProvider extends ImageProvider {
  constructor({ apiKey }) {
    super();
    this.apiKey = apiKey;
  }

  async search(query, { perPage = 12 } = {}) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;
    const res = await fetch(url, { headers: { Authorization: this.apiKey } });
    if (!res.ok) throw new Error(`Pexels API error ${res.status}`);
    const data = await res.json();
    return (data.photos || []).map((p) => ({
      id: `pexels_${p.id}`,
      provider: 'pexels',
      url: p.src?.large2x || p.src?.large || p.src?.original,
      thumbnail: p.src?.medium || p.src?.small,
      width: p.width,
      height: p.height,
      photographer: p.photographer,
      sourceUrl: p.url,
    }));
  }
}
