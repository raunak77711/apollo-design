import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

/**
 * Atomic JSON file I/O that survives Windows.
 *
 * Writing to a temp file and renaming it over the target means a reader never sees
 * half a file. But on Windows (and on Docker Desktop's bind mounts) renaming over a
 * file that another request has open for reading fails with EPERM/EBUSY/EACCES for
 * a few milliseconds. The page polls a session while it is being written, so that
 * collision is routine: retry briefly instead of failing the whole job.
 */

const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retrying(fn, attempts = 12) {
  for (let i = 0; ; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!TRANSIENT.has(err.code) || i >= attempts - 1) throw err;
      await sleep(10 + i * 15);
    }
  }
}

export async function writeFileAtomic(target, data) {
  const tmp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmp, data, 'utf8');
    await retrying(() => fs.rename(tmp, target));
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

export const readFileRetry = (file) => retrying(() => fs.readFile(file, 'utf8'));
