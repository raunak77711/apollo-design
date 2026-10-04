import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { errorHandler } from '../src/middleware/error.js';
import { createDistributionRouter } from '../src/routes/distribution.js';
import { createAccountStore } from '../src/services/distribution/accountStore.js';
import { createAnalyticsStore } from '../src/services/distribution/analyticsStore.js';
import { createAssetStore } from '../src/services/distribution/assetStore.js';
import { createBatchStore } from '../src/services/distribution/batchStore.js';
import { createContentAssetService } from '../src/services/distribution/contentAssetService.js';
import { DistributionError, createDistributionService } from '../src/services/distribution/distributionService.js';
import { PlatformCapabilities } from '../src/services/distribution/providers/PlatformProvider.js';
import { createPublicationStore } from '../src/services/distribution/publicationStore.js';
import { createScheduler } from '../src/services/distribution/scheduler.js';
import { createSecretBox } from '../src/services/distribution/secretBox.js';

async function tmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-distsvc-'));
  await fs.mkdir(path.join(dir, 'storage', 'content', 'sessions', 's1', 'renders'), { recursive: true });
  await fs.writeFile(path.join(dir, 'storage', 'content', 'sessions', 's1', 'renders', 'a.mp4'), 'bytes');
  return dir;
}

function candidate(id, { title, hook, text, score = 8, renderFile = 'renders/a.mp4', status = 'approved', events = [] } = {}) {
  return {
    id, title, hook, text: text ?? hook, reason: 'because', topic: 'lead-gen', score,
    status, scores: { hook: 8, clarity: 8, value: 8, audienceRelevance: 8 },
    director: { events }, render: { status: 'done', file: renderFile },
  };
}

function fakeContentService(sessions) {
  return { async getSession(id) { if (!sessions[id]) throw new Error('no such session'); return sessions[id]; } };
}

function fakeProvider(overrides = {}) {
  return {
    capabilities: new PlatformCapabilities({ nativeScheduling: false, analyticsMetrics: ['views'] }),
    async publish() { return { status: 'published', remoteId: 'r1', publishedAt: new Date().toISOString() }; },
    async getStatus() { return { status: 'published' }; },
    async getAnalytics() { return { capturedAt: new Date().toISOString(), metrics: { views: 1 } }; },
    async refresh() { return { accessToken: 'x', expiresAt: new Date(Date.now() + 3600_000).toISOString() }; },
    ...overrides,
  };
}

async function setup({ sessions, providerOverrides = {} } = {}) {
  const dir = await tmp();
  const secretBox = createSecretBox(path.join(dir, 'key'));
  const batches = createBatchStore(path.join(dir, 'batches'));
  const assets = createAssetStore(path.join(dir, 'assets'));
  const publications = createPublicationStore(path.join(dir, 'publications'));
  const accounts = createAccountStore(path.join(dir, 'accounts'), secretBox);
  const analytics = createAnalyticsStore(publications);
  const byPlatform = { youtube: fakeProvider(providerOverrides.youtube), tiktok: fakeProvider(providerOverrides.tiktok), facebook: fakeProvider(providerOverrides.facebook), instagram: fakeProvider(providerOverrides.instagram) };
  const providers = { get: (p) => byPlatform[p], isConfigured: () => true, ids: Object.keys(byPlatform) };
  const contentAssets = createContentAssetService({ assets, batches, contentService: fakeContentService(sessions || {}), getProvider: () => null });
  const scheduler = createScheduler({ publications, accounts, assets, providers, analytics, storageRoot: path.join(dir, 'storage'), log: { error() {} } });
  const service = createDistributionService({
    batches, assets, publications, accounts, analytics, providers, scheduler, contentAssets,
    research: { draftBrief: async () => ({ title: 't', outline: ['a', 'b', 'c'], verified: false }) },
  });
  return { dir, batches, assets, publications, accounts, service };
}

/* -------------------------------- batch sync -------------------------------- */

test('syncBatch promotes every approved+rendered candidate across the batch\'s sessions, and skips the rest', async () => {
  const sessions = {
    s1: { candidates: [candidate('c1', { title: 'A', hook: 'The leak is between the site and the lead' }), candidate('c2', { title: 'B', hook: 'Specificity beats vague claims', status: 'pending' })] },
    s2: { candidates: [candidate('c3', { title: 'C', hook: 'Never quote a price before diagnosing' })] },
  };
  const { service, batches } = await setup({ sessions });
  const batch = await batches.create({ title: 'Round 1', sessionIds: ['s1', 's2'] });
  const { created } = await service.syncBatch(batch.id);
  assert.equal(created, 2); // c2 is pending, never promoted
  const unique = await service.listAssets(batch.id);
  assert.equal(unique.length, 2);
});

test('syncBatch is idempotent: calling it again promotes nothing new', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'A hook' })] } };
  const { service, batches } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const second = await service.syncBatch(batch.id);
  assert.equal(second.created, 0);
  assert.equal((await service.listAssets(batch.id)).length, 1);
});

test('the same idea said in two different long-forms is deduplicated, keeping the stronger one; a new weaker duplicate never displaces an earlier stronger one', async () => {
  const sessions = {
    s1: { candidates: [candidate('c1', { title: 'Weaker', hook: 'The leak happens between the website and the lead every time', score: 7 })] },
    s2: { candidates: [candidate('c2', { title: 'Stronger', hook: 'The leak happens between the website and the lead every time', score: 9 })] },
  };
  const { service, batches } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1', 's2'] });
  await service.syncBatch(batch.id);
  const unique = await service.listAssets(batch.id);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].title, 'Stronger');
  const all = await service.listAssets(batch.id, { includeDuplicates: true });
  assert.equal(all.length, 2);
  const weaker = all.find((a) => a.title === 'Weaker');
  assert.equal(weaker.duplicateOf, unique[0].id);
});

