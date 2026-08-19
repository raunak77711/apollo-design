import { Router } from 'express';
import { streamReply } from '../services/assistantService.js';
import { config } from '../config/env.js';

export const assistantRouter = Router();

/**
 * Apollo AI's endpoints. Two of them, and the second is the first without the
 * streaming — kept because a proxy that buffers, a browser without streaming
 * request bodies, or a stalled stream should cost a user their live typing
 * effect and nothing else.
 *
 * Provider keys never leave this process; the client only ever sees prose.
 */

/**
 * Upstream failures, said in a way a person can act on.
 *
 * The raw message still goes to the server log — it just never goes to the
 * browser, where "DeepSeek API error 401" is both a support ticket and a hint
 * about infrastructure nobody outside needs.
 */
function friendlyError(err) {
  const status = err?.status;
  if (status === 400) return { status: 400, error: err.message };
  if (status === 429) return { status: 429, error: 'Apollo AI is handling a lot of requests right now. Try again in a moment.' };
  if (status === 401 || status === 402 || status === 403) {
    return { status: 503, error: 'Apollo AI is unavailable right now. This looks like a configuration problem on our side.' };
  }
  if (err?.name === 'TimeoutError') return { status: 504, error: 'Apollo AI took too long to answer. Try again.' };
  return { status: 502, error: "Apollo AI couldn't complete that response. Try again." };
}

/** Which assistant the client is actually talking to, for the interface to say so honestly. */
assistantRouter.get('/status', (req, res) => {
  const live = config.ai.provider === 'deepseek' && Boolean(config.ai.deepseek.apiKey);
  res.json({
    ready: live,
    model: live ? config.ai.deepseek.model : 'offline',
  });
});

/**
 * POST /api/assistant/chat/stream
 * body: { messages: [{ role, content }], context? }
 *
 * Server-sent events over POST — the transcript is the request body, and
 * EventSource can only GET. Three event types: `delta` carries text,
 * `done` closes the turn, `failed` carries a human-readable reason.
 */
assistantRouter.post('/chat/stream', async (req, res) => {
  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // `no-transform` is what stops the compression middleware buffering a
    // token stream into one useless lump at the end; the other two say the
    // same thing to every proxy between here and the browser.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders?.();

  // When the user hits Stop the browser drops the request. That must actually
  // reach the model provider — otherwise we keep paying for tokens nobody will
  // ever see.
  const abort = new AbortController();
  let open = true;
  res.on('close', () => {
    open = false;
    abort.abort();
  });

  const send = (event, data) => {
    if (!open || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { text } = await streamReply({
      messages,
      context,
      signal: abort.signal,
      onToken: (chunk) => send('delta', { text: chunk }),
    });

    // A stream that ran clean but produced nothing is a failure with a polite
    // face on it, and the client should be told so rather than shown a blank.
    if (!text.trim()) send('failed', { error: 'Apollo AI returned an empty response. Try asking again.' });
    else send('done', { text });
  } catch (err) {
    // The user navigating away or pressing Stop is not an error worth naming.
    if (err?.name !== 'AbortError' && open) {
      console.error('[assistant]', err.message);
      send('failed', friendlyError(err));
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/** POST /api/assistant/chat — same turn, delivered whole. The fallback path. */
assistantRouter.post('/chat', async (req, res) => {
  const { messages, context } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages is required' });
  }

  try {
    const { text } = await streamReply({ messages, context });
    if (!text.trim()) {
      return res.status(502).json({ error: 'Apollo AI returned an empty response. Try asking again.' });
    }
    res.json({ text });
  } catch (err) {
    console.error('[assistant]', err.message);
    const { status, error } = friendlyError(err);
    res.status(status).json({ error });
  }
});
