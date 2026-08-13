import { ImageProvider } from './ImageProvider.js';

export class UnsplashProvider extends ImageProvider {
  constructor({ accessKey }) {
    super();
    this.accessKey = accessKey;
  }

  async search(query, { perPage = 12 } = {}) {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${this.accessKey}` } });
    if (!res.ok) throw new Error(`Unsplash API error ${res.status}`);
    const data = await res.json();
    return (data.results || []).map((p) => ({
      id: `unsplash_${p.id}`,
      provider: 'unsplash',
      url: p.urls?.regular || p.urls?.full,
      thumbnail: p.urls?.small || p.urls?.thumb,
      width: p.width,
      height: p.height,
      photographer: p.user?.name,
      sourceUrl: p.links?.html,
    }));
  }
}
