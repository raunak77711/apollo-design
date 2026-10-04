import test from 'node:test';
import assert from 'node:assert/strict';
import { FacebookProvider } from '../src/services/distribution/providers/FacebookProvider.js';
import { InstagramProvider } from '../src/services/distribution/providers/InstagramProvider.js';
import { PlatformAuthError, PlatformReviewRequiredError } from '../src/services/distribution/providers/PlatformProvider.js';
import { TikTokProvider } from '../src/services/distribution/providers/TikTokProvider.js';
import { YouTubeProvider } from '../src/services/distribution/providers/YouTubeProvider.js';

/** A scripted fetch: `routes` is an array of { match(url, init) => bool, respond(url, init) => { status, body, headers? } }, tried in order. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes.find((r) => r.match(String(url), init));
    if (!route) throw new Error(`no fake route matched: ${url}`);
    const { status = 200, body = {}, headers = {} } = route.respond(String(url), init);
    return {
      ok: status < 400, status, statusText: String(status),
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  fn.calls = calls;
  return fn;
}

const bytes = () => Buffer.from('pretend mp4 bytes');

/* ---------------------------------- YouTube ---------------------------------- */

test('YouTube: exchanging a code fetches the channel, and native scheduling sends privacyStatus+publishAt', async () => {
  const fetchImpl = fakeFetch([
    { match: (u) => u.includes('oauth2.googleapis.com/token'), respond: () => ({ body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'x' } }) },
    { match: (u) => u.includes('/channels'), respond: () => ({ body: { items: [{ id: 'UC1', snippet: { title: 'My Channel' } }] } }) },
  ]);
  const yt = new YouTubeProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl });
  const account = await yt.exchangeCode({ code: 'c', redirectUri: 'https://app/cb' });
  assert.equal(account.accountId, 'UC1');
  assert.equal(account.accountName, 'My Channel');
  assert.equal(account.refreshToken, 'rt');

  const future = new Date(Date.now() + 86400_000).toISOString();
  const upload = fakeFetch([
    { match: (u) => u.includes('uploadType=resumable'), respond: () => ({ status: 200, body: {}, headers: { location: 'https://upload.example/session1' } }) },
    { match: (u) => u === 'https://upload.example/session1', respond: () => ({ body: { id: 'vid1' } }) },
  ]);
  yt.fetchImpl = upload;
  const result = await yt.publish({ account: { accessToken: 'at' }, asset: { title: 'A short', description: 'd' }, scheduledFor: future, fileBytes: bytes() });
  assert.equal(result.status, 'native_scheduled');
  assert.equal(result.remoteId, 'vid1');
  const meta = JSON.parse(upload.calls[0].init.body);
  assert.equal(meta.status.privacyStatus, 'private');
  assert.equal(meta.status.publishAt, future);
});

test('YouTube: a 401 from the API becomes a PlatformAuthError, not a generic one', async () => {
  const fetchImpl = fakeFetch([{ match: () => true, respond: () => ({ status: 401, body: { error: { message: 'invalid credentials' } } }) }]);
  const yt = new YouTubeProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl });
  await assert.rejects(() => yt.getStatus({ account: { accessToken: 'bad' }, remoteId: 'v1' }), PlatformAuthError);
});

test('YouTube: analytics report missing metrics as null, never fabricated', async () => {
  const fetchImpl = fakeFetch([{ match: (u) => u.includes('youtubeanalytics'), respond: () => ({ body: { columnHeaders: [{ name: 'views' }, { name: 'likes' }], rows: [[42, 7]] } }) }]);
  const yt = new YouTubeProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl });
  const { metrics } = await yt.getAnalytics({ account: { accessToken: 'at' }, remoteId: 'v1' });
  assert.equal(metrics.views, 42);
  assert.equal(metrics.likes, 7);
  assert.equal(metrics.estimatedMinutesWatched, null); // the fake report never returned it
});

/* --------------------------------- Facebook ---------------------------------- */

test('Facebook: connecting resolves the Page token (not the user token), and scheduling sends scheduled_publish_time', async () => {
  const fetchImpl = fakeFetch([
    { match: (u) => u.includes('/oauth/access_token'), respond: () => ({ body: { access_token: 'user-token' } }) },
    { match: (u) => u.includes('/me/accounts'), respond: () => ({ body: { data: [{ id: 'page1', name: 'My Page', access_token: 'page-token' }] } }) },
  ]);
  const fb = new FacebookProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl });
  const account = await fb.exchangeCode({ code: 'c', redirectUri: 'https://app/cb' });
  assert.equal(account.accountId, 'page1');
  assert.equal(account.accessToken, 'page-token'); // the Page token, never the short-lived user token

  const future = new Date(Date.now() + 3600_000).toISOString();
  const upload = fakeFetch([{ match: (u) => u.includes('graph-video.facebook.com'), respond: () => ({ body: { id: 'post1' } }) }]);
  fb.fetchImpl = upload;
  const result = await fb.publish({ account: { accessToken: 'page-token', accountId: 'page1' }, asset: { title: 't' }, scheduledFor: future, fileBytes: bytes() });
  assert.equal(result.status, 'native_scheduled');
  const form = upload.calls[0].init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('published'), 'false');
  assert.ok(form.get('scheduled_publish_time'));
});

