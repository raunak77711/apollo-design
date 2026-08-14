import mongoose from 'mongoose';

/**
 * Caches stock-photo search results by normalized query so repeat searches
 * (and repeat AI image requests for the same kind of photo) are instant and
 * don't re-hit Pexels/Unsplash. Entries expire after two weeks — results are
 * time-shifted enough by then to feel stale, and the TTL index cleans up
 * without any manual maintenance.
 */
const imageSearchCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // `${provider}:${normalized query}`
  provider: { type: String, required: true },
  query: { type: String, required: true },
  results: { type: mongoose.Schema.Types.Mixed, default: [] },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
});

export const ImageSearchCache = mongoose.model('ImageSearchCache', imageSearchCacheSchema);
