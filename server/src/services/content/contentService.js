import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeBlock } from '../../design/board/schema.js';
import { buildBoardIndex } from './boardIndex.js';
import { TALLY_VERSION, tallyBoard } from './boardTally.js';
import { AnalysisError, analyzeTranscript } from './analysis/analyze.js';
import { boardMatchesFor } from './analysis/candidate.js';
import { PROMPT_VERSION } from './analysis/prompts.js';
import { extensionOf, storeUpload } from './uploadVideo.js';

/**
 * Content Factory sessions: one long-form recording, the Jam board it follows, its
 * transcript, and the tally that ties the two together.
 *
 *   createSession -> upload the video -> link a board -> process
 *   process = transcribe (cached by the video's hash) -> tally the board against the words
 *
 * Processing runs in the background and writes its progress into the session, so the
 * page just polls the session. Nothing here talks to a model yet; analysis comes next.
 */

export class ContentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const GB = 1024 ** 3;
const MAX_BOARD_BYTES = 6 * 1024 * 1024;
const ID_SECTION = /^s\d{1,3}$/;
const ID_BLOCK = /^s\d{1,3}\.b\d{1,3}$/;

const idle = () => ({ status: 'not_started' });

export const DEFAULT_TITLE = 'Untitled recording';

export function newSessionRecord(title) {
  return {
    title: String(title || '').trim().slice(0, 120) || DEFAULT_TITLE,
    source: null,
    board: null,
    transcription: idle(),
    tally: idle(),
    analysis: idle(),
    candidates: [],
  };
}

/** What the browser gets: the session plus a playable URL for its video and review counts. */
export function publicSession(session) {
  const counts = { candidates: 0, approved: 0, rejected: 0 };
  for (const c of session.candidates || []) {
    counts.candidates += 1;
    if (c.status === 'approved') counts.approved += 1;
    if (c.status === 'rejected') counts.rejected += 1;
  }
  return {
    ...session,
    source: session.source ? { ...session.source, url: `/storage/content/sessions/${session.id}/${session.source.storedName}` } : null,
    counts,
  };
}

/** A board snapshot from the browser, made safe: block content is re-validated, ids are kept exactly as given. */
export function sanitizeBoardSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.sections)) throw new ContentError(400, 'That board has no sections.');
  if (JSON.stringify(raw).length > MAX_BOARD_BYTES) throw new ContentError(413, 'That board is too large to link.');
  const sections = [];
  for (const rs of raw.sections.slice(0, 60)) {
    if (!rs || !ID_SECTION.test(String(rs.id))) continue;
    const blocks = [];
    for (const rb of Array.isArray(rs.blocks) ? rs.blocks.slice(0, 40) : []) {
      if (!rb || !ID_BLOCK.test(String(rb.id))) continue;
      const clean = normalizeBlock(rb);
      if (clean) blocks.push({ ...clean, id: rb.id });
    }
    if (!blocks.length) continue;
    sections.push({
      id: rs.id,
      title: String(rs.title || '').slice(0, 80),
      beat: String(rs.beat || '').slice(0, 200),
      density: Number.isFinite(rs.density) ? rs.density : 3,
      ...(typeof rs.kicker === 'string' && rs.kicker ? { kicker: rs.kicker.slice(0, 24) } : {}),
      blocks,
    });
  }
  if (!sections.length) throw new ContentError(400, 'That board has nothing Content Factory can read yet.');
  return { version: 1, title: String(raw.title || '').slice(0, 80), audience: String(raw.audience || '').slice(0, 80), sections };
}

/**
 * Re-analysis must never undo a person's review. Candidates are matched by id (a hash of the clip's
 * source times), so a clip found again keeps its status; a reviewed clip that is no longer found is
 * kept, marked stale, rather than silently disappearing; an unreviewed one that vanished is dropped.
 */
export function mergeCandidates(existing = [], fresh = []) {
  const old = new Map(existing.map((c) => [c.id, c]));
  const merged = fresh.map((c) => {
    const prior = old.get(c.id);
    if (!prior) return c;
    const { status, reviewedAt, note, edits } = prior;
    return { ...c, status: status || 'pending', ...(reviewedAt ? { reviewedAt } : {}), ...(note ? { note } : {}), ...(edits ? { edits } : {}) };
  });
  const seen = new Set(fresh.map((c) => c.id));
  for (const c of existing) {
    if (!seen.has(c.id) && c.status && c.status !== 'pending') merged.push({ ...c, stale: true });
  }
  return merged.sort((a, b) => a.sourceStart - b.sourceStart);
}

