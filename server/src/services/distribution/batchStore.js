import { createSessionStore } from '../content/sessionStore.js';

/**
 * A batch: the set of Content Factory sessions (long-form recordings) that belong to
 * one research/topic push — "10 long-form videos" in one round. Cross-video
 * deduplication, funnel-stage planning and the calendar all operate at the batch
 * level, one step up from a single recording.
 */
export function createBatchStore(root) {
  const store = createSessionStore(root);
  return {
    dirFor: store.dirFor,
    async create({ title, sessionIds = [] }) {
      return store.create({ title: String(title || 'Untitled batch').slice(0, 120), sessionIds: [...new Set(sessionIds)] });
    },
    get: store.get,
    list: store.list,
    async addSession(id, sessionId) {
      return store.update(id, (b) => { if (!b.sessionIds.includes(sessionId)) b.sessionIds.push(sessionId); });
    },
    async removeSession(id, sessionId) {
      return store.update(id, (b) => { b.sessionIds = b.sessionIds.filter((s) => s !== sessionId); });
    },
    async rename(id, title) {
      return store.update(id, (b) => { b.title = String(title || '').slice(0, 120) || b.title; });
    },
    remove: store.remove,
  };
}
