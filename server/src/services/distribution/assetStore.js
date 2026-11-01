import { createSessionStore } from '../content/sessionStore.js';

/**
 * A ContentAsset: one approved, rendered short, promoted out of a Content Factory
 * session into the distribution layer where it can be classified, deduplicated
 * against the rest of its batch, scheduled and published. The asset keeps a pointer
 * back to where it came from (`sourceSessionId`, `candidateId`) — never a copy of the
 * transcript or the Director Track, which stay owned by the session.
 */
export function createAssetStore(root) {
  const store = createSessionStore(root);
  return {
    dirFor: store.dirFor,
    create: store.create,
    get: store.get,
    list: store.list,
    update: store.update,
    remove: store.remove,
    async listByBatch(batchId) {
      return (await store.list()).filter((a) => a.batchId === batchId);
    },
  };
}
