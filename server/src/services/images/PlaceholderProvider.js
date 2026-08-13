import { ImageProvider } from './ImageProvider.js';

/**
 * Keyless fallback used when no Pexels/Unsplash key is configured. Returns
 * deterministic placeholder photos (picsum.photos) seeded by the query so the
 * image pipeline works out of the box for the MVP demo.
 */
export class PlaceholderProvider extends ImageProvider {
  async search(query, { perPage = 12 } = {}) {
    const base = slug(query) || 'apollo';
    return Array.from({ length: perPage }, (_, i) => {
      const seed = `${base}-${i}`;
      return {
        id: `placeholder_${seed}`,
        provider: 'placeholder',
        url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/1200`,
        thumbnail: `https://picsum.photos/seed/${encodeURIComponent(seed)}/300/300`,
        width: 1200,
        height: 1200,
        photographer: 'Lorem Picsum',
        sourceUrl: 'https://picsum.photos',
      };
    });
  }
}

function slug(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
