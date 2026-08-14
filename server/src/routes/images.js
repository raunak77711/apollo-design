import { Router } from 'express';
import { searchImages } from '../services/images/index.js';

export const imagesRouter = Router();

// GET /api/images/search?q=...  — cached, see services/images/index.js
imagesRouter.get('/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'q is required' });
    const perPage = Math.min(30, Number(req.query.perPage) || 12);
    const results = await searchImages(query, { perPage });
    res.json({ query, results });
  } catch (err) {
    next(err);
  }
});
