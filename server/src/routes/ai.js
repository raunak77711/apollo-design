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
    const { message, document, referenceImages } = req.body || {};
    if (!validateDocument(document)) return res.status(400).json({ error: 'valid document is required' });

    const cleanReferenceImages = Array.isArray(referenceImages)
      ? referenceImages.filter((s) => typeof s === 'string').slice(0, 3)
      : [];
    const result = await buildDesign({
      message: message || 'Create a design',
      document,
      referenceImages: cleanReferenceImages,
    });
    const operations = result.operations.filter((op) => validateOperation(op).ok);
    const { document: preview, skipped } = applyOperations(document, operations);

    // The image generator was configured and attempted but had to fall back
    // to stock photography for at least one image — worth telling the user,
    // since it silently means no bespoke artwork (or logo) was produced.
    const imageNotice = result.imageFallbacks?.length
      ? "Couldn't generate bespoke artwork right now (Hugging Face is rate-limited or out of credits) — used stock photography instead."
      : null;

    res.json({ operations, message: result.message, preview, skipped, imageNotice });
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
