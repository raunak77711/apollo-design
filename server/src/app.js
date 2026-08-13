import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { projectsRouter } from './routes/projects.js';
import { aiRouter } from './routes/ai.js';
import { imagesRouter } from './routes/images.js';
import { assetsRouter } from './routes/assets.js';
import { exportRouter } from './routes/export.js';
import { notFound, errorHandler } from './middleware/error.js';
import { isMongoConnected } from './config/db.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '5mb' }));

  // Serve locally-stored assets & exports.
  app.use('/storage', express.static(`${config.storageRoot}`));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, mongo: isMongoConnected(), aiProvider: config.ai.provider, imageProvider: config.images.provider });
  });

  app.use('/api/projects', projectsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/export', exportRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
