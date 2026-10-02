import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeTranscript } from './transcriptSchema.js';

/**
 * Transcripts on disk, keyed by the SHA-256 of the source video: <dir>/<hash>.json.
 *
 * A recording is transcribed once. The key is the content hash alone, not the model,
 * so a later config change never silently re-spends GPU time; the model that made
 * each transcript is recorded inside it (`meta`), and re-transcribing is an explicit
 * `force`. Writes go through a temp file + rename, so a crash mid-write can never
 * leave a half transcript that looks like a cache hit.
 */

const SAFE_KEY = /^[a-f0-9]{64}$/;

export function createTranscriptCache(dir) {
  const fileFor = (hash) => {
    if (!SAFE_KEY.test(hash)) throw new Error('invalid transcript key');
    return path.join(dir, `${hash}.json`);
  };

  return {
    dir,

    async get(hash) {
      let text;
      try {
        text = await fs.readFile(fileFor(hash), 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
      try {
        const stored = JSON.parse(text);
        return { transcript: normalizeTranscript(stored.transcript), createdAt: stored.createdAt, source: stored.source };
      } catch {
        return null; // a corrupt entry is a miss, and the next put replaces it
      }
    },

    async has(hash) {
      try {
        await fs.access(fileFor(hash));
        return true;
      } catch {
        return false;
      }
    },

    async put(hash, transcript, source = {}) {
      await fs.mkdir(dir, { recursive: true });
      const target = fileFor(hash);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      const body = { version: 1, sourceHash: hash, createdAt: new Date().toISOString(), source, transcript };
      await fs.writeFile(tmp, JSON.stringify(body), 'utf8');
      await fs.rename(tmp, target);
      return target;
    },

    async delete(hash) {
      await fs.rm(fileFor(hash), { force: true });
    },

    pathFor: fileFor,
  };
}
