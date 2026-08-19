import { Router } from 'express';
import { runAIEdit, runVariations } from '../services/aiService.js';
import { buildDesign } from '../services/designService.js';
import { normalizePreferences } from '../design/preferences.js';
import { validateDocument } from '../design/schema.js';
import { validateOperation, applyOperations } from '../design/operations.js';

export const aiRouter = Router();

/** The shared body handling for both generate routes. */
function readGenerateRequest(body = {}) {
  const { message, document, referenceImages, preferences } = body;
  if (!validateDocument(document)) return { error: 'valid document is required' };
  return {
    message: message || 'Create a design',
    document,
    referenceImages: Array.isArray(referenceImages)
      ? referenceImages.filter((s) => typeof s === 'string').slice(0, 3)
      : [],
    preferences: normalizePreferences(preferences),
  };
}

/** Turn a finished build into the response body both routes return. */
function generateResult(result, document) {
  const operations = result.operations.filter((op) => validateOperation(op).ok);
  const { document: preview, skipped } = applyOperations(document, operations);
  return { operations, message: result.message, preview, skipped };
}

/**
 * POST /api/ai/chat
 * body: { message, document, selectedElementId }
 * Returns validated operations + a preview document. The client applies the
 * operations locally through its own operation system (one undo entry).
 */
aiRouter.post('/chat', async (req, res, next) => {
  try {
    const { message, document, selectedElementId } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!validateDocument(document)) {
      return res.status(400).json({ error: 'valid document is required' });
    }
    res.json(await runAIEdit({ message, document, selectedElementId }));
  } catch (err) {
    next(err);
  }
});

/** POST /api/ai/generate — always takes the full art-direction pipeline. */
aiRouter.post('/generate', async (req, res, next) => {
  try {
    const request = readGenerateRequest(req.body);
    if (request.error) return res.status(400).json({ error: request.error });
    res.json(generateResult(await buildDesign(request), request.document));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/generate/stream — the same build, narrated.
 *
 * Identical result to `/generate`, but each pipeline boundary is pushed to the
 * client as it is crossed so the generation screen can say what Apollo is
 * actually doing. Server-sent events over POST, because the request carries the
 * whole document (and possibly reference images) and EventSource can only GET.
 *
 * The client falls back to `/generate` if this stream fails for any reason, so
 * nothing here is load-bearing for a design actually getting made.
 */
aiRouter.post('/generate/stream', async (req, res) => {
  const request = readGenerateRequest(req.body);
  if (request.error) return res.status(400).json({ error: request.error });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // `no-transform` is what stops the compression middleware buffering the
    // stream into uselessness; `no-cache` and the nginx hint do the same for
    // every proxy in between.
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });

  let open = true;
  const send = (event, data) => {
    if (!open || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Watch the *response*, not the request. `req` emits 'close' as soon as
  // express.json() has drained the body — seconds before the design is built —
  // so listening there would silence every stage after the first.
  res.on('close', () => {
    open = false;
  });

  send('stage', { stage: 'understanding' });

  try {
    const result = await buildDesign({
      ...request,
      onStage: (stage, detail) => send('stage', { stage, ...detail }),
    });
    send('result', generateResult(result, request.document));
  } catch (err) {
    send('failed', { error: err.message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/**
 * POST /api/ai/variations — three directions for one brief.
 * Each is a complete, independently art-directed design, not a recolour.
 */
aiRouter.post('/variations', async (req, res, next) => {
  try {
    const { message, document } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });
    if (!validateDocument(document)) return res.status(400).json({ error: 'valid document is required' });
    res.json(await runVariations({ message, document }));
  } catch (err) {
    next(err);
  }
});
