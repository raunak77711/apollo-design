import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { config } from './config/env.js';
import { getContentService } from './services/content/index.js';
import { getDistributionService } from './services/distribution/index.js';

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

  // Distribution: reconcile against each platform's real state before anything is retried (never
  // double-post), catch up any analytics that went stale while Apollo was offline, then keep
  // ticking — publishing due local-queue jobs and refreshing analytics — for as long as the
  // process runs. A 2-3 hour window is the expected shape of a run, not an all-day server.
  const distribution = getDistributionService();
  distribution
    .runOnlineCycle()
    .catch((err) => console.warn('[distribution] startup cycle failed:', err.message));
  setInterval(() => {
    distribution.tick().catch((err) => console.warn('[distribution] tick failed:', err.message));
  }, config.distribution.tickIntervalMs).unref();
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
