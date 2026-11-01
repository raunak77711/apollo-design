import path from 'node:path';

/**
 * Getting a recording ready to be edited: where the speaker's head is, and a preview copy a browser can play.
 *
 * Both run on the host worker (FFmpeg, OpenCV, the GPU encoder), in the background, right after the upload.
 * Neither blocks transcription. Face finding is a few seconds and free (a local model on about six frames:
 * three at the start, then one every ten minutes); the preview copy takes a few minutes for a long video.
 * If the worker is not running both are recorded as failed with the command that starts it, and "Prepare"
 * can be pressed again.
 */

const idle = () => ({ status: 'not_started' });

export function newMediaState() {
  return { framing: idle(), proxy: idle() };
}

export function createMediaApi({ store, media, log = console }) {
  const active = new Set();

  async function prepare(id) {
    if (!media || active.has(id)) return;
    active.add(id);
    try {
      const session = await store.get(id);
      if (!session.source) return;
      const abs = path.join(store.dirFor(id), session.source.storedName);
      const proxyAbs = path.join(store.dirFor(id), 'proxy.mp4');
      const hash = session.source.sha256;
      const current = session.media || newMediaState();

      const framingDone = current.framing.status === 'complete' && current.framing.sourceHash === hash;
      const proxyDone = current.proxy.status === 'complete' && current.proxy.sourceHash === hash;
      await store.update(id, (s) => {
        s.media = s.media || newMediaState();
        if (!framingDone) s.media.framing = { status: 'processing' };
        if (!proxyDone) s.media.proxy = { status: 'processing', progress: 0 };
      });

      if (!framingDone) {
        try {
          const result = await media.run({ kind: 'framing', absPath: abs });
          await store.update(id, (s) => { s.media.framing = { status: 'complete', sourceHash: hash, ...result }; });
        } catch (err) {
          log.error?.('[content] framing failed:', err.message);
          await store.update(id, (s) => { s.media.framing = { status: 'failed', error: err.message }; });
        }
      }

      if (!proxyDone) {
        let last = 0;
        try {
          const result = await media.run({
            kind: 'proxy',
            absPath: abs,
            absOut: proxyAbs,
            onProgress: (p) => {
              const now = Date.now();
              if (now - last < 1500) return;
              last = now;
              store.update(id, (s) => { if (s.media?.proxy?.status === 'processing') s.media.proxy.progress = Math.round(p * 100) / 100; }).catch(() => {});
            },
          });
          await store.update(id, (s) => { s.media.proxy = { status: 'complete', sourceHash: hash, file: 'proxy.mp4', ...result }; });
        } catch (err) {
          log.error?.('[content] preview copy failed:', err.message);
          await store.update(id, (s) => { s.media.proxy = { status: 'failed', error: err.message }; });
        }
      }
    } finally {
      active.delete(id);
    }
  }

  return {
    /** Start in the background; never throws into the caller. */
    prepareInBackground(id) {
      prepare(id).catch((err) => log.error?.('[content] media preparation crashed:', err.message));
    },
    prepare,
    isPreparing: (id) => active.has(id),
    async status() {
      return media ? media.health() : { ok: false, reason: 'No worker is configured.' };
    },
    /** A restart leaves "processing" behind; say so, so the page offers to try again. */
    async recoverInterrupted() {
      for (const s of await store.list()) {
        const m = s.media;
        if (!m || active.has(s.id)) continue;
        if (m.framing?.status === 'processing' || m.proxy?.status === 'processing') {
          await store.update(s.id, (x) => {
            if (x.media.framing.status === 'processing') x.media.framing = { status: 'failed', error: 'Apollo restarted before this finished.' };
            if (x.media.proxy.status === 'processing') x.media.proxy = { status: 'failed', error: 'Apollo restarted before this finished.' };
          });
        }
      }
    },
  };
}
