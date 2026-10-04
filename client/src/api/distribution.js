/** Distribution API. Thin, same shape as api/content.js — the server owns validation and wording. */

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/distribution${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* keep the generic sentence */
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

export const distributionApi = {
  status: () => request('/status'),

  listBatches: () => request('/batches').then((r) => r.batches),
  createBatch: (title, sessionIds) => request('/batches', { method: 'POST', body: { title, sessionIds } }),
  getBatch: (id) => request(`/batches/${id}`),
  renameBatch: (id, title) => request(`/batches/${id}`, { method: 'PATCH', body: { title } }),
  deleteBatch: (id) => request(`/batches/${id}`, { method: 'DELETE' }),
  addSession: (id, sessionId) => request(`/batches/${id}/sessions`, { method: 'POST', body: { sessionId } }),
  removeSession: (id, sessionId) => request(`/batches/${id}/sessions/${sessionId}`, { method: 'DELETE' }),
  syncBatch: (id) => request(`/batches/${id}/sync`, { method: 'POST' }),
  listAssets: (id, all = false) => request(`/batches/${id}/assets${all ? '?all=1' : ''}`).then((r) => r.assets),
  learning: (id) => request(`/batches/${id}/learning`),

  getAsset: (id) => request(`/assets/${id}`),
  updateAsset: (id, patch) => request(`/assets/${id}`, { method: 'PATCH', body: patch }),

  listAccounts: () => request('/accounts').then((r) => r.accounts),
  authUrl: (platform, redirectUri, state) => request(`/accounts/${platform}/auth-url?redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state || '')}`).then((r) => r.url),
  connectAccount: (platform, code, redirectUri) => request(`/accounts/${platform}/connect`, { method: 'POST', body: { code, redirectUri } }),
  linkInstagram: (facebookAccountId) => request('/accounts/instagram/link', { method: 'POST', body: { facebookAccountId } }),
  disconnectAccount: (id) => request(`/accounts/${id}`, { method: 'DELETE' }),

  schedule: (body) => request('/publications', { method: 'POST', body }),
  listPublications: (params = {}) => request(`/publications?${new URLSearchParams(params)}`).then((r) => r.publications),
  cancelPublication: (id) => request(`/publications/${id}/cancel`, { method: 'POST' }),
  retryPublication: (id) => request(`/publications/${id}/retry`, { method: 'POST' }),
  publicationAnalytics: (id) => request(`/publications/${id}/analytics`),

  draftBrief: (topic, notes) => request('/research/brief', { method: 'POST', body: { topic, notes } }),

  runCycle: () => request('/cycle', { method: 'POST' }),
};
