import { PlatformAuthError, PlatformCapabilities, PlatformProvider } from './PlatformProvider.js';

/**
 * YouTube — OAuth2 (Google) + the YouTube Data API v3 for upload, the YouTube
 * Analytics API v2 for performance.
 *
 * The one platform here with real, first-class native scheduling: a video uploaded
 * with `status.privacyStatus = 'private'` and a future `status.publishAt` is held
 * and published by YouTube itself, so it goes out even if Apollo is offline at that
 * moment — exactly the behaviour the scheduler prefers everywhere it can get it.
 *
 * Setup the account owner (not Apollo) must do once, in Google Cloud Console: create
 * a project, enable the YouTube Data API v3 and YouTube Analytics API, create an
 * OAuth 2.0 Client ID (type "Web application") with this app's redirect URI
 * registered, and add the channel's own Google account as a test user if the OAuth
 * consent screen is still in "Testing" mode (fine for a single channel; "Published"
 * app review is only needed to let *other* people connect their own channels).
 */

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const API = 'https://www.googleapis.com/youtube/v3';
const ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2/reports';
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'];

export class YouTubeProvider extends PlatformProvider {
  static id = 'youtube';

  constructor({ clientId, clientSecret, fetchImpl = fetch } = {}) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetchImpl = fetchImpl;
  }

  get capabilities() {
    return new PlatformCapabilities({
      nativeScheduling: true,
      requiresAppReview: false, // not for the channel owner testing their own channel
      mediaTypes: ['video'],
      analyticsMetrics: ['views', 'likes', 'comments', 'shares', 'estimatedMinutesWatched', 'averageViewDuration', 'subscribersGained'],
      maxTitleChars: 100,
      notes: 'Scheduling is native and reliable. Full public use by other people would need Google to verify the OAuth consent screen; a single channel authorizing its own app does not.',
    });
  }

  get scopes() {
    return SCOPES;
  }

  authUrl({ redirectUri, state }) {
    const q = new URLSearchParams({
      client_id: this.clientId, redirect_uri: redirectUri, response_type: 'code', access_type: 'offline', prompt: 'consent',
      scope: SCOPES.join(' '), state,
    });
    return `${AUTH_URL}?${q}`;
  }

  async #token(body) {
    const res = await this.fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new PlatformAuthError(`YouTube token request failed: ${json.error_description || json.error || res.status}`);
    return json;
  }

  async exchangeCode({ code, redirectUri }) {
    const json = await this.#token({ code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
    const channel = await this.#api('/channels', { part: 'snippet', mine: 'true' }, json.access_token);
    const me = channel.items?.[0];
    return {
      accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
      accountId: me?.id || '', accountName: me?.snippet?.title || 'YouTube channel', scope: json.scope,
    };
  }

  async refresh({ refreshToken }) {
    const json = await this.#token({ refresh_token: refreshToken, client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'refresh_token' });
    return { accessToken: json.access_token, expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString() };
  }

  async #api(path, params, accessToken, init) {
    const q = params ? `?${new URLSearchParams(params)}` : '';
    const res = await this.fetchImpl(`${API}${path}${q}`, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor('YouTube', res, json);
    return json;
  }

  async publish({ account, asset, scheduledFor, fileBytes, mimeType = 'video/mp4' }) {
    const future = scheduledFor && new Date(scheduledFor) > new Date();
    const status = future ? { privacyStatus: 'private', publishAt: new Date(scheduledFor).toISOString(), selfDeclaredMadeForKids: false } : { privacyStatus: 'public', selfDeclaredMadeForKids: false };
    const metadata = {
      snippet: { title: asset.title.slice(0, 100), description: asset.description || '', tags: asset.tags?.slice(0, 15) },
      status,
    };

    // Resumable upload: a metadata POST that returns an upload URL (Location header), then the bytes.
    const start = await this.fetchImpl(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': mimeType },
      body: JSON.stringify(metadata),
    });
    if (!start.ok) throw statusErrorFor('YouTube', start, await start.json().catch(() => ({})));
    const uploadUrl = start.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube did not return an upload URL');

    const put = await this.fetchImpl(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: fileBytes });
    const video = await put.json().catch(() => ({}));
    if (!put.ok) throw statusErrorFor('YouTube', put, video);

    return future
      ? { status: 'native_scheduled', remoteId: video.id, scheduledFor: status.publishAt, publicUrl: `https://youtube.com/watch?v=${video.id}` }
      : { status: 'published', remoteId: video.id, publishedAt: new Date().toISOString(), publicUrl: `https://youtube.com/watch?v=${video.id}` };
  }

  async getStatus({ account, remoteId }) {
    const json = await this.#api('/videos', { part: 'status,processingDetails', id: remoteId }, account.accessToken);
    const v = json.items?.[0];
    if (!v) return { status: 'removed' };
    if (v.processingDetails?.processingStatus === 'processing') return { status: 'processing' };
    if (v.status?.uploadStatus === 'rejected' || v.status?.uploadStatus === 'failed') return { status: 'failed', reason: v.status.rejectionReason || v.status.failureReason };
    return { status: 'published', publicUrl: `https://youtube.com/watch?v=${remoteId}` };
  }

  async getAnalytics({ account, remoteId }) {
    const metrics = this.capabilities.analyticsMetrics;
    const end = new Date().toISOString().slice(0, 10);
    return this.#fetchAnalytics({ account, remoteId, metrics, end });
  }

  async #fetchAnalytics({ account, remoteId, metrics, end }) {
    const q = new URLSearchParams({ ids: 'channel==MINE', startDate: '2005-01-01', endDate: end, metrics: metrics.join(','), filters: `video==${remoteId}` });
    const res = await this.fetchImpl(`${ANALYTICS_API}?${q}`, { headers: { Authorization: `Bearer ${account.accessToken}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor('YouTube Analytics', res, json);
    const row = json.rows?.[0] || [];
    const headers = (json.columnHeaders || []).map((h) => h.name);
    const out = {};
    for (const m of metrics) {
      const i = headers.indexOf(m);
      out[m] = i >= 0 && row[i] !== undefined ? Number(row[i]) : null;
    }
    out.shares = out.shares ?? null; // not every channel/report combination returns shares; be explicit rather than silently omit
    return { capturedAt: new Date().toISOString(), metrics: out };
  }
}

function statusErrorFor(platform, res, json) {
  const message = json?.error?.message || json?.error_description || `${res.status} ${res.statusText}`;
  const err = new Error(`${platform} API error: ${message}`);
  err.status = res.status;
  if (res.status === 401 || res.status === 403) return new PlatformAuthError(err.message);
  return err;
}
