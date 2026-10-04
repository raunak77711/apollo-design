import { PlatformAuthError, PlatformCapabilities, PlatformProvider, PlatformReviewRequiredError } from './PlatformProvider.js';

/**
 * Instagram (Reels) via the Graph API, through a Business/Creator account linked to
 * a connected Facebook Page.
 *
 * Two real constraints, stated rather than worked around:
 *
 *   1. No native future-scheduling parameter exists in the public container-publish
 *      API the way it does for YouTube or a Facebook Page. `capabilities.nativeScheduling`
 *      is `false`, so a scheduled Instagram post is a LOCAL_QUEUE job: Apollo must be
 *      online at the scheduled time to run the two-step publish then.
 *   2. Container creation takes `video_url`, a URL Meta's own servers fetch the video
 *      from — it must be reachable from the public internet, not `localhost`. A local
 *      Apollo install needs `PUBLIC_MEDIA_BASE_URL` pointed at something that can serve
 *      the rendered file publicly for the few minutes a publish takes (your own domain,
 *      or a tunnel you run only while publishing). Without it this provider refuses to
 *      publish rather than silently fail against an unreachable URL.
 *
 * Setup: the same Meta app as `FacebookProvider` (Instagram publishing rides on a
 * Facebook Login for Business token), with the `instagram_basic` and
 * `instagram_content_publish` permissions, and a Business/Creator Instagram account
 * connected to the Page the account administers.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

export class InstagramProvider extends PlatformProvider {
  static id = 'instagram';

  constructor({ publicMediaBaseUrl, fetchImpl = fetch } = {}) {
    super();
    this.publicMediaBaseUrl = publicMediaBaseUrl || '';
    this.fetchImpl = fetchImpl;
  }

  get capabilities() {
    return new PlatformCapabilities({
      nativeScheduling: false,
      requiresAppReview: true, // instagram_content_publish on a live app needs Meta App Review for anyone but the app's own testers
      mediaTypes: ['video'],
      analyticsMetrics: ['views', 'likes', 'comments', 'shares', 'reach', 'saved'],
      maxTitleChars: 2200,
      notes: 'No native scheduling: Apollo must be online when a post is due. Also needs a publicly reachable URL for the rendered file (PUBLIC_MEDIA_BASE_URL) and, for anyone but the developer\'s own test accounts, Meta App Review.',
    });
  }

  // Instagram publishing authenticates as a Facebook Login for Business connection; this
  // provider is driven by the Facebook account record (see distribution/accounts.js), not its own OAuth round trip.
  authUrl() {
    throw new Error('Instagram connects through a linked Facebook account, not its own OAuth flow.');
  }

  async #get(path, params, accessToken) {
    const q = new URLSearchParams({ ...params, access_token: accessToken });
    const res = await this.fetchImpl(`${GRAPH}${path}?${q}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor(res, json);
    return json;
  }

  async #post(path, body, accessToken) {
    const res = await this.fetchImpl(`${GRAPH}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, access_token: accessToken }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor(res, json);
    return json;
  }

  /** Resolve the Instagram Business account id linked to a connected Facebook Page. Called once at connect time. */
  async findLinkedAccount({ pageId, accessToken }) {
    const json = await this.#get(`/${pageId}`, { fields: 'instagram_business_account' }, accessToken);
    const igId = json.instagram_business_account?.id;
    if (!igId) throw new PlatformAuthError('This Facebook Page has no linked Instagram Business/Creator account. Link one in Meta Business Suite first.', { needsReconnect: false });
    const profile = await this.#get(`/${igId}`, { fields: 'username' }, accessToken);
    return { igUserId: igId, username: profile.username };
  }

  async publish({ account, asset, mediaPath, fileBytes: _fileBytes }) {
    if (!this.publicMediaBaseUrl) {
      throw new Error('Instagram needs PUBLIC_MEDIA_BASE_URL set to a publicly reachable address before it can publish (Meta fetches the video by URL).');
    }
    const videoUrl = `${this.publicMediaBaseUrl.replace(/\/$/, '')}/${String(mediaPath).replace(/^\/+/, '')}`;
    const created = await this.#post(`/${account.igUserId}/media`, { media_type: 'REELS', video_url: videoUrl, caption: (asset.description || asset.title || '').slice(0, 2200) }, account.accessToken);

    const started = Date.now();
    for (;;) {
      const status = await this.#get(`/${created.id}`, { fields: 'status_code' }, account.accessToken);
      if (status.status_code === 'FINISHED') break;
      if (status.status_code === 'ERROR') throw new Error('Instagram could not process the video (container status: ERROR).');
      if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error('Instagram video processing timed out.');
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    try {
      const published = await this.#post(`/${account.igUserId}/media_publish`, { creation_id: created.id }, account.accessToken);
      return { status: 'published', remoteId: published.id, publishedAt: new Date().toISOString() };
    } catch (err) {
      if (err instanceof PlatformAuthError && /permission/i.test(err.message)) throw new PlatformReviewRequiredError('Instagram rejected the publish for a permissions reason — this account may not have cleared Meta App Review for instagram_content_publish yet.');
      throw err;
    }
  }

  async getStatus({ account, remoteId }) {
    const json = await this.#get(`/${remoteId}`, { fields: 'id' }, account.accessToken).catch((err) => (err.status === 400 ? null : Promise.reject(err)));
    return json ? { status: 'published' } : { status: 'removed' };
  }

  async getAnalytics({ account, remoteId }) {
    const metricMap = { views: 'plays', likes: 'likes', comments: 'comments', shares: 'shares', reach: 'reach', saved: 'saved' };
    const json = await this.#get(`/${remoteId}/insights`, { metric: Object.values(metricMap).join(',') }, account.accessToken);
    const byName = Object.fromEntries((json.data || []).map((d) => [d.name, d.values?.[0]?.value]));
    const out = {};
    for (const [key, apiName] of Object.entries(metricMap)) out[key] = typeof byName[apiName] === 'number' ? byName[apiName] : null;
    return { capturedAt: new Date().toISOString(), metrics: out };
  }
}

function statusErrorFor(res, json) {
  const message = json?.error?.message || `${res.status} ${res.statusText}`;
  if (res.status === 401 || json?.error?.code === 190) return new PlatformAuthError(`Instagram: ${message}`);
  if (json?.error?.code === 10 || json?.error?.error_subcode === 2207006) return new PlatformReviewRequiredError(`Instagram: ${message}`);
  const err = new Error(`Instagram API error: ${message}`);
  err.status = res.status;
  return err;
}
