/**
 * Content Factory API. Thin, like api/board.js - the server owns validation and the
 * wording of errors; this only moves JSON (and one very large file) across.
 */

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api/content${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal,
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

/**
 * Send a recording as the raw request body. XHR rather than fetch because a
 * multi-gigabyte upload needs real progress, and fetch cannot report upload bytes.
 */
function uploadVideo(id, file, { onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/content/sessions/${id}/video?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total, e.loaded, e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data);
      else reject(new Error(data?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check that Apollo is running and try again.'));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });
}

export const contentApi = {
  status: () => request('/status'),
  list: () => request('/sessions').then((r) => r.sessions),
  create: (title) => request('/sessions', { method: 'POST', body: { title } }),
  get: (id, signal) => request(`/sessions/${id}`, { signal }),
  rename: (id, title) => request(`/sessions/${id}`, { method: 'PATCH', body: { title } }),
  remove: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  linkBoard: (id, payload) => request(`/sessions/${id}/board`, { method: 'PUT', body: payload }),
  unlinkBoard: (id) => request(`/sessions/${id}/board`, { method: 'DELETE' }),
  process: (id, force = false) => request(`/sessions/${id}/process`, { method: 'POST', body: { force } }),
  analyze: (id, force = false) => request(`/sessions/${id}/analyze`, { method: 'POST', body: { force } }),
  analysis: (id) => request(`/sessions/${id}/analysis`),
  transcript: (id) => request(`/sessions/${id}/transcript`),
  tally: (id) => request(`/sessions/${id}/tally`),
  uploadVideo,
};
