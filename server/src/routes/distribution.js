import { Router } from 'express';
import { getDistributionService } from '../services/distribution/index.js';

/**
 * Distribution endpoints: batches of recordings, the deduplicated+classified asset
 * pool, connected platform accounts, scheduling/publishing, analytics and the
 * research-to-brief step.
 *
 *   GET    /status                          per-platform configured/capability summary
 *   POST   /batches                         { title, sessionIds? }
 *   GET    /batches                         GET /batches/:id        PATCH /batches/:id { title }
 *   POST   /batches/:id/sessions            { sessionId }           DELETE /batches/:id/sessions/:sessionId
 *   POST   /batches/:id/sync                promote newly approved+rendered shorts, re-run cross-video dedup
 *   GET    /batches/:id/assets?all=1        the unique (or, with ?all=1, every) asset in the batch
 *   GET    /assets/:id                      PATCH /assets/:id { title, description, tags, classification, status }
 *   GET    /accounts                        connected platform accounts (never returns a token)
 *   GET    /accounts/:platform/auth-url     ?redirectUri=  -> { url }
 *   POST   /accounts/:platform/connect      { code, redirectUri }
 *   POST   /accounts/instagram/link         { facebookAccountId }  (Instagram has no OAuth of its own)
 *   DELETE /accounts/:id
 *   POST   /publications                    { assetId, accountId, platform, scheduledFor? } — schedule or publish now
 *   GET    /publications?batchId=&status=    the calendar
 *   POST   /publications/:id/cancel         POST /publications/:id/retry
 *   GET    /publications/:id/analytics
 *   GET    /batches/:id/learning            Publication -> asset -> funnel/hook/archetype/source, rolled up
 *   POST   /research/brief                  { topic, notes? } — a draft brief for the Jam board (DeepSeek only, unverified)
 *   POST   /cycle                           run one online cycle now (reconcile + catch-up analytics + tick) — normally automatic
 */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createDistributionRouter({ service } = {}) {
  const router = Router();
  const svc = () => service || getDistributionService();

  router.get('/status', wrap(async (req, res) => res.json({ platforms: svc().platformStatus() })));

  router.post('/batches', wrap(async (req, res) => res.status(201).json(await svc().createBatch(req.body || {}))));
  router.get('/batches', wrap(async (req, res) => res.json({ batches: await svc().listBatches() })));
  router.get('/batches/:id', wrap(async (req, res) => res.json(await svc().getBatch(req.params.id))));
  router.patch('/batches/:id', wrap(async (req, res) => res.json(await svc().renameBatch(req.params.id, req.body?.title))));
  router.delete('/batches/:id', wrap(async (req, res) => { await svc().deleteBatch(req.params.id); res.status(204).end(); }));
  router.post('/batches/:id/sessions', wrap(async (req, res) => res.json(await svc().addSession(req.params.id, req.body?.sessionId))));
  router.delete('/batches/:id/sessions/:sessionId', wrap(async (req, res) => res.json(await svc().removeSession(req.params.id, req.params.sessionId))));
  router.post('/batches/:id/sync', wrap(async (req, res) => res.json(await svc().syncBatch(req.params.id))));
  router.get('/batches/:id/assets', wrap(async (req, res) => res.json({ assets: await svc().listAssets(req.params.id, { includeDuplicates: req.query.all === '1' }) })));
  router.get('/batches/:id/learning', wrap(async (req, res) => res.json(await svc().learningReport(req.params.id))));

  router.get('/assets/:id', wrap(async (req, res) => res.json(await svc().getAsset(req.params.id))));
  router.patch('/assets/:id', wrap(async (req, res) => res.json(await svc().updateAsset(req.params.id, req.body || {}))));

  router.get('/accounts', wrap(async (req, res) => res.json({ accounts: await svc().listAccounts() })));
  router.get('/accounts/:platform/auth-url', wrap(async (req, res) => res.json({ url: svc().authUrl(req.params.platform, { redirectUri: req.query.redirectUri, state: req.query.state || '' }) })));
  router.post('/accounts/:platform/connect', wrap(async (req, res) => res.json(await svc().connectAccount(req.params.platform, req.body || {}))));
  router.post('/accounts/instagram/link', wrap(async (req, res) => res.json(await svc().linkInstagram(req.body?.facebookAccountId))));
  router.delete('/accounts/:id', wrap(async (req, res) => { await svc().disconnectAccount(req.params.id); res.status(204).end(); }));

  router.post('/publications', wrap(async (req, res) => res.status(202).json(await svc().schedulePublication(req.body || {}))));
  router.get('/publications', wrap(async (req, res) => res.json({ publications: await svc().listPublications(req.query) })));
  router.post('/publications/:id/cancel', wrap(async (req, res) => res.json(await svc().cancelPublication(req.params.id))));
  router.post('/publications/:id/retry', wrap(async (req, res) => res.json(await svc().retryPublication(req.params.id))));
  router.get('/publications/:id/analytics', wrap(async (req, res) => res.json(await svc().getPublicationAnalytics(req.params.id))));

  router.post('/research/brief', wrap(async (req, res) => res.json(await svc().draftBrief(req.body || {}))));

  router.post('/cycle', wrap(async (req, res) => res.json(await svc().runOnlineCycle())));

  return router;
}
