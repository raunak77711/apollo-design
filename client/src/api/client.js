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
  // Always takes the full art-direction pipeline, whatever the document holds.
  aiGenerate: (payload) => request('/ai/generate', { method: 'POST', body: payload }),
  aiGenerateStream,
  aiVariations: (payload) => request('/ai/variations', { method: 'POST', body: payload }),

  // Images
  searchImages: (q) => request(`/images/search?q=${encodeURIComponent(q)}`),

  // Assets
  listAssets: () => request('/assets'),
  uploadAsset: (formData) => request('/assets/upload', { method: 'POST', body: formData, isForm: true }),

  // Export
  exportDesign: (payload) => request('/export', { method: 'POST', body: payload }),
  flattenLayers: (document) => request('/export/flatten', { method: 'POST', body: { document } }),
};

/* ---------------------------- streamed generation ------------------------- */

/**
 * Generate a design, narrating each pipeline stage as the server reaches it.
 *
 * Server-sent events over POST, so `fetch` rather than `EventSource`. If the
 * stream is unavailable for any reason — an old server, a proxy that buffers,
 * a browser without streaming bodies — this silently falls back to the plain
 * `/ai/generate` call. A design always gets made; only the narration is at risk.
 *
 * `signal` aborts the request; `onStage(stage, detail)` fires per stage.
 */
async function aiGenerateStream(payload, { onStage, signal } = {}) {
  let res;
  try {
    res = await fetch('/api/ai/generate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return request('/ai/generate', { method: 'POST', body: payload });
  }

  if (!res.ok) {
    // A 4xx is a real error with a real message; anything else means the
    // stream route is not there and the plain one still might be.
    if (res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return request('/ai/generate', { method: 'POST', body: payload });
  }
  if (!res.body) return request('/ai/generate', { method: 'POST', body: payload });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let failure = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Events are separated by a blank line; anything after the last one is a
      // partial frame and stays in the buffer.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
        const raw = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (!event || !raw) continue;

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        if (event === 'stage') onStage?.(data.stage, data);
        else if (event === 'result') result = data;
        else if (event === 'failed') failure = data.error;
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (failure) throw new Error(failure);
  // A stream that ended without a result was cut short somewhere in transit;
  // the plain route is the honest way to still deliver a design.
  if (!result) return request('/ai/generate', { method: 'POST', body: payload });
  return result;
}
