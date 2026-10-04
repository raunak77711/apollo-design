import { PlatformAuthError, PlatformCapabilities, PlatformProvider, PlatformReviewRequiredError } from './PlatformProvider.js';

/**
 * TikTok — OAuth2 + the Content Posting API.
 *
 * The most gated of the four. A newly created app can only send a video to the
 * connected user's TikTok inbox as a draft (`/v2/post/publish/inbox/video/init/`) —
 * someone still has to open the TikTok app and tap Post. **Direct, unattended
 * publish** (`/v2/post/publish/video/init/`) needs TikTok's own "Direct Post" API
 * product approval, which is a real review process Apollo cannot shortcut or
 * predict the timing of. `capabilities.requiresAppReview` reflects exactly that,
 * and `publish()` tries the direct-post endpoint and surfaces a clear
 * `PlatformReviewRequiredError` — not a generic failure — the moment TikTok itself
 * says the scope isn't granted, so the UI can say "waiting on TikTok approval"
 * instead of "broken."
 *
 * No future-scheduling parameter exists in the public API, so a scheduled TikTok
 * post is always a LOCAL_QUEUE job.
 *
 * Setup: register an app at TikTok's developer portal, add the Login Kit and
 * Content Posting API products, request `user.info.basic`, `video.publish` and
 * `video.list` scopes, and apply for the Direct Post capability (`video.publish`
 * alone only grants the inbox-draft endpoint until that's approved).
 */

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'video.publish', 'video.list'];
const CHUNK_SIZE = 10 * 1024 * 1024; // TikTok requires 5-64MB chunks for the upload step; this comfortably fits a short's few tens of MB in one or two chunks

export class TikTokProvider extends PlatformProvider {
  static id = 'tiktok';

  constructor({ clientKey, clientSecret, fetchImpl = fetch } = {}) {
    super();
    this.clientKey = clientKey;
    this.clientSecret = clientSecret;
    this.fetchImpl = fetchImpl;
  }

  get capabilities() {
    return new PlatformCapabilities({
      nativeScheduling: false,
      requiresAppReview: true,
      mediaTypes: ['video'],
      analyticsMetrics: ['views', 'likes', 'comments', 'shares'],
      maxTitleChars: 2200,
      notes: 'Direct, unattended publish needs TikTok\'s Direct Post API approval. Until it is granted, publish() reports needs_review and the video is not posted automatically.',
    });
  }

  authUrl({ redirectUri, state }) {
    const q = new URLSearchParams({ client_key: this.clientKey, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(','), state });
    return `${AUTH_URL}?${q}`;
  }

  async #token(body) {
    const res = await this.fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: new URLSearchParams(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new PlatformAuthError(`TikTok token request failed: ${json.error_description || json.error || res.status}`);
    return json;
  }

  async exchangeCode({ code, redirectUri }) {
    const json = await this.#token({ client_key: this.clientKey, client_secret: this.clientSecret, code, grant_type: 'authorization_code', redirect_uri: redirectUri });
    const info = await this.#post('/user/info/', { fields: ['open_id', 'display_name'] }, json.access_token).catch(() => ({ data: { user: {} } }));
    return {
      accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      accountId: json.open_id, accountName: info.data?.user?.display_name || 'TikTok account', scope: json.scope,
    };
  }

  async refresh({ refreshToken }) {
    const json = await this.#token({ client_key: this.clientKey, client_secret: this.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken });
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString() };
  }

  async #post(path, body, accessToken) {
    const res = await this.fetchImpl(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error?.code === 'access_token_invalid') throw new PlatformAuthError(`TikTok: ${json.error?.message || res.status}`);
    if (json.error?.code && json.error.code !== 'ok') throw statusErrorFor(json.error);
    return json;
  }

  async publish({ account, asset, scheduledFor, fileBytes, mimeType = 'video/mp4' }) {
    if (scheduledFor && new Date(scheduledFor) > new Date()) {
      throw new Error('TikTok has no native scheduling; the scheduler should hold this and call publish() when it is actually due.');
    }
    const size = fileBytes.byteLength ?? fileBytes.length;
    const chunkSize = Math.min(CHUNK_SIZE, size);
    const chunkCount = Math.max(1, Math.ceil(size / chunkSize));

    let init;
    try {
      init = await this.#post('/post/publish/video/init/', {
        post_info: { title: (asset.title || '').slice(0, 2200), privacy_level: 'SELF_ONLY', disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: chunkCount },
      }, account.accessToken);
    } catch (err) {
      if (err instanceof PlatformAuthError && /scope|permission|unaudited/i.test(err.message)) {
        throw new PlatformReviewRequiredError("TikTok has not granted this app Direct Post access yet; the video can't be published unattended until it does.");
      }
      throw err;
    }

    const uploadUrl = init.data.upload_url;
    for (let i = 0; i < chunkCount; i += 1) {
      const start = i * chunkSize;
      const end = Math.min(size, start + chunkSize) - 1;
      const chunk = fileBytes.slice(start, end + 1);
      const res = await this.fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType, 'Content-Range': `bytes ${start}-${end}/${size}` }, body: chunk });
      if (!res.ok) throw new Error(`TikTok upload chunk ${i + 1}/${chunkCount} failed (${res.status})`);
    }
    return { status: 'published', remoteId: init.data.publish_id, publishedAt: new Date().toISOString() };
  }

  async getStatus({ account, remoteId }) {
    const json = await this.#post('/post/publish/status/fetch/', { publish_id: remoteId }, account.accessToken);
    const s = json.data?.status;
    if (s === 'PUBLISH_COMPLETE') return { status: 'published' };
    if (s === 'FAILED') return { status: 'failed', reason: json.data?.fail_reason };
    return { status: 'processing' };
  }

  async getAnalytics({ account, remoteId }) {
    const json = await this.#post('/video/query/', { filters: { video_ids: [remoteId] }, fields: ['view_count', 'like_count', 'comment_count', 'share_count'] }, account.accessToken);
    const v = json.data?.videos?.[0];
    return {
      capturedAt: new Date().toISOString(),
      metrics: { views: v?.view_count ?? null, likes: v?.like_count ?? null, comments: v?.comment_count ?? null, shares: v?.share_count ?? null },
    };
  }
}

function statusErrorFor(error) {
  if (/scope|permission|unaudited/i.test(error.message || '')) return new PlatformReviewRequiredError(`TikTok: ${error.message}`);
  const err = new Error(`TikTok API error: ${error.message} (${error.code})`);
  return err;
}