export function createContentService({ store, transcription, getProvider = () => null, llmCache = null, maxUploadBytes = 20 * GB, log = console }) {
  const running = new Set();

  const sessionVideoPath = (session) => path.join(store.dirFor(session.id), session.source.storedName);

  async function loadTranscript(session) {
    if (!session.source) return null;
    const hit = await transcription.getCached(session.source.sha256);
    return hit?.transcript || null;
  }

  /** Tally the linked board against the transcript, store it beside the session, and record the headline numbers. */
  async function computeTally(id) {
    const session = await store.get(id);
    const snapshot = await store.readJson(id, 'board.json');
    const transcript = await loadTranscript(session);
    if (!snapshot || !transcript) return null;

    const index = buildBoardIndex(snapshot.spec);
    const tally = tallyBoard(index, transcript);
    const key = { sourceHash: session.source.sha256, boardHash: index.hash, version: TALLY_VERSION };
    await store.writeJson(id, 'tally.json', { key, tally });
    await store.update(id, (s) => {
      s.tally = { status: 'complete', computedAt: new Date().toISOString(), ...tally.stats, key };
    });
    return tally;
  }

  /** Board matches are the tally read through each clip's kept stretches: cheap, so they follow the board with no model call. */
  async function refreshBoardMatches(id) {
    const session = await store.get(id);
    if (!session.candidates?.length) return;
    const tally = (await store.readJson(id, 'tally.json'))?.tally || null;
    await store.update(id, (x) => {
      for (const c of x.candidates) c.boardMatches = boardMatchesFor(tally, c.sourceSegments);
    });
  }

  /** Find the shorts. Failures are recorded on the session, never thrown into the page's face. */
  async function runAnalysis(id, { force }) {
    const provider = getProvider();
    const session = await store.get(id);
    if (!provider?.live) {
      await store.update(id, (s) => {
        s.analysis = { status: 'not_started', reason: 'Add a DeepSeek key (DEEPSEEK_API_KEY) to find shorts.' };
      });
      return;
    }
    const key = { sourceHash: session.source.sha256, promptVersion: PROMPT_VERSION, model: provider.model || 'deepseek' };
    const same = session.analysis?.key && JSON.stringify(session.analysis.key) === JSON.stringify(key);
    if (!force && session.analysis?.status === 'complete' && same) return;

    await store.update(id, (s) => {
      s.analysis = { status: 'processing', progress: 0, startedAt: new Date().toISOString(), key };
    });
    try {
      const transcript = await loadTranscript(session);
      if (!transcript) throw new AnalysisError('Transcribe the video first.', 409);
      const snapshot = await store.readJson(id, 'board.json');
      const tally = (await store.readJson(id, 'tally.json'))?.tally || null;
      const result = await analyzeTranscript({
        transcript,
        boardIndex: snapshot ? buildBoardIndex(snapshot.spec) : null,
        tally,
        provider,
        cache: llmCache,
        title: session.title,
        audience: snapshot?.spec?.audience || '',
        sourceHash: session.source.sha256,
        onProgress: ({ done, total }) => {
          store.update(id, (s) => { if (s.analysis.status === 'processing') s.analysis.progress = Math.round((done / total) * 100) / 100; }).catch(() => {});
        },
      });
      await store.writeJson(id, 'analysis.json', { key, retakes: result.retakes, stats: result.stats, warnings: result.warnings });
      await store.update(id, (s) => {
        s.candidates = mergeCandidates(s.candidates, result.candidates);
        s.analysis = {
          status: 'complete',
          finishedAt: new Date().toISOString(),
          key,
          model: result.model,
          windows: result.stats.windows,
          cachedWindows: result.stats.cachedWindows,
          modelCalls: result.stats.modelCalls,
          proposed: result.stats.proposed,
          retakes: result.retakes.length,
          warnings: result.warnings,
        };
      });
    } catch (err) {
      log.error?.('[content] analysis failed:', err.message);
      await store.update(id, (s) => {
        s.analysis = { status: 'failed', error: err instanceof AnalysisError ? err.message : "Apollo couldn't finish looking for shorts. Try again in a moment.", key };
      }).catch(() => {});
    }
  }

  async function run(id, { force }) {
    let lastWrite = 0;
    try {
      const session = await store.get(id);
      const result = await transcription.transcribeVideo(sessionVideoPath(session), {
        force,
        sourceHash: session.source.sha256,
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastWrite < 1000) return;
          lastWrite = now;
          store.update(id, (s) => { s.transcription.progress = Math.round(p * 1000) / 1000; }).catch(() => {});
        },
      });
      const { transcript } = result;
      await store.update(id, (s) => {
        s.transcription = {
          status: 'complete',
          progress: 1,
          cached: result.cached,
          finishedAt: new Date().toISOString(),
          duration: transcript.duration,
          segments: transcript.segments.length,
          words: transcript.segments.reduce((n, seg) => n + seg.words.length, 0),
          model: transcript.meta?.model,
          device: transcript.meta?.device,
          realtimeFactor: transcript.meta?.realtimeFactor,
        };
      });
      await computeTally(id);
      await runAnalysis(id, { force: false });
    } catch (err) {
      log.error?.('[content] processing failed:', err.message);
      await store.update(id, (s) => {
        s.transcription = { status: 'failed', error: err.message || 'Processing failed.' };
      }).catch(() => {});
    } finally {
      running.delete(id);
    }
  }

  return {
    store,
    maxUploadBytes,

    async createSession({ title } = {}) {
      return publicSession(await store.create(newSessionRecord(title)));
    },

    async listSessions() {
      // The list needs counts, not every clip's transcript.
      return (await store.list()).map((x) => ({ ...publicSession(x), candidates: undefined }));
    },

    async getSession(id) {
      return publicSession(await store.get(id));
    },

    async renameSession(id, title) {
      const name = String(title || '').trim().slice(0, 120);
      if (!name) throw new ContentError(400, 'Give the session a name.');
      return publicSession(await store.update(id, (s) => { s.title = name; }));
    },

    async deleteSession(id) {
      if (running.has(id)) throw new ContentError(409, 'This session is still processing. Wait for it to finish.');
      await store.remove(id);
    },

    /** Store the uploaded recording. `body` is the request stream; `fileName` gives the extension. */
    async attachVideo(id, { body, fileName }) {
      const session = await store.get(id);
      if (running.has(id)) throw new ContentError(409, 'This session is processing. Wait for it to finish before replacing the video.');
      const ext = extensionOf(fileName);
      const stored = await storeUpload(body, { dir: store.dirFor(id), ext, maxBytes: maxUploadBytes });

      const previous = session.source?.storedName;
      if (previous && previous !== stored.storedName) await fs.rm(path.join(store.dirFor(id), previous), { force: true });
      const updated = await store.update(id, (s) => {
        // A recording nobody has named yet takes its file's name, so the list is readable without any typing.
        if (s.title === DEFAULT_TITLE) s.title = path.basename(String(fileName), path.extname(String(fileName))).replace(/[_-]+/g, ' ').trim().slice(0, 120) || DEFAULT_TITLE;
        s.source = { fileName: path.basename(String(fileName)).slice(0, 200), storedName: stored.storedName, bytes: stored.bytes, sha256: stored.sha256, uploadedAt: new Date().toISOString() };
        // A different video invalidates everything derived from the old one.
        if (previous !== stored.storedName) {
          s.transcription = idle();
          s.tally = idle();
          s.analysis = idle();
          s.candidates = [];
        }
      });
      return publicSession(updated);
    },

    /** Link (or re-link) a Jam board: store a snapshot of its spec and tally it if the transcript exists. */
    async attachBoard(id, { boardId, title, spec }) {
      await store.get(id);
      const clean = sanitizeBoardSnapshot(spec);
      if (title) clean.title = String(title).slice(0, 80);
      const index = buildBoardIndex(clean);
      await store.writeJson(id, 'board.json', { boardId: String(boardId || ''), spec: clean, hash: index.hash, linkedAt: new Date().toISOString() });

      let session = await store.update(id, (s) => {
        s.board = {
          boardId: String(boardId || ''),
          title: clean.title || 'Untitled board',
          hash: index.hash,
          linkedAt: new Date().toISOString(),
          sections: index.sections.length,
          blocks: index.sections.reduce((n, sec) => n + sec.blocks.length, 0),
          parts: index.sections.reduce((n, sec) => n + sec.blocks.reduce((m, b) => m + b.parts.length, 0), 0),
        };
        s.tally = idle();
      });
      if (session.transcription.status === 'complete') {
        await computeTally(id);
        await refreshBoardMatches(id);
        session = await store.get(id);
      }
      return publicSession(session);
    },

    async unlinkBoard(id) {
      await store.update(id, (s) => { s.board = null; s.tally = idle(); });
      await fs.rm(path.join(store.dirFor(id), 'board.json'), { force: true });
      await fs.rm(path.join(store.dirFor(id), 'tally.json'), { force: true });
      return publicSession(await store.get(id));
    },

    /** Start transcription (cached) and the tally in the background. Returns at once with the session marked processing. */
    async process(id, { force = false } = {}) {
      const session = await store.get(id);
      if (!session.source) throw new ContentError(400, 'Upload a video first.');
      if (running.has(id)) return publicSession(session);

      const status = await transcription.status();
      const cached = !force && (await transcription.getCached(session.source.sha256));
      if (!cached && !status.available) {
        throw new ContentError(503, `Transcription isn't running. ${status.reason || ''}`.trim());
      }

      running.add(id);
      const updated = await store.update(id, (s) => {
        s.transcription = { status: 'processing', progress: 0, startedAt: new Date().toISOString() };
        s.tally = idle();
      });
      run(id, { force });
      return publicSession(updated);
    },

    /** (Re)run only the analysis: find shorts in an already-transcribed recording. */
    async analyze(id, { force = false } = {}) {
      const session = await store.get(id);
      if (session.transcription.status !== 'complete') throw new ContentError(409, 'Process the video first: shorts are found in its transcript.');
      if (running.has(id)) return publicSession(session);
      if (!getProvider()?.live) throw new ContentError(503, 'Finding shorts needs a DeepSeek key. Add DEEPSEEK_API_KEY and restart Apollo.');
      running.add(id);
      await store.update(id, (s) => { s.analysis = { status: 'processing', progress: 0, startedAt: new Date().toISOString() }; });
      runAnalysis(id, { force }).finally(() => running.delete(id));
      return publicSession(await store.get(id));
    },

    async getAnalysis(id) {
      await store.get(id);
      const stored = await store.readJson(id, 'analysis.json');
      if (!stored) throw new ContentError(404, 'This session has not been analysed yet.');
      return stored;
    },

    async getTranscript(id) {
      const session = await store.get(id);
      const transcript = await loadTranscript(session);
      if (!transcript) throw new ContentError(404, 'This session has no transcript yet.');
      return transcript;
    },

    /** The stored tally, recomputed first if the board or the video changed since. */
    async getTally(id) {
      const session = await store.get(id);
      const stored = await store.readJson(id, 'tally.json');
      const snapshot = await store.readJson(id, 'board.json');
      if (!snapshot || !session.source) throw new ContentError(404, 'Link a board and process the video to see the tally.');
      if (stored && stored.key.sourceHash === session.source.sha256 && stored.key.boardHash === snapshot.hash && stored.key.version === TALLY_VERSION) {
        return stored.tally;
      }
      const tally = await computeTally(id);
      if (!tally) throw new ContentError(404, 'Process the video to see the tally.');
      return tally;
    },

    /** Sessions left "processing" by a restart cannot finish: say so, so the page does not wait forever. */
    async recoverInterrupted() {
      for (const s of await store.list()) {
        if (s.analysis?.status === 'processing' && !running.has(s.id)) {
          await store.update(s.id, (x) => { x.analysis = { status: 'failed', error: 'Apollo restarted while looking for shorts. Press Find shorts to continue.' }; });
        }
        if (s.transcription?.status === 'processing' && !running.has(s.id)) {
          await store.update(s.id, (x) => {
            x.transcription = { status: 'failed', error: 'Apollo restarted while this was processing. Press Process video to continue.' };
          });
        }
      }
    },
  };
}
