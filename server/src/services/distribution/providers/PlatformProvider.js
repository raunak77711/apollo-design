/**
 * One social platform, behind one interface — the same shape as `AIProvider` and
 * `ImageProvider` elsewhere in Apollo: the scheduler, the calendar and the analytics
 * pipeline depend only on this, never on a platform SDK.
 *
 * Every platform claims to be "just upload a video", and every platform is lying in
 * a different way: some let you hand them a future publish time and walk away
 * (YouTube, a Facebook Page); others only ever publish *now*, the instant the call
 * succeeds (TikTok's and Instagram's public content-posting APIs, as documented at
 * the time this was written). `capabilities.nativeScheduling` is how the scheduler
 * tells those apart — it is read, never assumed, and a provider that lies about it
 * would be the only bug that actually causes a double-post.
 *
 * `requiresAppReview` is equally load-bearing: TikTok's Direct Post scope and
 * Instagram/Facebook's public-posting permissions are both gated behind the
 * platform reviewing *your* app, which Apollo cannot do for you and cannot predict
 * the timing of. A provider whose account has not cleared review still connects and
 * still queues content — `publish()` returns `needs_review` instead of guessing.
 */

export const PLATFORM_IDS = ['youtube', 'facebook', 'instagram', 'tiktok'];

/** What a provider is honestly capable of. Every concrete provider overrides this; nothing here is assumed by callers. */
export class PlatformCapabilities {
  constructor({
    nativeScheduling = false,
    requiresAppReview = false,
    mediaTypes = ['video'],
    analyticsMetrics = [],
    maxTitleChars = 2200,
    notes = '',
  } = {}) {
    this.nativeScheduling = nativeScheduling;
    this.requiresAppReview = requiresAppReview;
    this.mediaTypes = mediaTypes;
    this.analyticsMetrics = analyticsMetrics; // the metrics getAnalytics() can actually return non-null
    this.maxTitleChars = maxTitleChars;
    this.notes = notes;
  }
}

export class PlatformAuthError extends Error {
  constructor(message, { needsReconnect = true } = {}) {
    super(message);
    this.name = 'PlatformAuthError';
    this.needsReconnect = needsReconnect;
  }
}

/** The account did not clear the platform's own review/verification for posting — a fact, not a bug. */
export class PlatformReviewRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlatformReviewRequiredError';
  }
}

export class PlatformProvider {
  static id = 'base';

  /** @returns {PlatformCapabilities} */
  get capabilities() {
    throw new Error('capabilities not implemented');
  }

  /** The URL to send a person to for OAuth consent. `state` round-trips through the redirect. */
  authUrl(/* { redirectUri, state } */) {
    throw new Error('authUrl() not implemented');
  }

  /**
   * The redirect's `code` -> one connected account, or several when a single login can
   * administer more than one postable account (Facebook: every Page it administers).
   * @returns {Promise<{ accessToken, refreshToken, expiresAt, accountId, accountName, scope }
   *   | Array<{ accessToken, refreshToken, expiresAt, accountId, accountName, scope }>>}
   */
  async exchangeCode(/* { code, redirectUri } */) {
    throw new Error('exchangeCode() not implemented');
  }

  /** @returns {Promise<{ accessToken, refreshToken?, expiresAt }>} */
  async refresh(/* { refreshToken } */) {
    throw new Error('refresh() not implemented');
  }

  /**
   * Publish one rendered short.
   *
   * If `scheduledFor` is in the future and `capabilities.nativeScheduling` is true,
   * the platform is asked to hold and publish it itself: resolves `{ status:
   * 'native_scheduled', remoteId, scheduledFor }`. Otherwise this call publishes
   * *now* — the scheduler is responsible for not calling it before `scheduledFor`
   * on a platform with no native scheduling.
   *
   * @returns {Promise<{ status: 'published'|'native_scheduled'|'needs_review', remoteId?, publicUrl?, publishedAt? }>}
   */
  async publish(/* { account, asset, scheduledFor } */) {
    throw new Error('publish() not implemented');
  }

  /** Re-check a remote post after the fact — this is what reconciliation calls before ever retrying a publish. */
  async getStatus(/* { account, remoteId } */) {
    throw new Error('getStatus() not implemented');
  }

  /**
   * @returns {Promise<{ capturedAt: string, metrics: Record<string, number|null> }>}
   * Every key in `capabilities.analyticsMetrics` is present; a metric the API does not
   * return for this post is `null`, never estimated or carried over from last time.
   */
  async getAnalytics(/* { account, remoteId } */) {
    throw new Error('getAnalytics() not implemented');
  }
}
