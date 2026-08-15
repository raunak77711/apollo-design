import { Router } from 'express';
import { runAIEdit, runVariations } from '../services/aiService.js';
import { buildDesign } from '../services/designService.js';
import { validateDocument } from '../design/schema.js';
import { validateOperation, applyOperations } from '../design/operations.js';

export const aiRouter = Router();

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
    const { message, document } = req.body || {};
    if (!validateDocument(document)) return res.status(400).json({ error: 'valid document is required' });

    const result = await buildDesign({ message: message || 'Create a design', document });
    const operations = result.operations.filter((op) => validateOperation(op).ok);
    const { document: preview, skipped } = applyOperations(document, operations);
    res.json({ operations, message: result.message, preview, skipped });
  } catch (err) {
    next(err);
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
