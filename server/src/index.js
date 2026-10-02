import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { config } from './config/env.js';
import { getContentService } from './services/content/index.js';

async function main() {
  await connectDatabase(); // non-fatal if Mongo is down (in-memory fallback)
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] Apollo Design API listening on http://localhost:${config.port}`);
  });
  // A long-form recording is gigabytes: Node's default 5-minute cap on receiving one
  // request would cut a slow upload off halfway.
  server.requestTimeout = 0;
  getContentService()
    .recoverInterrupted()
    .catch((err) => console.warn('[content] could not check interrupted sessions:', err.message));
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
