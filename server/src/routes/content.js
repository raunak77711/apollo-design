import { Router } from 'express';
import { getContentService } from '../services/content/index.js';
import { getTranscriptionService } from '../services/transcription/transcriptionService.js';

/**
 * Content Factory endpoints.
 *
 *   GET    /status                       is Whisper reachable, and how big a video may be
 *   GET    /sessions                     every session, newest first
 *   POST   /sessions                     { title? }
 *   GET    /sessions/:id
 *   PATCH  /sessions/:id                 { title }
 *   DELETE /sessions/:id
 *   PUT    /sessions/:id/video?name=x.mp4   the recording as the raw request body (streamed to disk)
 *   PUT    /sessions/:id/board           { boardId, title, spec }  link a Jam board snapshot
 *   DELETE /sessions/:id/board
 *   POST   /sessions/:id/process         { force? }  transcribe (cached) + tally, in the background
 *   POST   /sessions/:id/analyze         { force? }  find shorts and retakes (DeepSeek), in the background
 *   GET    /sessions/:id/analysis        retakes the detector saw, stats, warnings
 *   PATCH  /sessions/:id/settings        { aiDirector, framing, platform, captions, background }
 *   POST   /sessions/:id/media           find the speaker's head + build the preview copy (host worker)
 *   PATCH  /sessions/:id/candidates/:cid { status, title, note, captions, captionOverrides }   review: approve / reject / rename / caption fixes
 *   POST   .../candidates/:cid/trim      { start, end }  move the edges, snapped to words
 *   PUT    .../candidates/:cid/director  { events, source }  replace the edit (validated + grounded)
 *   POST   .../candidates/:cid/director/regenerate { ai? }   direct again (AI or rule-based)
 *   POST   /sessions/:id/director        { ai?, includeManual? }  direct every short again
 *   GET    .../candidates/:cid/props     exactly what the preview plays and the renderer renders
 *   GET    .../candidates/:cid/package   JSON hand-off for Claude / ChatGPT; /prompt is the same as text
 *   POST   .../candidates/:cid/render    queue a render; DELETE cancels; POST /sessions/:id/render queues every approved short
 *   GET    /sessions/:id/transcript
 *   GET    /sessions/:id/tally
 *
 * Errors carry a status and a sentence a person can act on; the shared error
 * middleware renders them.
 */

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createContentRouter({ service } = {}) {
  const router = Router();
  const svc = () => service || getContentService();

  router.get('/status', wrap(async (req, res) => {
    res.json({
      transcription: await getTranscriptionService().status(),
      render: await svc().renderStatus(),
      aiLive: svc().aiLive(),
      maxUploadBytes: svc().maxUploadBytes,
    });
  }));

  router.get('/sessions', wrap(async (req, res) => res.json({ sessions: await svc().listSessions() })));

  router.post('/sessions', wrap(async (req, res) => res.status(201).json(await svc().createSession({ title: req.body?.title }))));

  router.get('/sessions/:id', wrap(async (req, res) => res.json(await svc().getSession(req.params.id))));

  router.patch('/sessions/:id', wrap(async (req, res) => res.json(await svc().renameSession(req.params.id, req.body?.title))));

  router.delete('/sessions/:id', wrap(async (req, res) => {
    await svc().deleteSession(req.params.id);
    res.status(204).end();
  }));

  router.put('/sessions/:id/video', wrap(async (req, res) => {
    // The body is the file itself, not JSON: nothing may read it before the service streams it to disk.
    res.json(await svc().attachVideo(req.params.id, { body: req, fileName: req.query.name }));
  }));

  router.put('/sessions/:id/board', wrap(async (req, res) => res.json(await svc().attachBoard(req.params.id, req.body || {}))));
  router.delete('/sessions/:id/board', wrap(async (req, res) => res.json(await svc().unlinkBoard(req.params.id))));

  router.post('/sessions/:id/process', wrap(async (req, res) => {
    res.status(202).json(await svc().process(req.params.id, { force: req.body?.force === true }));
  }));

  router.post('/sessions/:id/analyze', wrap(async (req, res) => {
    res.status(202).json(await svc().analyze(req.params.id, { force: req.body?.force === true }));
  }));
  router.get('/sessions/:id/board', wrap(async (req, res) => res.json(await svc().getBoardOutline(req.params.id))));
  router.get('/sessions/:id/analysis', wrap(async (req, res) => res.json(await svc().getAnalysis(req.params.id))));

  router.patch('/sessions/:id/settings', wrap(async (req, res) => res.json(await svc().updateSettings(req.params.id, req.body))));
  router.post('/sessions/:id/media', wrap(async (req, res) => res.status(202).json(await svc().prepareMedia(req.params.id))));

  // Review and editing of one short.
  const cand = '/sessions/:id/candidates/:cid';
  router.patch(cand, wrap(async (req, res) => res.json(await svc().updateCandidate(req.params.id, req.params.cid, req.body || {}))));
  router.post(`${cand}/trim`, wrap(async (req, res) => res.json(await svc().trimCandidate(req.params.id, req.params.cid, req.body || {}))));
  router.put(`${cand}/director`, wrap(async (req, res) => res.json(await svc().setDirector(req.params.id, req.params.cid, req.body || {}))));
  router.post(`${cand}/director/regenerate`, wrap(async (req, res) => res.json(await svc().regenerateDirector(req.params.id, req.params.cid, { ai: typeof req.body?.ai === 'boolean' ? req.body.ai : undefined }))));
  router.post('/sessions/:id/director', wrap(async (req, res) => res.json({ regenerated: await svc().directAll(req.params.id, { ai: typeof req.body?.ai === 'boolean' ? req.body.ai : undefined, includeManual: req.body?.includeManual === true }), session: await svc().getSession(req.params.id) })));
  router.get(`${cand}/props`, wrap(async (req, res) => res.json(await svc().engineProps(req.params.id, req.params.cid))));
  router.get(`${cand}/package`, wrap(async (req, res) => res.json(await svc().exportPackage(req.params.id, req.params.cid))));
  router.get(`${cand}/prompt`, wrap(async (req, res) => res.type('text/plain').send(await svc().promptText(req.params.id, req.params.cid))));

  // Rendering.
  router.post(`${cand}/render`, wrap(async (req, res) => res.status(202).json(await svc().renderCandidate(req.params.id, req.params.cid))));
  router.delete(`${cand}/render`, wrap(async (req, res) => res.json(await svc().cancelRender(req.params.id, req.params.cid))));
  router.post('/sessions/:id/render', wrap(async (req, res) => res.status(202).json(await svc().renderApproved(req.params.id))));

  router.get('/sessions/:id/transcript', wrap(async (req, res) => res.json(await svc().getTranscript(req.params.id))));
  router.get('/sessions/:id/tally', wrap(async (req, res) => res.json(await svc().getTally(req.params.id))));

  return router;
}
