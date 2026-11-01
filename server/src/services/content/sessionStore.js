import fs from 'node:fs/promises';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { readFileRetry, writeFileAtomic } from './atomicFile.js';

/**
 * Content sessions on disk: <root>/<id>/session.json beside the session's own files
 * (the source video, the linked board snapshot, the tally, later the renders).
 *
 * Files rather than a database table because a session is mostly large artifacts
 * that already live on disk, it must work with MongoDB down (the transcript cache
 * already does), and a person can open the folder and see exactly what Apollo has.
 * Every write goes through a temp file + rename, and updates to one session are
 * serialised, so two requests cannot overwrite each other's change.
 */

const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);
const SAFE_ID = /^[a-z0-9]{12}$/;

export class SessionNotFoundError extends Error {
  constructor(id) {
    super('That content session does not exist.');
    this.status = 404;
    this.id = id;
  }
}

export function createSessionStore(root) {
  const queues = new Map(); // id -> tail of that session's write queue
  // Write-through cache. The page polls a session every second while background jobs save it; on Windows a
  // save can fail for a moment if a reader has the file open. This process is the only writer, so reads are
  // answered from memory and only a save touches the file.
  const cache = new Map();

  const dirFor = (id) => {
    if (!SAFE_ID.test(String(id))) throw new SessionNotFoundError(id);
    return path.join(root, id);
  };
  const fileFor = (id) => path.join(dirFor(id), 'session.json');

  async function read(id) {
    if (cache.has(id)) return structuredClone(cache.get(id));
    try {
      const session = JSON.parse(await readFileRetry(fileFor(id)));
      cache.set(id, structuredClone(session));
      return session;
    } catch (err) {
      if (err.code === 'ENOENT') throw new SessionNotFoundError(id);
      throw err;
    }
  }

  async function write(session) {
    await writeFileAtomic(fileFor(session.id), JSON.stringify(session, null, 2));
    cache.set(session.id, structuredClone(session));
  }

  return {
    root,
    dirFor,

    async create(initial) {
      const id = newId();
      const now = new Date().toISOString();
      const session = { id, createdAt: now, updatedAt: now, ...initial };
      await fs.mkdir(dirFor(id), { recursive: true });
      await write(session);
      return session;
    },

    get: read,

    async list() {
      let entries = [];
      try {
        entries = await fs.readdir(root, { withFileTypes: true });
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      const sessions = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue;
        try {
          sessions.push(await read(entry.name));
        } catch {
          /* a half-created or damaged folder is skipped, not fatal */
        }
      }
      return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    /** Read-modify-write one session. `fn` receives the current session and returns the changes (or a whole new object). */
    update(id, fn) {
      const run = async () => {
        const draft = await read(id);
        const next = (await fn(draft)) || draft; // fn edits the draft in place, or returns a replacement
        next.updatedAt = new Date().toISOString();
        await write(next);
        return next;
      };
      const tail = (queues.get(id) || Promise.resolve()).catch(() => {});
      const result = tail.then(run);
      queues.set(id, result);
      result.finally(() => { if (queues.get(id) === result) queues.delete(id); }).catch(() => {});
      return result;
    },

    async remove(id) {
      await read(id);
      cache.delete(id);
      await fs.rm(dirFor(id), { recursive: true, force: true });
    },

    /** Write a JSON side-file (board snapshot, tally) next to the session. */
    async writeJson(id, name, value) {
      await writeFileAtomic(path.join(dirFor(id), name), JSON.stringify(value));
    },

    async readJson(id, name) {
      try {
        return JSON.parse(await readFileRetry(path.join(dirFor(id), name)));
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}
