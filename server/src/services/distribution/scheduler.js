import fs from 'node:fs/promises';
import path from 'node:path';
import { PlatformAuthError, PlatformReviewRequiredError } from './providers/PlatformProvider.js';

/**
 * The publishing state machine, built around one rule above all others: **never
 * double-post.** Apollo is only online a few hours a day, so a crash, a restart or
 * a closed laptop lid can land in the middle of a publish, and the only safe
 * response to "I don't know if that actually went out" is to check before acting
 * again — never to assume and retry.
 *
 *   draft           an asset is scheduled, not yet attempted
 *   native_scheduled the provider has the file and WILL publish it itself at scheduledFor
 *                    (YouTube, a Facebook Page) — nothing left for Apollo to do but confirm later
 *   queued_local     waiting for Apollo to be online AT scheduledFor to publish it itself
 *                    (Instagram, TikTok — no native scheduling exists for them)
 *   publishing       a publish call is in flight *right now* — if the process dies while a
 *                    publication is in this state, reconciliation treats the outcome as
 *                    genuinely unknown and refuses to guess
 *   published        confirmed live
 *   needs_review     a human has to act: the platform hasn't approved this app/account for
 *                    unattended posting yet, the account needs reconnecting, or an interrupted
 *                    publish could not be confirmed either way
 *   failed           a retryable error (network, a 5xx) — retried with backoff, up to a cap
 *   cancelled        withdrawn before it ran
 *
 * `reconcile()` runs once at startup, before the tick loop ever calls publish() on anything,
 * and asks the platform itself what is true for every publication whose last known state is
 * ambiguous. Only once that has answered does normal due-job processing begin.
 */

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = (attempts) => Math.min(60 * 60_000, 60_000 * 2 ** attempts); // 1 min, 2, 4, 8, 16, capped at 1h
const TOKEN_REFRESH_SKEW_MS = 60_000;
const ANALYTICS_REFRESH_MS = 6 * 60 * 60_000; // a published short is re-checked at most every 6h while Apollo is running
const ANALYTICS_STALE_MS = 3 * 24 * 60 * 60_000; // if Apollo has been off for days, catch up anything older than this immediately

