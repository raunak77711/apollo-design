import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { assets } from '../store/index.js';
import { saveBuffer, safeFilename } from '../services/storageService.js';

export const assetsRouter = Router();

// Keep uploads in memory; Sharp normalizes them before hitting disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  },
});

// POST /api/assets/upload  (multipart: file, projectId)
assetsRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const projectId = req.body.projectId || 'unassigned';

    // Never trust the client filename — generate a safe one and re-encode to webp.
    const filename = safeFilename(req.file.originalname, '.webp');
    const webp = await sharp(req.file.buffer).rotate().webp({ quality: 90 }).toBuffer();
    const meta = await sharp(webp).metadata();

    const saved = await saveBuffer(projectId, 'assets', filename, webp);
    const asset = await assets.create({
      projectId,
      type: 'image',
      provider: 'local',
      filename,
      path: saved.relativePath,
      url: saved.url,
      metadata: { width: meta.width, height: meta.height, format: 'webp' },
    });
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
});

// GET /api/assets/:id  (metadata)
assetsRouter.get('/:id', async (req, res) => {
  const asset = await assets.get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  res.json(asset);
});
