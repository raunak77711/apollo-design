import { Router } from 'express';
import { getAIProvider } from '../services/ai/index.js';
import { normalizeOutline } from '../design/board/schema.js';
import { BoardError, checkBrief, editBoard, generateBoard, generateSection } from '../services/boardService.js';

/**
 * Jam board endpoints.
 *
 * Same shape as Apollo AI's: a streamed route that narrates progress, and a
 * plain route that returns the finished result, kept because a proxy that
 * buffers or a browser without streaming bodies should cost a person the live
 * progress and nothing else. Provider names and status codes never reach the
 * browser.
 */

/** Upstream failures, said in a way a person can act on. */
function friendlyError(err) {
  if (err instanceof BoardError) return { status: err.status, error: err.message };
  if (err?.name === 'NotConfiguredError') {
    return { status: 503, error: 'Jam board needs a DeepSeek key to generate. Add DEEPSEEK_API_KEY, or open the example board.' };
  }
  const status = err?.status;
  if (status === 429) return { status: 429, error: 'Apollo is handling a lot of requests right now. Try again in a moment.' };
  if (status === 401 || status === 402 || status === 403) {
    return { status: 503, error: 'Board generation is unavailable right now. This looks like a configuration problem on our side.' };
  }
  if (err?.name === 'TimeoutError') return { status: 504, error: 'The model took too long to answer. Try again.' };
  return { status: 502, error: "Apollo couldn't finish that board. Try again." };
}

export function createBoardRouter({ provider } = {}) {
  const router = Router();
  const getProvider = () => provider || getAIProvider();

  router.get('/status', (req, res) => {
    const p = getProvider();
    res.json({ ready: p.live === true, model: p.live ? p.model || 'deepseek' : 'offline' });
  });

  router.post('/generate/stream', async (req, res) => {
    const { brief } = req.body || {};
    const problem = checkBrief(brief);
    if (problem) return res.status(400).json({ error: problem });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` stops the compression middleware buffering the stream
      // into one lump at the end; the other two say the same to every proxy.
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    res.flushHeaders?.();

    // Watch the *response*: `req` closes as soon as the body is read. When the
    // person leaves, the abort must reach the model or we keep paying for tokens.
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
      const board = await generateBoard({
        brief,
        provider: getProvider(),
        signal: abort.signal,
        onEvent: (event, data) => send(event, data),
      });
      send('result', { board });
    } catch (err) {
      if (err?.name !== 'AbortError' && open) {
        console.error('[board]', err.message);
        send('failed', { error: friendlyError(err).error });
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  });

  router.post('/generate', async (req, res) => {
    const { brief } = req.body || {};
    const problem = checkBrief(brief);
    if (problem) return res.status(400).json({ error: problem });
    try {
      res.json({ board: await generateBoard({ brief, provider: getProvider() }) });
    } catch (err) {
      console.error('[board]', err.message);
      const { status, error } = friendlyError(err);
      res.status(status).json({ error });
    }
  });

  router.post('/section', async (req, res) => {
    const { brief, index } = req.body || {};
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    const problem = checkBrief(brief);
    if (problem) return res.status(400).json({ error: problem });
    const outline = normalizeOutline(req.body?.outline);
    if (!outline) return res.status(400).json({ error: 'outline is required' });
    if (!Number.isInteger(index) || index < 0 || index >= outline.sections.length) {
      return res.status(400).json({ error: 'index is out of range' });
    }
    try {
      res.json({ section: await generateSection({ brief, outline, index, note, provider: getProvider() }) });
    } catch (err) {
      console.error('[board]', err.message);
      const { status, error } = friendlyError(err);
      res.status(status).json({ error });
    }
  });

  router.post('/edit', async (req, res) => {
    const { message, outline, selection } = req.body || {};
    try {
      const result = await editBoard({ message, outline, selection, provider: getProvider() });
      res.json({ operations: result.operations, message: result.message });
    } catch (err) {
      if (!(err instanceof BoardError)) console.error('[board]', err.message);
      const { status, error } = friendlyError(err);
      res.status(status).json({ error });
    }
  });

  return router;
}

export const boardRouter = createBoardRouter();
