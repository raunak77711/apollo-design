import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config/env.js';
import { hashFile } from './contentHash.js';
import { createTranscriptCache } from './transcriptCache.js';
import { normalizeTranscript } from './transcriptSchema.js';
import { TranscriptionUnavailableError, resolveRunner } from './whisperRunner.js';

/**
 * Video -> transcript with word timestamps, transcribed at most once per recording.
 *
 *   const { transcript, sourceHash, cached } = await service.transcribeVideo('/path/to/video.mp4');
 *
 * The cache key is the SHA-256 of the file's bytes. A second call with the same video
 * (even renamed or moved) is answered from disk without touching Whisper; `force: true`
 * is the only way to transcribe again. Two simultaneous requests for the same
 * not-yet-cached video share one Whisper run instead of starting two.
 */
export function createTranscriptionService({ runner, cache, hash = hashFile }) {
  const inflight = new Map(); // sourceHash -> Promise

  return {
    cache,

    /** Is transcription usable right now, and in what mode? Never throws. */
    async status() {
      if (!runner) {
        return { available: false, reason: 'No Whisper environment found. Run server/whisper/setup.ps1, or set WHISPER_WORKER_URL.' };
      }
      try {
        const health = await runner.health();
        const { ok, ...rest } = health;
        return { available: Boolean(ok), ...rest };
      } catch (err) {
        return { available: false, mode: runner.mode, reason: err.message };
      }
    },

    async hashVideo(videoPath) {
      return hash(videoPath);
    },

    async getCached(sourceHash) {
      return cache.get(sourceHash);
    },

    async transcribeVideo(videoPath, { force = false, onProgress, onStage, sourceHash: knownHash } = {}) {
      const absPath = path.resolve(videoPath);
      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat?.isFile()) throw new Error(`video not found: ${absPath}`);

      // A caller that already hashed the bytes (the upload does, while writing) passes it in and skips a second full read.
      onStage?.('hashing');
      const sourceHash = knownHash || (await hash(absPath));

      if (!force) {
        const hit = await cache.get(sourceHash);
        if (hit) return { sourceHash, cached: true, transcript: hit.transcript, createdAt: hit.createdAt };
      }
      if (!runner) {
        throw new TranscriptionUnavailableError('Transcription is not set up. Run server/whisper/setup.ps1, or set WHISPER_WORKER_URL.');
      }

      let job = inflight.get(sourceHash);
      if (!job) {
        job = (async () => {
          onStage?.('transcribing');
          const raw = await runner.transcribe({ absPath, onProgress });
          const transcript = normalizeTranscript(raw);
          await cache.put(sourceHash, transcript, { fileName: path.basename(absPath), bytes: stat.size });
          return transcript;
        })().finally(() => inflight.delete(sourceHash));
        inflight.set(sourceHash, job);
      }
      const transcript = await job;
      return { sourceHash, cached: false, transcript, createdAt: new Date().toISOString() };
    },
  };
}

let shared = null;

/** The app-wide service, built lazily from config so importing this file has no side effects. */
export function getTranscriptionService() {
  if (!shared) {
    shared = createTranscriptionService({
      runner: resolveRunner({ whisper: config.whisper, storageRoot: config.storageRoot }),
      cache: createTranscriptCache(config.transcriptsDir),
    });
  }
  return shared;
}
