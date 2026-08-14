/** Thin fetch wrapper for the Apollo backend. */

async function request(path, { method = 'GET', body, isForm } = {}) {
  const opts = { method, headers: {} };
  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (isForm) {
    opts.body = body; // FormData sets its own headers
  }
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => request('/health'),

  // Projects
  listProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: data }),
  getProject: (id) => request(`/projects/${id}`),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: data }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),

  // AI
  aiChat: (payload) => request('/ai/chat', { method: 'POST', body: payload }),

  // Images
  searchImages: (q) => request(`/images/search?q=${encodeURIComponent(q)}`),

  // Assets
  listAssets: () => request('/assets'),
  uploadAsset: (formData) => request('/assets/upload', { method: 'POST', body: formData, isForm: true }),

  // Export
  exportDesign: (payload) => request('/export', { method: 'POST', body: payload }),
  flattenLayers: (document) => request('/export/flatten', { method: 'POST', body: { document } }),
};
