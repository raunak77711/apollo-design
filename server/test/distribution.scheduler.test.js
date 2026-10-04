import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAccountStore } from '../src/services/distribution/accountStore.js';
import { createAnalyticsStore } from '../src/services/distribution/analyticsStore.js';
import { createAssetStore } from '../src/services/distribution/assetStore.js';
import { PlatformAuthError, PlatformCapabilities, PlatformReviewRequiredError } from '../src/services/distribution/providers/PlatformProvider.js';
import { createPublicationStore } from '../src/services/distribution/publicationStore.js';
import { createScheduler } from '../src/services/distribution/scheduler.js';
import { createSecretBox } from '../src/services/distribution/secretBox.js';

async function tmp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-dist-'));
  await fs.mkdir(path.join(dir, 'storage', 'media'), { recursive: true });
  await fs.writeFile(path.join(dir, 'storage', 'media', 'short.mp4'), 'pretend video bytes');
  return dir;
}

/** A fake platform: scripted responses per call, and a log of exactly what was called, for asserting call order/counts. */
function fakeProvider({ nativeScheduling = false, requiresAppReview = false, publishImpl, statusImpl, analyticsImpl, refreshImpl } = {}) {
  const calls = [];
  return {
    calls,
    capabilities: new PlatformCapabilities({ nativeScheduling, requiresAppReview, analyticsMetrics: ['views', 'likes'] }),
    async refresh(args) { calls.push(['refresh', args]); return refreshImpl ? refreshImpl(args) : { accessToken: 'refreshed', expiresAt: new Date(Date.now() + 3600_000).toISOString() }; },
    async publish(args) { calls.push(['publish', args]); return publishImpl(args); },
    async getStatus(args) { calls.push(['getStatus', args]); return statusImpl ? statusImpl(args) : { status: 'published' }; },
    async getAnalytics(args) { calls.push(['getAnalytics', args]); return analyticsImpl ? analyticsImpl(args) : { capturedAt: new Date().toISOString(), metrics: { views: 10, likes: 1 } }; },
  };
}

function registry(providersByPlatform) {
  return { get: (platform) => providersByPlatform[platform], isConfigured: () => true, ids: Object.keys(providersByPlatform) };
}

async function setup({ providers, storageRoot } = {}) {
  const dir = storageRoot || (await tmp());
  const secretBox = createSecretBox(path.join(dir, 'secret.key'));
  const accounts = createAccountStore(path.join(dir, 'accounts'), secretBox);
  const assets = createAssetStore(path.join(dir, 'assets'));
  const publications = createPublicationStore(path.join(dir, 'publications'));
  const analytics = createAnalyticsStore(publications);
  const account = await accounts.upsert({ platform: 'youtube', accountId: 'c1', accountName: 'Channel', accessToken: 'tok', refreshToken: 'ref', expiresAt: new Date(Date.now() + 3600_000).toISOString(), scope: 'x' });
  const asset = await assets.create({ batchId: 'b1', sourceSessionId: 's1', candidateId: 'c1', title: 'A short', description: '', renderFile: 'media/short.mp4' });
  const scheduler = createScheduler({ publications, accounts, assets, providers: registry(providers), analytics, storageRoot: path.join(dir, 'storage'), log: { error() {}, warn() {} } });
  return { dir, accounts, assets, publications, analytics, account, asset, scheduler };
}

/* ------------------------------- publish now ------------------------------- */

