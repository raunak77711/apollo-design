/**
 * The render worker, from the backend. Rendering needs Chrome and FFmpeg, so it runs on the host
 * (render/worker.mjs), the same arrangement as the Whisper worker: the backend sends a job, polls it,
 * and reads the finished file from the shared storage folder.
 */

export class RenderUnavailableError extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createRenderClient({ url, fetchImpl = fetch, pollMs = 1000, maxPollFailures = 60 }) {
  const base = String(url || '').replace(/\/+$/, '');

  async function call(route, init) {
    const res = await fetchImpl(`${base}${route}`, { ...init, signal: AbortSignal.timeout(20_000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }

  return {
    async health() {
      if (!base) return { ok: false, reason: 'No render worker is configured.' };
      try {
        const { ok, body } = await call('/health');
        return ok ? { ...body, ok: true } : { ok: false, reason: 'The render worker returned an error.' };
      } catch (err) {
        return { ok: false, reason: `The render worker isn't running (${err.message}). Double-click start-workers.bat in the Apollo folder (or run: npm run workers --prefix server).` };
      }
    },

    /** job = { id, sourceRel, outRel, props, platform }. Resolves with the worker's result. */
    async render(job, { onProgress, signal } = {}) {
      if (!base) throw new RenderUnavailableError('No render worker is configured.');
      let created;
      try {
        created = await call('/renders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) });
      } catch (err) {
        throw new RenderUnavailableError(`The render worker isn't running (${err.message}). Double-click start-workers.bat in the Apollo folder (or run: npm run workers --prefix server).`);
      }
      if (!created.ok) throw new Error(created.body.error || `The render worker rejected the job (${created.status}).`);

      let failures = 0;
      for (;;) {
        if (signal?.aborted) {
          await call(`/renders/${job.id}`, { method: 'DELETE' }).catch(() => {});
          throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        }
        await sleep(pollMs);
        let polled;
        try {
          polled = await call(`/renders/${job.id}`);
          failures = 0;
        } catch (err) {
          if (++failures >= maxPollFailures) throw new RenderUnavailableError(`Lost contact with the render worker (${err.message}).`);
          continue;
        }
        if (!polled.ok) throw new Error(polled.body.error || 'The render worker lost the job.');
        const r = polled.body;
        await onProgress?.({ progress: r.progress ?? 0, stage: r.stage });
        if (r.status === 'done') return r.result;
        if (r.status === 'failed') throw new Error(r.error || 'The render failed.');
      }
    },
  };
}
