/**
 * Abstract image provider. Concrete providers normalize their results into the
 * Apollo image shape so the editor never depends on Pexels/Unsplash directly.
 *
 * Normalized result:
 * { id, provider, url, thumbnail, width, height, photographer, sourceUrl }
 */
export class ImageProvider {
  async search(/* query, { perPage } */) {
    throw new Error('search() not implemented');
  }
}
