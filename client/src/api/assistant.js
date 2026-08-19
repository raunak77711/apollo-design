/**
 * Apollo AI's client. The one place the interface knows anything about how the
 * assistant is reached — swapping the model, or the transport, stops here.
 */

/** What we say when the server said something we would rather not repeat. */
const GENERIC_FAILURE = "Apollo AI couldn't complete that response. Try again.";

/** Errors the UI can branch on without string-matching. */
export class AssistantError extends Error {
  constructor(message, { kind = 'failed' } = {}) {
    super(message || GENERIC_FAILURE);
    this.name = 'AssistantError';
    this.kind = kind; // 'failed' | 'network' | 'aborted'
  }
}

/** Whether a live model is configured, so the interface can say so honestly. */
export async function assistantStatus() {
  try {
    const res = await fetch('/api/assistant/status');
    if (!res.ok) return { ready: false, model: null };
    return await res.json();
  } catch {
    return { ready: false, model: null };
  }
}

/**
 * Send a turn and stream the answer back.
 *
 * `onDelta(chunk)` fires per fragment; the promise resolves with the full text.
 * `signal` is how Stop works — aborting drops the request, which the server
 * notices and passes on to the provider, so stopping actually stops.
 *
 * If the stream is unavailable for any reason — a proxy that buffers, a browser
 * without streaming response bodies, an older server — this falls back to the
 * whole-answer route. The user loses the live typing, never the answer.
 */
export async function streamAssistant({ messages, context, onDelta, signal }) {
  let res;
  try {
    res = await fetch('/api/assistant/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages, context }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new AssistantError('Stopped', { kind: 'aborted' });
    throw new AssistantError('Apollo AI is unreachable. Check your connection and try again.', {
      kind: 'network',
    });
  }

  if (!res.ok) {
    // A 4xx that isn't 404 is a real answer to a real problem, and its message
    // is already written for a person. Everything else falls through to the
    // plain route, which is also how a server without this endpoint replies.
    if (res.status !== 404 && res.status >= 400 && res.status < 500) {
      const data = await res.json().catch(() => ({}));
      throw new AssistantError(data.error);
    }
    return sendAssistant({ messages, context, signal });
  }
  if (!res.body) return sendAssistant({ messages, context, signal });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let failure = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
        const raw = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!event || !raw) continue;

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          continue;
        }

        if (event === 'delta' && typeof data.text === 'string') {
          text += data.text;
          onDelta?.(data.text);
        } else if (event === 'done') {
          // The server's copy is authoritative — it survived a frame we may
          // have failed to parse.
          if (typeof data.text === 'string' && data.text.length >= text.length) text = data.text;
        } else if (event === 'failed') {
          failure = data.error || GENERIC_FAILURE;
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) {
      // Whatever arrived before Stop is still the user's; hand it back.
      return { text, stopped: true };
    }
    throw new AssistantError('The connection to Apollo AI was lost mid-answer.', { kind: 'network' });
  } finally {
    reader.cancel().catch(() => {});
  }

  if (signal?.aborted) return { text, stopped: true };
  // A failure that arrives after real text is a truncation, not a dead turn —
  // keeping the text and surfacing the reason beats throwing the answer away.
  if (failure && !text) throw new AssistantError(failure);
  return { text, stopped: false, warning: failure || null };
}

/** The whole answer in one response. The stream's fallback. */
async function sendAssistant({ messages, context, signal }) {
  let res;
  try {
    res = await fetch('/api/assistant/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new AssistantError('Stopped', { kind: 'aborted' });
    throw new AssistantError('Apollo AI is unreachable. Check your connection and try again.', {
      kind: 'network',
    });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new AssistantError(data.error);
  }
  const data = await res.json();
  return { text: data.text || '', stopped: false };
}
