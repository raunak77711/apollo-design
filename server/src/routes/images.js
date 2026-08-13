import { Router } from 'express';
import { getImageProvider } from '../services/images/index.js';

export const imagesRouter = Router();

// GET /api/images/search?q=...
imagesRouter.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'q is required' });
    const perPage = Math.min(30, Number(req.query.perPage) || 12);
    const results = await getImageProvider().search(query, { perPage });
    res.json({ query, results });
  } catch (err) {
    next(err);
  }
});
