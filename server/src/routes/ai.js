import { Router } from 'express';
import { runAIEdit } from '../services/aiService.js';
import { validateDocument } from '../design/schema.js';

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
    const result = await runAIEdit({ message, document, selectedElementId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// /generate is an alias focused on creating a design from scratch.
aiRouter.post('/generate', async (req, res, next) => {
  try {
    const { message, document, selectedElementId } = req.body || {};
    if (!validateDocument(document)) return res.status(400).json({ error: 'valid document is required' });
    const result = await runAIEdit({ message: message || 'Create a design', document, selectedElementId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