test('Facebook: no administered Page is a clear, non-retriable error naming the real problem', async () => {
  const fetchImpl = fakeFetch([
    { match: (u) => u.includes('/oauth/access_token'), respond: () => ({ body: { access_token: 'user-token' } }) },
    { match: (u) => u.includes('/me/accounts'), respond: () => ({ body: { data: [] } }) },
  ]);
  const fb = new FacebookProvider({ clientId: 'id', clientSecret: 'secret', fetchImpl });
  await assert.rejects(() => fb.exchangeCode({ code: 'c', redirectUri: 'https://app/cb' }), (err) => err instanceof PlatformAuthError && err.needsReconnect === false);
});

/* --------------------------------- Instagram ---------------------------------- */

test('Instagram: refuses to publish without a configured public media URL rather than silently failing against localhost', async () => {
  const ig = new InstagramProvider({ publicMediaBaseUrl: '', fetchImpl: fakeFetch([]) });
  await assert.rejects(() => ig.publish({ account: { igUserId: 'ig1', accessToken: 'at' }, asset: { title: 't' }, mediaPath: 'renders/x.mp4' }), /PUBLIC_MEDIA_BASE_URL/);
});

test('Instagram: the two-step container -> publish flow, polling until FINISHED', async () => {
  let polls = 0;
  const fetchImpl = fakeFetch([
    { match: (u) => u.includes('/media') && !u.includes('media_publish'), respond: (u, init) => { assert.equal(JSON.parse(init.body).video_url, 'https://public.example/renders/x.mp4'); return { body: { id: 'container1' } }; } },
    { match: (u) => u.includes('/container1') && u.includes('status_code'), respond: () => { polls += 1; return { body: { status_code: polls < 2 ? 'IN_PROGRESS' : 'FINISHED' } }; } },
    { match: (u) => u.includes('media_publish'), respond: () => ({ body: { id: 'ig-post-1' } }) },
  ]);
  const ig = new InstagramProvider({ publicMediaBaseUrl: 'https://public.example', fetchImpl });
  const result = await ig.publish({ account: { igUserId: 'ig1', accessToken: 'at' }, asset: { title: 'A caption' }, mediaPath: 'renders/x.mp4' });
  assert.equal(result.status, 'published');
  assert.equal(result.remoteId, 'ig-post-1');
  assert.ok(polls >= 2);
});

test('Instagram: a permissions rejection on publish is surfaced as "needs review", not a generic failure', async () => {
  const fetchImpl = fakeFetch([
    { match: (u) => u.includes('/media') && !u.includes('media_publish'), respond: () => ({ body: { id: 'container1' } }) },
    { match: (u) => u.includes('status_code'), respond: () => ({ body: { status_code: 'FINISHED' } }) },
    { match: (u) => u.includes('media_publish'), respond: () => ({ status: 400, body: { error: { message: 'permissions error', code: 10 } } }) },
  ]);
  const ig = new InstagramProvider({ publicMediaBaseUrl: 'https://public.example', fetchImpl });
  await assert.rejects(() => ig.publish({ account: { igUserId: 'ig1', accessToken: 'at' }, asset: { title: 't' }, mediaPath: 'x.mp4' }), PlatformReviewRequiredError);
});

/* ---------------------------------- TikTok ------------------------------------ */

test('TikTok: refuses to call publish() early for a future time - it has no native scheduling', async () => {
  const tiktok = new TikTokProvider({ clientKey: 'k', clientSecret: 's', fetchImpl: fakeFetch([]) });
  await assert.rejects(() => tiktok.publish({ account: { accessToken: 'at' }, asset: { title: 't' }, scheduledFor: new Date(Date.now() + 3600_000).toISOString(), fileBytes: bytes() }), /no native scheduling/);
});

test('TikTok: init + chunked PUT upload, and an unaudited-app rejection becomes "needs review"', async () => {
  const fetchImpl = fakeFetch([
    { match: (u) => u.includes('/post/publish/video/init/'), respond: () => ({ body: { data: { publish_id: 'pub1', upload_url: 'https://upload.tiktok.example/u1' } } }) },
    { match: (u) => u === 'https://upload.tiktok.example/u1', respond: () => ({ status: 201, body: {} }) },
  ]);
  const tiktok = new TikTokProvider({ clientKey: 'k', clientSecret: 's', fetchImpl });
  const result = await tiktok.publish({ account: { accessToken: 'at' }, asset: { title: 'A short' }, fileBytes: bytes() });
  assert.equal(result.status, 'published');
  assert.equal(result.remoteId, 'pub1');

  const denied = fakeFetch([{ match: (u) => u.includes('/post/publish/video/init/'), respond: () => ({ body: { error: { code: 'scope_not_authorized', message: 'unaudited client cannot use this scope' } } }) }]);
  const tiktok2 = new TikTokProvider({ clientKey: 'k', clientSecret: 's', fetchImpl: denied });
  await assert.rejects(() => tiktok2.publish({ account: { accessToken: 'at' }, asset: { title: 't' }, fileBytes: bytes() }), PlatformReviewRequiredError);
});

test('TikTok: analytics come from the video query endpoint with only the documented fields', async () => {
  const fetchImpl = fakeFetch([{ match: (u) => u.includes('/video/query/'), respond: () => ({ body: { data: { videos: [{ view_count: 100, like_count: 5, comment_count: 1, share_count: 0 }] } } }) }]);
  const tiktok = new TikTokProvider({ clientKey: 'k', clientSecret: 's', fetchImpl });
  const { metrics } = await tiktok.getAnalytics({ account: { accessToken: 'at' }, remoteId: 'pub1' });
  assert.deepEqual(metrics, { views: 100, likes: 5, comments: 1, shares: 0 });
});