test('publishing with no scheduled time calls the provider immediately and lands in "published"', async () => {
  const youtube = fakeProvider({ publishImpl: () => ({ status: 'published', remoteId: 'v1', publishedAt: new Date().toISOString(), publicUrl: 'https://youtube.com/watch?v=v1' }) });
  const { publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube', scheduledFor: null });
  const result = await scheduler.attemptPublish(pub.id);
  assert.equal(result.status, 'published');
  assert.equal(result.remoteId, 'v1');
  // The job was marked "publishing" before the provider call, which is the state reconcile() depends on.
  assert.deepEqual(youtube.calls.map((c) => c[0]), ['publish']);
});

/* ----------------------------- native scheduling ---------------------------- */

test('a future time on a platform with native scheduling uploads now and the platform holds it', async () => {
  const youtube = fakeProvider({ nativeScheduling: true, publishImpl: ({ scheduledFor }) => ({ status: 'native_scheduled', remoteId: 'v2', scheduledFor }) });
  const { publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  const future = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube', scheduledFor: future });
  const result = await scheduler.attemptPublish(pub.id);
  assert.equal(result.status, 'native_scheduled');
  assert.equal(result.remoteId, 'v2');
});

test('a future time on a platform with NO native scheduling is a no-op until it is actually due', async () => {
  const tiktok = fakeProvider({ nativeScheduling: false, publishImpl: () => ({ status: 'published', remoteId: 'tt1' }) });
  const { publications, account, asset, scheduler } = await setup({ providers: { tiktok } });
  const future = new Date(Date.now() + 3600_000).toISOString();
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'tiktok', scheduledFor: future });
  await publications.update(pub.id, (p) => { p.status = 'queued_local'; });
  const result = await scheduler.attemptPublish(pub.id);
  assert.equal(result.status, 'queued_local'); // untouched: attemptPublish only acts on draft/queued_local/failed AND due-or-native
  assert.equal(tiktok.calls.length, 0);
});

test('tick() picks up a queued-local job once it is due, but not before', async () => {
  const tiktok = fakeProvider({ nativeScheduling: false, publishImpl: () => ({ status: 'published', remoteId: 'tt2', publishedAt: new Date().toISOString() }) });
  const { publications, account, asset, scheduler } = await setup({ providers: { tiktok } });
  const soon = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'tiktok', scheduledFor: new Date(Date.now() - 1000).toISOString() });
  await publications.update(soon.id, (p) => { p.status = 'queued_local'; });
  const later = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'tiktok', scheduledFor: new Date(Date.now() + 3600_000).toISOString() });
  await publications.update(later.id, (p) => { p.status = 'queued_local'; });

  const result = await scheduler.tick();
  assert.equal(result.attempted, 1);
  assert.equal((await publications.get(soon.id)).status, 'published');
  assert.equal((await publications.get(later.id)).status, 'queued_local');
});

/* --------------------------------- failures --------------------------------- */

test('a review-required or auth error never retries automatically; it goes to needs_review with a human-readable reason', async () => {
  const tiktok = fakeProvider({ publishImpl: () => { throw new PlatformReviewRequiredError("TikTok hasn't approved Direct Post for this app yet"); } });
  const { publications, account, asset, scheduler } = await setup({ providers: { tiktok } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'tiktok' });
  const result = await scheduler.attemptPublish(pub.id);
  assert.equal(result.status, 'needs_review');
  assert.match(result.lastError, /Direct Post/);

  const youtube2 = fakeProvider({ publishImpl: () => { throw new PlatformAuthError('token revoked'); } });
  const s2 = await setup({ providers: { youtube: youtube2 } });
  const pub2 = await s2.publications.create({ assetId: s2.asset.id, accountId: s2.account.id, platform: 'youtube' });
  const r2 = await s2.scheduler.attemptPublish(pub2.id);
  assert.equal(r2.status, 'needs_review');
  assert.match(r2.lastError, /Reconnect/);
});

