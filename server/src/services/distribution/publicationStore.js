import { createSessionStore } from '../content/sessionStore.js';

/** A Publication: one attempt to post one ContentAsset to one connected account. See scheduler.js for the state machine. */
export function createPublicationStore(root) {
  const store = createSessionStore(root);
  return {
    writeJson: store.writeJson,
    readJson: store.readJson,
    async create({ assetId, accountId, platform, scheduledFor }) {
      return store.create({ assetId, accountId, platform, scheduledFor: scheduledFor || null, status: 'draft', attempts: 0 });
    },
    get: store.get,
    list: store.list,
    update: store.update,
    remove: store.remove,
    async listByAsset(assetId) {
      return (await store.list()).filter((p) => p.assetId === assetId);
    },
  };
}