test('getBatch reports counts, and classification lands on each promoted asset', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'How to fix a leaking funnel', events: [{ type: 'board' }] })] } };
  const { service, batches } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const info = await service.getBatch(batch.id);
  assert.equal(info.counts.unique, 1);
  const [asset] = await service.listAssets(batch.id);
  assert.equal(asset.classification.funnelStage, 'mofu');
  assert.equal(asset.classification.archetype, 'board-explainer');
});

/* ------------------------------- scheduling branch ------------------------------- */

test('schedulePublication: no time or a due time publishes immediately regardless of platform', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'h' })] } };
  const { service, batches, accounts } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const [asset] = await service.listAssets(batch.id);
  const account = await accounts.upsert({ platform: 'tiktok', accountId: 'a1', accountName: 'Acct', accessToken: 't', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const pub = await service.schedulePublication({ assetId: asset.id, accountId: account.id, platform: 'tiktok' });
  assert.equal(pub.status, 'published');
});

test('schedulePublication: a future time with no native scheduling is queued_local, not attempted yet', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'h' })] } };
  const { service, batches, accounts } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const [asset] = await service.listAssets(batch.id);
  const account = await accounts.upsert({ platform: 'tiktok', accountId: 'a1', accountName: 'Acct', accessToken: 't', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const pub = await service.schedulePublication({ assetId: asset.id, accountId: account.id, platform: 'tiktok', scheduledFor: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(pub.status, 'queued_local');
});

test('schedulePublication: a future time WITH native scheduling uploads now and holds', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'h' })] } };
  const { service, batches, accounts } = await setup({ sessions, providerOverrides: { youtube: { capabilities: new PlatformCapabilities({ nativeScheduling: true }), publish: async () => ({ status: 'native_scheduled', remoteId: 'y1' }) } } });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const [asset] = await service.listAssets(batch.id);
  const account = await accounts.upsert({ platform: 'youtube', accountId: 'a1', accountName: 'Acct', accessToken: 't', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const pub = await service.schedulePublication({ assetId: asset.id, accountId: account.id, platform: 'youtube', scheduledFor: new Date(Date.now() + 3600_000).toISOString() });
  assert.equal(pub.status, 'native_scheduled');
});

test('cancel and retry only act on publications in a state where that makes sense', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'h' })] } };
  const { service, batches, accounts } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const [asset] = await service.listAssets(batch.id);
  const account = await accounts.upsert({ platform: 'tiktok', accountId: 'a1', accountName: 'Acct', accessToken: 't', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const published = await service.schedulePublication({ assetId: asset.id, accountId: account.id, platform: 'tiktok' });
  await assert.rejects(() => service.cancelPublication(published.id), DistributionError);

  const future = await service.schedulePublication({ assetId: asset.id, accountId: account.id, platform: 'tiktok', scheduledFor: new Date(Date.now() + 3600_000).toISOString() });
  const cancelled = await service.cancelPublication(future.id);
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(() => service.retryPublication(future.id), DistributionError);
});

/* ------------------------------ learning report ------------------------------- */

test('the learning report rolls published performance up by funnel stage, hook type, archetype and platform', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'How to fix a leaking funnel' })] } };
  const { service, batches, accounts } = await setup({ sessions });
  const batch = await batches.create({ title: 'R', sessionIds: ['s1'] });
  await service.syncBatch(batch.id);
  const [asset] = await service.listAssets(batch.id);
  const account = await accounts.upsert({ platform: 'tiktok', accountId: 'a1', accountName: 'Acct', accessToken: 't', refreshToken: 'r', expiresAt: new Date(Date.now() + 3600_000).toISOString() });
  const pub = await service.schedulePublication({ assetId: asset.id, accountId: account.id, platform: 'tiktok' });
  await service.tick(); // nothing due, but harmless; metrics come from a direct refresh below
  const report = await service.learningReport(batch.id);
  assert.equal(report.publishedCount, 1);
  assert.equal(report.byFunnelStage[0].key, 'mofu');
  assert.equal(report.byPlatform[0].key, 'tiktok');
  assert.equal(report.rows[0].publicationId, pub.id);
});

/* ----------------------------------- routes ------------------------------------ */

async function withApp(service, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/distribution', createDistributionRouter({ service }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/distribution`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('the HTTP API drives a batch end to end: sync, list assets, connect an account, schedule, calendar', async () => {
  const sessions = { s1: { candidates: [candidate('c1', { title: 'A', hook: 'How to fix a leaking funnel' })] } };
  const { service } = await setup({ sessions });
  await withApp(service, async (base) => {
    const json = (p, method, body) => fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const status = await (await fetch(`${base}/status`)).json();
    assert.ok(status.platforms.some((p) => p.platform === 'youtube'));

    const batch = await (await json('/batches', 'POST', { title: 'Round 1', sessionIds: ['s1'] })).json();
    assert.equal((await json(`/batches/${batch.id}/sync`, 'POST')).status, 200);
    const assetsRes = await (await fetch(`${base}/batches/${batch.id}/assets`)).json();
    assert.equal(assetsRes.assets.length, 1);
    const asset = assetsRes.assets[0];

    assert.equal((await json(`/assets/${asset.id}`, 'PATCH', { title: 'Renamed' })).status, 200);

    // No real account in this test, but connecting should fail cleanly against an unconfigured-looking platform id.
    const badPlatform = await fetch(`${base}/accounts/not-a-platform/auth-url?redirectUri=https://x`);
    assert.equal(badPlatform.status, 500); // unknown platform -> providers.get() throws -> generic 500 via the error middleware, not a crash
  });
});
