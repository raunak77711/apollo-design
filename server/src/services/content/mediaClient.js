import path from 'node:path';

/**
 * The host worker's media jobs, from the backend: find the speaker's head, build the preview copy.
 * (Transcription has its own runner; this is the same worker and the same job protocol, for the jobs that
 * need FFmpeg and OpenCV, which live on the host beside the GPU, not in the backend container.)
 *
 * Like the transcription runner, a missing worker is a plain sentence, never a crash.
 */

export class MediaUnavailableError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createMediaClient({ url, storageRoot, fetchImpl = fetch, pollMs = 1000, maxPollFailures = 30 }) {
  const base = String(url || '').replace(/\/+$/, '');
  const relOf = (abs) => {
    const rel = path.relative(storageRoot, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new MediaUnavailableError("The video must be under Apollo's storage folder for the worker to read it.");
    return rel.split(path.sep).join('/');
  };

  async function call(route, init) {
    const res = await fetchImpl(`${base}${route}`, { ...init, signal: AbortSignal.timeout(15_000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  return {
    async health() {
      if (!base) return { ok: false, reason: 'No worker is configured.' };
      try {
        const { ok, body } = await call('/health');
        return ok ? { ...body, ok: true } : { ok: false, reason: 'The worker returned an error.' };
      } catch (err) {
        return { ok: false, reason: `The worker isn't running (${err.message}). Start it: npm run whisper:worker --prefix server` };
      }
    },

    /** kind: 'framing' | 'proxy'. Resolves with the job's result. */
    async run({ kind, absPath, absOut, onProgress }) {
      if (!base) throw new MediaUnavailableError('No worker is configured.');
      let created;
      try {
        created = await call('/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, path: relOf(absPath), ...(absOut ? { out: relOf(absOut) } : {}) }),
        });
      } catch (err) {
        throw new MediaUnavailableError(`The worker isn't running (${err.message}). Start it: npm run whisper:worker --prefix server`);
      }
      if (!created.ok) throw new Error(created.body.error || `The worker rejected the ${kind} job (${created.status}).`);

      const id = created.body.id;
      let failures = 0;
      for (;;) {
        await sleep(pollMs);
        let polled;
        try {
          polled = await call(`/jobs/${id}`);
          failures = 0;
        } catch (err) {
          if (++failures >= maxPollFailures) throw new MediaUnavailableError(`Lost contact with the worker (${err.message}).`);
          continue;
        }
        if (!polled.ok) throw new Error(polled.body.error || 'The worker lost the job.');
        const job = polled.body;
        if (typeof job.progress === 'number') onProgress?.(job.progress);
        if (job.status === 'done') return job.result;
        if (job.status === 'failed') throw new Error(job.error || `${kind} failed`);
      }
    },
  };
}