test('a transient error is retried with backoff up to a cap, then needs a human', async () => {
  let n = 0;
  const youtube = fakeProvider({ publishImpl: () => { n += 1; throw new Error('503 from YouTube'); } });
  const { publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  for (let i = 0; i < 5; i += 1) await scheduler.attemptPublish((await publications.update(pub.id, (p) => { p.status = 'failed'; p.lastAttemptAt = new Date(0).toISOString(); })).id);
  const final = await publications.get(pub.id);
  assert.equal(n, 5);
  assert.equal(final.status, 'needs_review');
  assert.equal(final.attempts, 5);
});

/* ------------------------------- reconciliation ------------------------------ */

test('a publication stuck "publishing" with NO remote id is never auto-retried: it needs a human, every time', async () => {
  const youtube = fakeProvider({});
  const { publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  await publications.update(pub.id, (p) => { p.status = 'publishing'; }); // simulates a crash mid-call, before a remoteId ever came back

  await scheduler.reconcile();
  const after = await publications.get(pub.id);
  assert.equal(after.status, 'needs_review');
  assert.match(after.lastError, /interrupted/i);
  assert.equal(youtube.calls.length, 0, 'never guesses by calling publish or getStatus with no remote id to check');

  // And a second reconcile, or a tick, must not somehow publish it either.
  await scheduler.tick();
  assert.equal((await publications.get(pub.id)).status, 'needs_review');
  assert.equal(youtube.calls.length, 0);
});

test('a publication stuck "publishing" WITH a remote id is checked against the real platform state before anything else happens', async () => {
  const youtube = fakeProvider({ statusImpl: () => ({ status: 'published', publicUrl: 'https://youtube.com/watch?v=live1' }) });
  const { publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  await publications.update(pub.id, (p) => { p.status = 'publishing'; p.remoteId = 'live1'; }); // the upload actually succeeded; the crash happened right after

  await scheduler.reconcile();
  const after = await publications.get(pub.id);
  assert.equal(after.status, 'published'); // confirmed live - crucially, publish() was never called again
  assert.deepEqual(youtube.calls.map((c) => c[0]), ['getStatus']);
});

test('reconciling a "publishing" job the platform says actually failed allows a normal retry afterward', async () => {
  const youtube = fakeProvider({
    statusImpl: () => ({ status: 'failed', reason: 'rejected: policy' }),
    publishImpl: () => ({ status: 'published', remoteId: 'v3', publishedAt: new Date().toISOString() }),
  });
  const { publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  await publications.update(pub.id, (p) => { p.status = 'publishing'; p.remoteId = 'dead1'; });

  await scheduler.reconcile();
  assert.equal((await publications.get(pub.id)).status, 'failed');
  const retried = await scheduler.attemptPublish(pub.id);
  assert.equal(retried.status, 'published');
});

test('a native_scheduled job is reconfirmed on startup rather than assumed — still pending stays pending, already live is recognised', async () => {
  const stillPending = fakeProvider({ statusImpl: () => ({ status: 'processing' }) });
  const s1 = await setup({ providers: { youtube: stillPending } });
  const p1 = await s1.publications.create({ assetId: s1.asset.id, accountId: s1.account.id, platform: 'youtube' });
  await s1.publications.update(p1.id, (p) => { p.status = 'native_scheduled'; p.remoteId = 'future1'; });
  await s1.scheduler.reconcile();
  assert.equal((await s1.publications.get(p1.id)).status, 'native_scheduled');

  const wentLive = fakeProvider({ statusImpl: () => ({ status: 'published', publicUrl: 'https://youtube.com/watch?v=live2' }) });
  const s2 = await setup({ providers: { youtube: wentLive } });
  const p2 = await s2.publications.create({ assetId: s2.asset.id, accountId: s2.account.id, platform: 'youtube' });
  await s2.publications.update(p2.id, (p) => { p.status = 'native_scheduled'; p.remoteId = 'live2'; });
  await s2.scheduler.reconcile();
  assert.equal((await s2.publications.get(p2.id)).status, 'published');
});

test('reconcile runs before tick ever touches a due local-queue job, and a prior "publishing" job never gets double-published', async () => {
  const tiktok = fakeProvider({
    statusImpl: () => ({ status: 'published' }),
    publishImpl: () => ({ status: 'published', remoteId: 'new1', publishedAt: new Date().toISOString() }),
  });
  const { publications, account, asset, scheduler } = await setup({ providers: { tiktok } });
  const stuck = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'tiktok' });
  await publications.update(stuck.id, (p) => { p.status = 'publishing'; p.remoteId = 'already-live'; });
  const due = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'tiktok', scheduledFor: new Date(Date.now() - 1000).toISOString() });
  await publications.update(due.id, (p) => { p.status = 'queued_local'; });

  await scheduler.reconcile();
  await scheduler.tick();

  assert.equal((await publications.get(stuck.id)).status, 'published');
  assert.equal((await publications.get(due.id)).status, 'published');
  const publishCalls = tiktok.calls.filter((c) => c[0] === 'publish');
  assert.equal(publishCalls.length, 1, 'the already-live job was never published again — only the genuinely new one was');
});

