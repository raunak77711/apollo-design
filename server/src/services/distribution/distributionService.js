import path from 'node:path';
import { extensionOf, storeUpload } from '../content/uploadVideo.js';
import { PLATFORM_IDS } from './providers/PlatformProvider.js';

/**
 * The distribution layer's public surface: batches, the asset pool, connected
 * accounts, scheduling/publishing and the performance rollup — what `routes/distribution.js`
 * and the UI actually call. Everything that needs to not double-post or not publish
 * before review lives one layer down, in `scheduler.js`; this is orchestration and
 * validation, the same split `contentService.js` keeps for Content Factory itself.
 */

export class DistributionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createDistributionService({
  batches, assets, publications, accounts, analytics, providers, scheduler, contentAssets, research,
  storageRoot, maxUploadBytes = 5 * 1024 ** 3, log = console,
}) {
  function publicAccount(a) {
    return { id: a.id, platform: a.platform, accountId: a.accountId, accountName: a.accountName, connectedAt: a.connectedAt, extra: a.extra };
  }

  return {
    /* --------------------------------- batches -------------------------------- */

    async createBatch({ title, sessionIds }) {
      return batches.create({ title, sessionIds });
    },
    listBatches: () => batches.list(),
    async getBatch(id) {
      const batch = await batches.get(id);
      const all = await contentAssets.listAll(id);
      return { ...batch, counts: { assets: all.length, unique: all.filter((a) => !a.duplicateOf && a.status !== 'archived').length } };
    },
    renameBatch: (id, title) => batches.rename(id, title),
    addSession: (id, sessionId) => batches.addSession(id, sessionId),
    removeSession: (id, sessionId) => batches.removeSession(id, sessionId),
    deleteBatch: (id) => batches.remove(id),

    /** Pull in every newly approved+rendered short across the batch's sessions, and re-run cross-video dedup. */
    async syncBatch(id) {
      return contentAssets.promoteNew(id);
    },

    /* --------------------------------- assets --------------------------------- */

    async listAssets(batchId, { includeDuplicates = false } = {}) {
      return includeDuplicates ? contentAssets.listAll(batchId) : contentAssets.listUnique(batchId);
    },
    async getAsset(id) {
      const asset = await assets.get(id);
      const pubs = await publications.listByAsset(id);
      return { ...asset, publications: pubs };
    },
    async updateAsset(id, patch) {
      return assets.update(id, (a) => {
        if (patch.title !== undefined) a.title = String(patch.title).slice(0, 120);
        if (patch.description !== undefined) a.description = String(patch.description).slice(0, 2000);
        if (patch.tags !== undefined) a.tags = Array.isArray(patch.tags) ? patch.tags.slice(0, 20).map(String) : a.tags;
        if (patch.classification) {
          const { funnelStage, hookType, archetype } = patch.classification;
          a.classification = { ...a.classification, ...(funnelStage ? { funnelStage } : {}), ...(hookType ? { hookType } : {}), ...(archetype ? { archetype } : {}) };
        }
        if (patch.status === 'archived' || patch.status === 'ready') a.status = patch.status;
      });
    },

    /**
     * A video pushed straight into Distribution, bypassing Content Factory and batches entirely:
     * no transcript, no Director Track, no auto-captions, published exactly as uploaded. Useful for
     * something that doesn't need the review/dedup pipeline - just get it out to the connected accounts.
     */
    async uploadAsset({ title, description, body, fileName }) {
      const fallback = path.basename(String(fileName || ''), path.extname(String(fileName || ''))).replace(/[_-]+/g, ' ').trim();
      const name = String(title || '').trim().slice(0, 120) || fallback || 'Untitled upload';
      const ext = extensionOf(fileName);
      const asset = await assets.create({ title: name, description: description ? String(description).slice(0, 2000) : '', batchId: null, kind: 'manual', status: 'processing' });
      try {
        const stored = await storeUpload(body, { dir: assets.dirFor(asset.id), ext, maxBytes: maxUploadBytes });
        const renderFile = path.relative(storageRoot, path.join(assets.dirFor(asset.id), stored.storedName)).split(path.sep).join('/');
        return assets.update(asset.id, (a) => { a.status = 'ready'; a.renderFile = renderFile; a.bytes = stored.bytes; });
      } catch (err) {
        await assets.remove(asset.id).catch(() => {});
        throw err;
      }
    },
    /** Quick uploads live outside any batch; this is how the UI lists them. */
    async listUnassignedAssets() {
      return (await assets.list()).filter((a) => !a.batchId);
    },
    async deleteAsset(id) {
      const asset = await assets.get(id);
      if (asset.batchId) throw new DistributionError(409, 'This asset belongs to a batch; archive it from the batch view instead.');
      return assets.remove(id);
    },

    /* -------------------------------- accounts -------------------------------- */

    platformStatus() {
      return PLATFORM_IDS.map((id) => {
        const provider = providers.get(id);
        return { platform: id, configured: providers.isConfigured(id), capabilities: provider.capabilities, scopes: provider.scopes || [] };
      });
    },
    async listAccounts() {
      return (await accounts.list()).map(publicAccount);
    },
    authUrl(platform, { redirectUri, state }) {
      if (!providers.isConfigured(platform)) throw new DistributionError(503, `${platform} has no developer credentials configured yet (see .env.example).`);
      if (platform === 'instagram') throw new DistributionError(400, 'Connect Facebook first, then link its Instagram account.');
      return providers.get(platform).authUrl({ redirectUri, state });
    },
    /** A login can resolve to more than one connectable account (every Facebook Page it administers); each is upserted. */
    async connectAccount(platform, { code, redirectUri }) {
      const provider = providers.get(platform);
      const result = await provider.exchangeCode({ code, redirectUri });
      const results = Array.isArray(result) ? result : [result];
      const saved = await Promise.all(results.map((r) => accounts.upsert({ platform, ...r, extra: r.raw || {} })));
      return saved.map(publicAccount);
    },
    /** Instagram has no OAuth of its own: it rides on a connected Facebook Page's token. */
    async linkInstagram(facebookAccountId) {
      const fb = await accounts.getWithToken(facebookAccountId);
      if (fb.platform !== 'facebook') throw new DistributionError(400, 'That is not a connected Facebook account.');
      const ig = providers.get('instagram');
      const linked = await ig.findLinkedAccount({ pageId: fb.accountId, accessToken: fb.accessToken });
      const saved = await accounts.upsert({
        platform: 'instagram', accountId: linked.igUserId, accountName: `@${linked.username}`,
        accessToken: fb.accessToken, refreshToken: null, expiresAt: fb.expiresAt, scope: fb.scope,
        extra: { igUserId: linked.igUserId, viaFacebookAccountId: fb.id },
      });
      return publicAccount(saved);
    },
    async disconnectAccount(id) {
      return accounts.remove(id);
    },

    /* ------------------------------- scheduling -------------------------------- */

    /** Queue (or publish immediately, if `scheduledFor` is empty or already due) one asset to one connected account. */
    async schedulePublication({ assetId, accountId, platform, scheduledFor }) {
      const asset = await assets.get(assetId);
      if (!asset || asset.status === 'archived') throw new DistributionError(404, 'That asset is not available to schedule.');
      const account = await accounts.get(accountId);
      if (!account || account.platform !== platform) throw new DistributionError(400, 'That account is not connected for this platform.');
      const provider = providers.get(platform);
      const future = scheduledFor && new Date(scheduledFor) > new Date();

      const pub = await publications.create({ assetId, accountId, platform, scheduledFor });
      if (future && !provider.capabilities.nativeScheduling) {
        return publications.update(pub.id, (p) => { p.status = 'queued_local'; });
      }
      return scheduler.attemptPublish(pub.id);
    },
    async cancelPublication(id) {
      const pub = await publications.get(id);
      if (!['draft', 'queued_local', 'failed', 'needs_review'].includes(pub.status)) {
        throw new DistributionError(409, 'This is already published or in flight and cannot simply be cancelled.');
      }
      return publications.update(id, (p) => { p.status = 'cancelled'; });
    },
    async retryPublication(id) {
      const pub = await publications.get(id);
      if (!['failed', 'needs_review'].includes(pub.status)) throw new DistributionError(409, 'Only a failed or needs-review publication can be retried.');
      return publications.update(id, (p) => { p.status = p.scheduledFor && new Date(p.scheduledFor) > new Date() ? 'queued_local' : 'draft'; p.lastError = undefined; }).then((p) => scheduler.attemptPublish(p.id));
    },

    /** The calendar: every publication in a window, newest-scheduled-first is left to the caller to sort. */
    async listPublications({ batchId, status, from, to } = {}) {
      const all = await publications.list();
      let list = all;
      if (status) list = list.filter((p) => p.status === status);
      if (from) list = list.filter((p) => !p.scheduledFor || new Date(p.scheduledFor) >= new Date(from));
      if (to) list = list.filter((p) => !p.scheduledFor || new Date(p.scheduledFor) <= new Date(to));
      if (batchId) {
        const assetIds = new Set((await contentAssets.listAll(batchId)).map((a) => a.id));
        list = list.filter((p) => assetIds.has(p.assetId));
      }
      return list;
    },

    /* -------------------------------- analytics --------------------------------- */

    async getPublicationAnalytics(id) {
      return { history: await analytics.list(id), latest: await analytics.latest(id) };
    },

    /** Publication -> ContentAsset -> funnel stage / hook type / archetype / source video, rolled up for one batch. */
    async learningReport(batchId) {
      const assetList = await contentAssets.listAll(batchId);
      const byId = new Map(assetList.map((a) => [a.id, a]));
      const pubs = (await publications.list()).filter((p) => byId.has(p.assetId) && p.status === 'published');

      const rows = [];
      for (const pub of pubs) {
        const asset = byId.get(pub.assetId);
        const latest = await analytics.latest(pub.id);
        rows.push({
          publicationId: pub.id, assetId: asset.id, assetTitle: asset.title, sourceSessionId: asset.sourceSessionId,
          platform: pub.platform, funnelStage: asset.classification?.funnelStage, hookType: asset.classification?.hookType,
          archetype: asset.classification?.archetype, concept: asset.conceptId, publishedAt: pub.publishedAt,
          metrics: latest?.metrics || null, capturedAt: latest?.capturedAt || null,
        });
      }

      const groupBy = (key) => {
        const groups = new Map();
        for (const r of rows) {
          const k = r[key] || 'unknown';
          if (!groups.has(k)) groups.set(k, { key: k, count: 0, totals: {} });
          const g = groups.get(k);
          g.count += 1;
          for (const [metric, value] of Object.entries(r.metrics || {})) {
            if (typeof value !== 'number') continue;
            g.totals[metric] = (g.totals[metric] || 0) + value;
          }
        }
        return [...groups.values()].sort((a, b) => (b.totals.views || 0) - (a.totals.views || 0));
      };

      return {
        publishedCount: rows.length,
        byFunnelStage: groupBy('funnelStage'),
        byHookType: groupBy('hookType'),
        byArchetype: groupBy('archetype'),
        byPlatform: groupBy('platform'),
        rows,
      };
    },

    /* --------------------------------- research --------------------------------- */

    draftBrief: (args) => research.draftBrief(args),

    /* ------------------------------- maintenance -------------------------------- */

    async runOnlineCycle() {
      const reconciled = await scheduler.reconcile();
      const stale = await scheduler.catchUpStaleAnalytics();
      const ticked = await scheduler.tick();
      log.info?.('[distribution] online cycle:', { reconciled, stale, ticked });
      return { reconciled, stale, ticked };
    },
    tick: () => scheduler.tick(),
  };
}
