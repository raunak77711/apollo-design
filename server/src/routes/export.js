import { Router } from 'express';
import { exportDesign } from '../services/exportService.js';
import { validateDocument } from '../design/schema.js';

export const exportRouter = Router();

// POST /api/export  { projectId, document, format }
exportRouter.post('/', async (req, res, next) => {
  try {
    const { projectId = 'unassigned', document, format = 'png', quality } = req.body || {};
    if (!validateDocument(document)) return res.status(400).json({ error: 'valid document is required' });
    if (!['png', 'jpg', 'jpeg', 'webp'].includes(format)) {
      return res.status(400).json({ error: 'format must be png, jpg, or webp' });
    }
    const saved = await exportDesign({ projectId, document, format, quality });
    res.json({ url: saved.url, path: saved.relativePath });
  } catch (err) {
    next(err);
  }
});
