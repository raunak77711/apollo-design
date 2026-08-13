import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { config } from './config/env.js';

async function main() {
  await connectDatabase(); // non-fatal if Mongo is down (in-memory fallback)
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[server] Apollo Design API listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