/* --------------------------------- analytics --------------------------------- */

test('analytics are appended as a time series, refreshed on a cadence, and a missing metric stays null rather than being invented', async () => {
  let call = 0;
  const youtube = fakeProvider({ analyticsImpl: () => { call += 1; return { capturedAt: new Date().toISOString(), metrics: { views: call * 10, likes: null } }; } });
  const { publications, analytics, account, asset, scheduler } = await setup({ providers: { youtube } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  await publications.update(pub.id, (p) => { p.status = 'published'; p.remoteId = 'v9'; });

  await scheduler.refreshAnalytics(await publications.get(pub.id));
  const history = await analytics.list(pub.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].metrics.views, 10);
  assert.equal(history[0].metrics.likes, null);

  // tick() does not refresh again immediately - it is not due yet.
  await scheduler.tick();
  assert.equal((await analytics.list(pub.id)).length, 1);

  // but a stale one (older than the catch-up threshold) is refreshed by catchUpStaleAnalytics() regardless.
  await publications.update(pub.id, (p) => { p.lastAnalyticsAt = new Date(0).toISOString(); });
  await scheduler.catchUpStaleAnalytics();
  const after = await analytics.list(pub.id);
  assert.equal(after.length, 2);
  assert.equal(after[1].metrics.views, 20);

  const latest = await analytics.latest(pub.id);
  assert.equal(latest.delta.views, 10); // grew by 10 between the two snapshots
});

/* ------------------------------ token refresh ------------------------------- */

test('an expiring token is refreshed before the provider call, and the new token is persisted', async () => {
  const youtube = fakeProvider({
    refreshImpl: () => ({ accessToken: 'new-token', expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
    publishImpl: ({ account }) => { assert.equal(account.accessToken, 'new-token'); return { status: 'published', remoteId: 'v10', publishedAt: new Date().toISOString() }; },
  });
  const { accounts, publications, account, asset, scheduler } = await setup({ providers: { youtube } });
  await accounts.updateTokens(account.id, { expiresAt: new Date(Date.now() - 1000).toISOString() }); // already expired
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  const result = await scheduler.attemptPublish(pub.id);
  assert.equal(result.status, 'published');
  const stored = await accounts.getWithToken(account.id);
  assert.equal(stored.accessToken, 'new-token');
});

test('an account with no refresh token and an expired access token is a clear needs_review, not a crash', async () => {
  const youtube = fakeProvider({});
  const dir = await tmp();
  const secretBox = createSecretBox(path.join(dir, 'secret.key'));
  const accounts = createAccountStore(path.join(dir, 'accounts'), secretBox);
  const assets = createAssetStore(path.join(dir, 'assets'));
  const publications = createPublicationStore(path.join(dir, 'publications'));
  const analytics = createAnalyticsStore(publications);
  const account = await accounts.upsert({ platform: 'youtube', accountId: 'c2', accountName: 'Channel', accessToken: 'tok', refreshToken: null, expiresAt: new Date(Date.now() - 1000).toISOString(), scope: 'x' });
  const asset = await assets.create({ batchId: 'b1', sourceSessionId: 's1', candidateId: 'c1', title: 'A short', renderFile: 'media/short.mp4' });
  const scheduler = createScheduler({ publications, accounts, assets, providers: registry({ youtube }), analytics, storageRoot: path.join(dir, 'storage'), log: { error() {} } });
  const pub = await publications.create({ assetId: asset.id, accountId: account.id, platform: 'youtube' });
  const result = await scheduler.attemptPublish(pub.id);
  assert.equal(result.status, 'needs_review');
});
