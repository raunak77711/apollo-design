/**
 * Time-series performance snapshots, one append-only list per publication, stored as
 * a side-file next to the publication's own record (`publications.writeJson`) — the
 * same mechanism a Content Factory session uses for its board snapshot and tally.
 *
 * Never overwritten, never averaged down: every refresh adds a row with its own
 * `capturedAt`, so "views over time" is a real history, and a metric the platform
 * didn't return for a given snapshot is `null` in that row rather than silently
 * carrying the previous value forward.
 */
const FILE = 'analytics.json';
const MAX_SNAPSHOTS = 2000; // a snapshot every few hours for a year is ~3,000; trimmed gently, oldest first, well before this matters

export function createAnalyticsStore(publications) {
  return {
    async append(publicationId, snapshot) {
      const current = (await publications.readJson(publicationId, FILE)) || { snapshots: [] };
      current.snapshots.push(snapshot);
      if (current.snapshots.length > MAX_SNAPSHOTS) current.snapshots = current.snapshots.slice(-MAX_SNAPSHOTS);
      await publications.writeJson(publicationId, FILE, current);
      return snapshot;
    },

    async list(publicationId) {
      const current = await publications.readJson(publicationId, FILE);
      return current?.snapshots || [];
    },

    /** The most recent value of each metric, plus how it has changed since the snapshot before it. */
    async latest(publicationId) {
      const snapshots = await this.list(publicationId);
      if (!snapshots.length) return null;
      const last = snapshots[snapshots.length - 1];
      const prev = snapshots[snapshots.length - 2];
      const delta = {};
      if (prev) for (const key of Object.keys(last.metrics)) delta[key] = typeof last.metrics[key] === 'number' && typeof prev.metrics[key] === 'number' ? last.metrics[key] - prev.metrics[key] : null;
      return { ...last, delta: prev ? delta : null };
    },
  };
}
