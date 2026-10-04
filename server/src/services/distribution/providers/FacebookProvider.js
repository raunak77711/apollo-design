import { PlatformAuthError, PlatformCapabilities, PlatformProvider } from './PlatformProvider.js';

/**
 * A Facebook Page — OAuth2 (Meta) + the Graph API.
 *
 * Also has real native scheduling: a Page video published with `published: false`
 * and a future `scheduled_publish_time` is held and posted by Facebook itself.
 *
 * Setup the Page admin must do once, in the Meta Developers console: create an app,
 * add the "Facebook Login for Business" product, register this app's redirect URI,
 * and request the `pages_show_list`, `pages_manage_posts` and `pages_read_engagement`
 * permissions. A Page the connecting account administers can post immediately in
 * development mode; posting to Pages you don't administer, or letting other people
 * connect their own Pages, needs Meta's App Review.
 */

const AUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const GRAPH = 'https://graph.facebook.com/v21.0';
const SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement'];

export class FacebookProvider extends PlatformProvider {
  static id = 'facebook';

  constructor({ clientId, clientSecret, fetchImpl = fetch } = {}) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetchImpl = fetchImpl;
  }

  get capabilities() {
    return new PlatformCapabilities({
      nativeScheduling: true,
      requiresAppReview: false, // for the Page's own admin, posting to their own Page
      mediaTypes: ['video'],
      analyticsMetrics: ['views', 'likes', 'comments', 'shares', 'reach'],
      maxTitleChars: 63206,
      notes: 'Native scheduling works for Pages the connected account administers. Letting other people connect their own Pages would need Meta App Review.',
    });
  }

  authUrl({ redirectUri, state }) {
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, state, scope: SCOPES.join(',') });
    return `${AUTH_URL}?${q}`;
  }

  async #get(path, params, accessToken) {
    const q = new URLSearchParams({ ...params, access_token: accessToken });
    const res = await this.fetchImpl(`${GRAPH}${path}?${q}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor(res, json);
    return json;
  }

  async exchangeCode({ code, redirectUri }) {
    const q = new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: redirectUri, code });
    const res = await this.fetchImpl(`${TOKEN_URL}?${q}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor(res, json);
    const userToken = json.access_token;

    // Pages the user administers, each with its own long-lived Page token - the credential actually used to post.
    const pages = await this.#get('/me/accounts', { fields: 'id,name,access_token' }, userToken);
    const page = pages.data?.[0];
    if (!page) throw new PlatformAuthError('No Facebook Page is administered by this account. Create or get admin access to a Page first.', { needsReconnect: false });

    return {
      accessToken: page.access_token, refreshToken: null, expiresAt: null, // Page tokens from a long-lived user token do not expire under normal conditions
      accountId: page.id, accountName: page.name, scope: SCOPES.join(','), raw: { pages: pages.data.map((p) => ({ id: p.id, name: p.name })) },
    };
  }

  async refresh() {
    // Page access tokens derived from a long-lived user token are effectively non-expiring; re-auth is the recovery path if one is revoked.
    throw new PlatformAuthError('This Facebook Page connection needs to be reconnected.', { needsReconnect: true });
  }

  async publish({ account, asset, scheduledFor, fileBytes, mimeType = 'video/mp4' }) {
    const future = scheduledFor && new Date(scheduledFor) > new Date();
    const form = new FormData();
    form.append('source', new Blob([fileBytes], { type: mimeType }), 'short.mp4');
    form.append('description', asset.description || asset.title || '');
    form.append('access_token', account.accessToken);
    if (future) {
      form.append('published', 'false');
      form.append('scheduled_publish_time', String(Math.floor(new Date(scheduledFor).getTime() / 1000)));
    }
    const res = await this.fetchImpl(`${GRAPH.replace('graph.facebook.com', 'graph-video.facebook.com')}/${account.accountId}/videos`, { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw statusErrorFor(res, json);

    return future
      ? { status: 'native_scheduled', remoteId: json.id, scheduledFor: new Date(scheduledFor).toISOString() }
      : { status: 'published', remoteId: json.id, publishedAt: new Date().toISOString(), publicUrl: `https://facebook.com/${json.id}` };
  }

  async getStatus({ account, remoteId }) {
    const json = await this.#get(`/${remoteId}`, { fields: 'status' }, account.accessToken);
    const phase = json.status?.video_status;
    if (phase === 'error') return { status: 'failed' };
    if (phase === 'processing') return { status: 'processing' };
    return { status: 'published', publicUrl: `https://facebook.com/${remoteId}` };
  }

  async getAnalytics({ account, remoteId }) {
    const metricMap = { views: 'total_video_views', likes: 'total_video_reactions_by_type_total', comments: 'total_video_comments', shares: 'total_video_shares', reach: 'total_video_impressions_unique' };
    const json = await this.#get(`/${remoteId}/video_insights`, { metric: Object.values(metricMap).join(',') }, account.accessToken);
    const byName = Object.fromEntries((json.data || []).map((d) => [d.name, d.values?.[0]?.value]));
    const out = {};
    for (const [key, apiName] of Object.entries(metricMap)) {
      const v = byName[apiName];
      out[key] = typeof v === 'number' ? v : typeof v === 'object' && v ? Object.values(v).reduce((a, b) => a + b, 0) : null;
    }
    return { capturedAt: new Date().toISOString(), metrics: out };
  }
}

function statusErrorFor(res, json) {
  const message = json?.error?.message || `${res.status} ${res.statusText}`;
  if (res.status === 401 || json?.error?.code === 190) return new PlatformAuthError(`Facebook: ${message}`);
  const err = new Error(`Facebook API error: ${message}`);
  err.status = res.status;
  return err;
}
