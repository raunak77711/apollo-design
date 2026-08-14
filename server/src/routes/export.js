import { Router } from 'express';
import { exportDesign, renderToDataUri } from '../services/exportService.js';
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

// POST /api/export/flatten  { document }  ->  { dataUrl }
// Rasterizes a handful of layers (already re-based to a small canvas) into a
// single transparent PNG, for the Layers panel's Merge/Flatten commands.
exportRouter.post('/flatten', async (req, res, next) => {
  try {
    const { document } = req.body || {};
    if (!validateDocument(document)) return res.status(400).json({ error: 'valid document is required' });
    if (document.canvas.width > 4000 || document.canvas.height > 4000) {
      return res.status(400).json({ error: 'flatten area is too large' });
    }
    const dataUrl = await renderToDataUri(document);
    res.json({ dataUrl });
  } catch (err) {
    next(err);
  }
});
