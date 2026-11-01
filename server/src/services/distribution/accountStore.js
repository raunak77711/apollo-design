import { createSessionStore } from '../content/sessionStore.js';

/**
 * Connected platform accounts (YouTube channel, Facebook Page, Instagram Business
 * account, TikTok account), one JSON record per account under `storage/distribution/accounts/`
 * — the same generic, atomic, cached JSON-file store the Content Factory sessions use.
 *
 * Tokens are sealed (`secretBox`) before they ever reach disk and opened only in
 * memory, right before a provider call — `list()` never returns a usable token, so a
 * page can show "YouTube — Apollo's Test Channel, connected 3 days ago" without ever
 * holding the secret that would let it post.
 */
export function createAccountStore(root, secretBox) {
  const store = createSessionStore(root);

  const seal = (account) => ({
    ...account,
    accessToken: account.accessToken ? secretBox.seal(account.accessToken) : null,
    refreshToken: account.refreshToken ? secretBox.seal(account.refreshToken) : null,
  });
  const open = (account) => ({
    ...account,
    accessToken: account.accessToken ? secretBox.open(account.accessToken) : null,
    refreshToken: account.refreshToken ? secretBox.open(account.refreshToken) : null,
  });
  const redact = ({ accessToken: _a, refreshToken: _r, ...rest }) => rest;

  return {
    /** Create or replace the connection for this platform+accountId (reconnecting updates tokens in place). */
    async upsert({ platform, accountId, accountName, accessToken, refreshToken, expiresAt, scope, extra = {} }) {
      const existing = (await store.list()).find((a) => a.platform === platform && a.accountId === accountId);
      const now = new Date().toISOString();
      if (existing) {
        return redact(await store.update(existing.id, (a) => {
          Object.assign(a, seal({ accountName, accessToken, refreshToken, expiresAt, scope }), { extra: { ...a.extra, ...extra }, connectedAt: a.connectedAt || now });
        }));
      }
      return redact(await store.create(seal({ platform, accountId, accountName, accessToken, refreshToken, expiresAt, scope, extra, connectedAt: now })));
    },

    /** The account WITH its live token, for a provider call. Never log or return this to the browser. */
    async getWithToken(id) {
      return open(await store.get(id));
    },

    async get(id) {
      return redact(await store.get(id));
    },

    async list() {
      return (await store.list()).map(redact);
    },

    async listByPlatform(platform) {
      return (await store.list()).filter((a) => a.platform === platform).map(redact);
    },

    async remove(id) {
      return store.remove(id);
    },

    async updateTokens(id, { accessToken, refreshToken, expiresAt }) {
      return redact(await store.update(id, (a) => {
        if (accessToken) a.accessToken = secretBox.seal(accessToken);
        if (refreshToken) a.refreshToken = secretBox.seal(refreshToken);
        if (expiresAt !== undefined) a.expiresAt = expiresAt;
      }));
    },
  };
}
