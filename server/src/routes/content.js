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

  router.get('/sessions/:id/transcript', wrap(async (req, res) => res.json(await svc().getTranscript(req.params.id))));
  router.get('/sessions/:id/tally', wrap(async (req, res) => res.json(await svc().getTally(req.params.id))));

  return router;
}
