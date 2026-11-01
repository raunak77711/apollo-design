import { readEventStream } from '../lib/sse.js';

/** Jam board API. Thin, like api/client.js — the server owns validation and the wording of errors. */

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api/board${path}`, {
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
  return res.json();
}

/**
 * Generate a board, narrating outline and sections as they arrive.
 *
 * If the stream is unavailable for any reason — an old server, a proxy that
 * buffers, a browser without streaming bodies — this falls back to the plain
 * route. A board always gets made; only the live progress is at risk. A 4xx is
 * a real answer ("your brief is too short") and is never retried.
 */
export async function generateBoardStream(brief, { onOutline, onSection, signal } = {}) {
  const plain = () => request('/generate', { method: 'POST', body: { brief }, signal }).then((r) => r.board);

  let res;
  try {
    res = await fetch('/api/board/generate/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ brief }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    return plain();
  }

  if (!res.ok) {
    if (res.status !== 404 && res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return plain();
  }
  if (!res.body) return plain();

  let board = null;
  let failure = null;
  await readEventStream(res, (event, data) => {
    if (event === 'outline') onOutline?.(data);
    else if (event === 'section') onSection?.(data);
    else if (event === 'result') board = data.board;
    else if (event === 'failed') failure = data.error;
  });

  if (failure) throw new Error(failure);
  // A stream that ended without a result was cut short somewhere in transit.
  if (!board) return plain();
  return board;
}

export const boardApi = {
  status: () => request('/status'),
  generate: generateBoardStream,
  regenerateSection: ({ brief, outline, index, note }) =>
    request('/section', { method: 'POST', body: { brief, outline, index, note } }).then((r) => r.section),
  edit: ({ message, outline, selection }) => request('/edit', { method: 'POST', body: { message, outline, selection } }),
};
