import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { config } from './config/env.js';
import { projectsRouter } from './routes/projects.js';
import { aiRouter } from './routes/ai.js';
import { assistantRouter } from './routes/assistant.js';
import { imagesRouter } from './routes/images.js';
import { assetsRouter } from './routes/assets.js';
import { exportRouter } from './routes/export.js';
import { notFound, errorHandler } from './middleware/error.js';
import { isMongoConnected } from './config/db.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(compression()); // gzip every JSON/SVG response — the AI ops payload and image search results both benefit
  // 25mb covers a few base64 reference photos on the /ai/generate path; every
  // other route's payload is tiny by comparison.
  app.use(express.json({ limit: '25mb' }));

  // Serve locally-stored assets & exports. Filenames are content-addressed
  // (nanoid, never reused), so a long cache lifetime is safe.
  app.use('/storage', express.static(`${config.storageRoot}`, { maxAge: '7d', immutable: true }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      mongo: isMongoConnected(),
      aiProvider: config.ai.provider,
      imageProvider: config.images.provider,
    });
  });

  app.use('/api/projects', projectsRouter);
  app.use('/api/ai', aiRouter);
  // Apollo AI — the general-purpose assistant. Separate from /api/ai on purpose:
  // that one compiles language into design operations, this one just talks.
  app.use('/api/assistant', assistantRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/export', exportRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