export function createScheduler({ publications, accounts, assets, providers, analytics, storageRoot, log = console }) {
  let ticking = false;

  async function liveAccount(accountId) {
    const account = await accounts.getWithToken(accountId);
    const expiring = account.expiresAt && new Date(account.expiresAt).getTime() <= Date.now() + TOKEN_REFRESH_SKEW_MS;
    if (!expiring) return account;
    if (!account.refreshToken) throw new PlatformAuthError(`The ${account.platform} connection has expired and has no refresh token; it needs reconnecting.`);
    const refreshed = await providers.get(account.platform).refresh({ refreshToken: account.refreshToken });
    await accounts.updateTokens(account.id, refreshed);
    return { ...account, ...refreshed };
  }

  async function readMedia(renderFile) {
    return fs.readFile(path.resolve(storageRoot, renderFile));
  }

  /** Before anything else runs: ask each platform what actually happened to every ambiguous publication. */
  async function reconcile() {
    const all = await publications.list();
    const ambiguous = all.filter((p) => p.status === 'publishing' || (p.status === 'native_scheduled' && p.remoteId));
    for (const pub of ambiguous) {
      try {
        await reconcileOne(pub);
      } catch (err) {
        log.error?.(`[distribution] reconcile failed for ${pub.id}:`, err.message);
      }
    }
    return { checked: ambiguous.length };
  }

  async function reconcileOne(pub) {
    if (pub.status === 'publishing' && !pub.remoteId) {
      // The process died before a remote id ever came back. Whether the upload landed on the
      // platform's side is genuinely unknown from here — retrying blind risks a duplicate post,
      // so this always goes to a human, never back into the automatic queue.
      await publications.update(pub.id, (p) => {
        p.status = 'needs_review';
        p.lastError = 'Apollo was interrupted before confirming whether this publish reached the platform. Check the account manually before retrying.';
      });
      return;
    }
    const account = await liveAccount(pub.accountId);
    const remote = await providers.get(pub.platform).getStatus({ account, remoteId: pub.remoteId });
    await publications.update(pub.id, (p) => {
      if (remote.status === 'published') { p.status = 'published'; p.publishedAt = p.publishedAt || new Date().toISOString(); p.publicUrl = remote.publicUrl || p.publicUrl; }
      else if (remote.status === 'processing') { /* still legitimately in flight on the platform's side; leave as-is */ }
      else if (remote.status === 'failed' || remote.status === 'removed') { p.status = 'failed'; p.lastError = remote.reason || `platform reports ${remote.status}`; }
    });
  }

  /** One publish attempt. Marks `publishing` BEFORE calling out, which is the state reconcile() depends on. */
  async function attemptPublish(id) {
    const pub = await publications.get(id);
    if (!['draft', 'queued_local', 'failed'].includes(pub.status)) return pub;
    const asset = await assets.get(pub.assetId);
    const provider = providers.get(pub.platform);
    const future = pub.scheduledFor && new Date(pub.scheduledFor) > new Date();

    if (future && !provider.capabilities.nativeScheduling) return pub; // not due yet, and this platform can't be told to wait on its own

    await publications.update(id, (p) => { p.status = 'publishing'; p.attempts = (p.attempts || 0) + 1; p.lastAttemptAt = new Date().toISOString(); });
    try {
      const account = await liveAccount(pub.accountId);
      const fileBytes = await readMedia(asset.renderFile);
      const result = await provider.publish({ account, asset, scheduledFor: pub.scheduledFor, fileBytes, mediaPath: asset.renderFile });
      return publications.update(id, (p) => {
        p.status = result.status;
        p.remoteId = result.remoteId;
        p.publicUrl = result.publicUrl;
        p.publishedAt = result.publishedAt;
        p.scheduledFor = result.scheduledFor || p.scheduledFor;
        p.lastError = undefined;
      });
    } catch (err) {
      if (err instanceof PlatformReviewRequiredError) {
        return publications.update(id, (p) => { p.status = 'needs_review'; p.lastError = err.message; });
      }
      if (err instanceof PlatformAuthError) {
        return publications.update(id, (p) => { p.status = 'needs_review'; p.lastError = `Reconnect needed: ${err.message}`; });
      }
      log.error?.(`[distribution] publish failed for ${id}:`, err.message);
      return publications.update(id, (p) => {
        p.status = p.attempts >= MAX_ATTEMPTS ? 'needs_review' : 'failed';
        p.lastError = err.message;
      });
    }
  }

  /** Everything Apollo should do with the time it has online: reconcile already ran; this is the repeating part. */
  async function tick() {
    if (ticking) return { skipped: true };
    ticking = true;
    try {
      const all = await publications.list();
      const now = Date.now();
      const due = all.filter((p) => p.status === 'queued_local' && (!p.scheduledFor || new Date(p.scheduledFor).getTime() <= now));
      const retryable = all.filter((p) => p.status === 'failed' && p.attempts < MAX_ATTEMPTS && now - new Date(p.lastAttemptAt || 0).getTime() >= BACKOFF_MS(p.attempts));
      for (const pub of [...due, ...retryable]) await attemptPublish(pub.id).catch((err) => log.error?.('[distribution] tick publish error:', err.message));

      const published = all.filter((p) => p.status === 'published');
      let refreshed = 0;
      for (const pub of published) {
        const last = pub.lastAnalyticsAt ? new Date(pub.lastAnalyticsAt).getTime() : 0;
        if (now - last < ANALYTICS_REFRESH_MS) continue;
        await refreshAnalytics(pub).then(() => { refreshed += 1; }).catch((err) => log.error?.(`[distribution] analytics refresh failed for ${pub.id}:`, err.message));
      }
      return { attempted: due.length + retryable.length, analyticsRefreshed: refreshed };
    } finally {
      ticking = false;
    }
  }

  /** How stale a publication's last snapshot is, in plain terms — used to decide whether a startup catch-up pass is worth running. */
  function staleness(pub) {
    if (pub.status !== 'published') return 0;
    const last = pub.lastAnalyticsAt ? new Date(pub.lastAnalyticsAt).getTime() : 0;
    return Date.now() - last;
  }

  async function refreshAnalytics(pub) {
    const account = await liveAccount(pub.accountId);
    const snapshot = await providers.get(pub.platform).getAnalytics({ account, remoteId: pub.remoteId });
    await analytics.append(pub.id, snapshot);
    await publications.update(pub.id, (p) => { p.lastAnalyticsAt = snapshot.capturedAt; });
    return snapshot;
  }

  /** Run once at startup after reconcile(): anything stale enough that waiting for the normal tick cadence would leave it out of date for a while. */
  async function catchUpStaleAnalytics() {
    const all = await publications.list();
    const stale = all.filter((p) => staleness(p) >= ANALYTICS_STALE_MS);
    for (const pub of stale) await refreshAnalytics(pub).catch((err) => log.error?.(`[distribution] stale analytics catch-up failed for ${pub.id}:`, err.message));
    return { refreshed: stale.length };
  }

  return { reconcile, tick, attemptPublish, refreshAnalytics, catchUpStaleAnalytics, liveAccount };
}
