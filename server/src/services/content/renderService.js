import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { OUTPUT } from './platforms.js';

/**
 * The render queue.
 *
 * One short renders at a time (a render uses the whole machine: Chrome frames, FFmpeg encode), in the order
 * requested. A short is rendered only when its inputs changed: the render's hash covers the source video,
 * the edit, the captions, the framing, the board blocks it shows and the engine version, so an unchanged
 * short is never rendered again and any change to what the viewer would see makes the old file stale.
 *
 * Only approved shorts are rendered in a batch. Nothing here publishes anything.
 */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'short';

export function renderHash(props, sourceHash, engineVersion) {
  const { videoSrc: _v, warnings: _w, ...stable } = props;
  return createHash('sha256').update(JSON.stringify({ stable, sourceHash, engineVersion, output: OUTPUT })).digest('hex').slice(0, 16);
}

export function createRenderApi({ store, candidates, client, engineVersion = 'engine-1', log = console }) {
  const queue = []; //                       [{ id, cid }]
  let current = null; //                     { id, cid, controller }
  let draining = false;

  async function setRender(id, cid, patch) {
    await store.update(id, (s) => {
      const c = s.candidates.find((x) => x.id === cid);
      if (c) c.render = patch === null ? undefined : { ...(c.render || {}), ...patch };
    }).catch(() => {});
  }

  async function exists(id, rel) {
    try {
      await fs.access(path.join(store.dirFor(id), rel));
      return true;
    } catch {
      return false;
    }
  }

  async function runJob({ id, cid }) {
    const session = await store.get(id);
    const candidate = session.candidates.find((c) => c.id === cid);
    if (!candidate) return;
    const props = await candidates.engineProps(id, cid, { videoSrc: '__CLIP__' });
    // The engine version belongs to the worker that will draw it: a change to the video engine makes old renders stale.
    const health = await client.health().catch(() => ({}));
    const hash = renderHash(props, session.source.sha256, health.engineVersion || engineVersion);
    const fileBase = `${slug(candidate.title)}-${hash.slice(0, 8)}`;
    const outRel = `renders/${fileBase}.mp4`;

    // The status may already read "queued" (queueing it overwrote "done"); what proves a render is current is its hash and its file.
    if (candidate.render?.hash === hash && candidate.render.file && (await exists(id, candidate.render.file))) {
      await setRender(id, cid, { status: 'done', progress: 1, stage: 'done', cached: true });
      return;
    }
    const controller = new AbortController();
    current = { id, cid, controller };
    await setRender(id, cid, { status: 'rendering', progress: 0, stage: 'starting', hash, error: undefined, cached: false, startedAt: new Date().toISOString() });
    let last = 0;
    try {
      const result = await client.render({
        id: `${id}-${cid}-${hash.slice(0, 6)}`,
        sourceRel: `content/sessions/${id}/${session.source.storedName}`,
        outRel: `content/sessions/${id}/${outRel}`,
        props,
        platform: props.platform,
      }, {
        signal: controller.signal,
        onProgress: ({ progress, stage }) => {
          const now = Date.now();
          if (now - last < 800) return;
          last = now;
          setRender(id, cid, { progress: Math.round(progress * 1000) / 1000, stage });
        },
      });
      // Retire the previous render of this short.
      const previous = candidate.render?.file;
      if (previous && previous !== outRel) {
        for (const ext of ['.mp4', '.srt']) await fs.rm(path.join(store.dirFor(id), previous.replace(/\.mp4$/, ext)), { force: true });
      }
      await setRender(id, cid, {
        status: 'done', progress: 1, stage: 'done', hash, file: outRel, caption: outRel.replace(/\.mp4$/, '.srt'),
        bytes: result.bytes, seconds: result.seconds, renderSeconds: result.renderSeconds, finishedAt: new Date().toISOString(), error: undefined,
      });
    } catch (err) {
      if (err.name === 'AbortError') await setRender(id, cid, { status: 'cancelled', progress: 0 });
      else {
        log.error?.('[content] render failed:', err.message);
        await setRender(id, cid, { status: 'failed', error: err.message || 'The render failed.' });
      }
    } finally {
      current = null;
    }
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (queue.length) await runJob(queue.shift()).catch((err) => log.error?.('[content] render job crashed:', err.message));
    } finally {
      draining = false;
    }
  }

  return {
    engineVersion,

    async status() {
      return client.health();
    },

    async enqueue(id, cid) {
      const session = await store.get(id);
      const candidate = session.candidates.find((c) => c.id === cid);
      if (!candidate) return null;
      if (!session.source) return null;
      if ([...queue, current].some((j) => j && j.id === id && j.cid === cid)) return candidate;
      await setRender(id, cid, { status: 'queued', progress: 0, stage: 'queued', error: undefined });
      queue.push({ id, cid });
      drain();
      return (await store.get(id)).candidates.find((c) => c.id === cid);
    },

    /** Queue every approved short that is not already rendered up to date. Returns how many were queued. */
    async enqueueApproved(id) {
      const session = await store.get(id);
      let n = 0;
      for (const c of session.candidates || []) {
        if (c.status !== 'approved') continue;
        if (c.render?.status === 'queued' || c.render?.status === 'rendering') continue;
        await this.enqueue(id, c.id);
        n += 1;
      }
      return n;
    },

    async cancel(id, cid) {
      const at = queue.findIndex((j) => j.id === id && j.cid === cid);
      if (at >= 0) {
        queue.splice(at, 1);
        await setRender(id, cid, { status: 'cancelled', progress: 0 });
      } else if (current && current.id === id && current.cid === cid) {
        current.controller.abort();
      }
    },

    queueState: () => ({ running: current ? { id: current.id, cid: current.cid } : null, waiting: queue.length }),
    isRendering: (id) => (current && current.id === id) || queue.some((j) => j.id === id),

    async recoverInterrupted() {
      for (const s of await store.list()) {
        for (const c of s.candidates || []) {
          if (c.render?.status === 'queued' || c.render?.status === 'rendering') {
            await setRender(s.id, c.id, { status: 'failed', error: 'Apollo restarted before this render finished. Render it again.' });
          }
        }
      }
    },
  };
}
