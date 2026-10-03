#!/usr/bin/env node
/**
 * Apollo Content Factory - the render worker.
 *
 * Runs on the host (it needs Chrome and FFmpeg), beside the Whisper worker. The backend, in Docker, sends it
 * a job and polls it:
 *
 *   GET    /health         { ok, engineVersion, ffmpeg }
 *   POST   /renders        { id, sourceRel, outRel, props, platform }   -> 202
 *   GET    /renders/:id    { status: queued|running|done|failed|cancelled, progress, stage, result?, error? }
 *   DELETE /renders/:id    cancel
 *
 * A render is four steps:
 *   1. clip    FFmpeg cuts the kept stretches out of the (possibly 3 GB, HEVC, upside-down) recording into one small
 *              H.264 clip. Each stretch is fast-seeked, so a short from minute 30 does not decode 30 minutes first.
 *   2. bundle  the shared video engine (client/src/video) is bundled for Remotion; reused until its files change.
 *   3. render  Remotion draws every frame in headless Chrome and encodes 1080x1920, 30 fps, H.264 + AAC.
 *   4. finish  the MP4 gets its index moved to the front (it can start playing before it has finished loading),
 *              and a matching .srt caption file is written beside it.
 *
 * Nothing here publishes anywhere. Files appear under the shared storage folder, where the backend finds them.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const STORAGE = path.resolve(process.env.STORAGE_ROOT || path.join(REPO, 'server', 'storage'));
const PORT = Number(process.env.RENDER_PORT) || 5012;
const MEDIA_PORT = Number(process.env.RENDER_MEDIA_PORT) || 5013;
const ENGINE_DIRS = [path.join(REPO, 'client', 'src', 'video'), path.join(REPO, 'client', 'src', 'components', 'board', 'engine'), path.join(REPO, 'client', 'src', 'components', 'board', 'editor', 'iconComponents.js'), path.join(REPO, 'client', 'src', 'components', 'board', 'tools', 'util.js')];

const { bundle } = await import('@remotion/bundler');
const { renderMedia, selectComposition, makeCancelSignal } = await import('@remotion/renderer');

/* ------------------------------- the engine ------------------------------- */

const engineFile = (name) => pathToFileURL(path.join(REPO, 'client', 'src', 'video', name)).href;
const engineVersion = async () => /ENGINE_VERSION = '([^']+)'/.exec(await fs.readFile(path.join(REPO, 'client', 'src', 'video', 'theme.js'), 'utf8'))?.[1] || 'engine-?';

async function newestMtime(p) {
  const st = await fs.stat(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let newest = 0;
  for (const entry of await fs.readdir(p, { withFileTypes: true })) newest = Math.max(newest, await newestMtime(path.join(p, entry.name)));
  return newest;
}

let bundled = null; // { stamp, url }
async function serveUrl(onProgress) {
  const stamp = String(Math.max(...(await Promise.all(ENGINE_DIRS.map(newestMtime)))));
  if (bundled?.stamp === stamp) return bundled.url;
  const url = await bundle({
    entryPoint: path.join(HERE, 'entry.jsx'),
    onProgress: (p) => onProgress?.(p / 100),
    // The engine lives in the client package. One copy of React and Remotion, or hooks break.
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias || {}),
          react: path.join(HERE, 'node_modules', 'react'),
          'react-dom': path.join(HERE, 'node_modules', 'react-dom'),
          remotion: path.join(HERE, 'node_modules', 'remotion'),
        },
        modules: [path.join(HERE, 'node_modules'), path.join(REPO, 'client', 'node_modules'), 'node_modules'],
      },
    }),
  });
  bundled = { stamp, url };
  return url;
}

/* -------------------------------- FFmpeg --------------------------------- */

function findFfmpeg() {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8' });
  return probe.status === 0 ? probe.stdout.split(/\r?\n/)[0].trim() : null;
}
const FFMPEG = findFfmpeg();

function ff(args, { signal, onChild } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true });
    onChild?.(child);
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(signal?.aborted ? 'cancelled' : `FFmpeg failed: ${err.slice(-400)}`))));
  });
}

/**
 * The kept stretches as one clip. Each stretch is its own fast-seeked input, joined with a concat filter, with a
 * few milliseconds of audio fade at each join so a cut never clicks.
 */
async function cutClip({ source, segments, dest, signal, onChild }) {
  const args = [];
  segments.forEach((s) => args.push('-ss', String(s.start), '-t', String(s.end - s.start), '-i', source));
  const parts = segments.map((s, i) => `[${i}:v]setpts=PTS-STARTPTS[v${i}];[${i}:a]asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, s.end - s.start - 0.012).toFixed(3)}:d=0.012[a${i}]`);
  const join = segments.map((_, i) => `[v${i}][a${i}]`).join('');
  const filter = `${parts.join(';')};${join}concat=n=${segments.length}:v=1:a=1[v][a]`;
  await ff(['-y', ...args, '-filter_complex', filter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', dest], { signal, onChild });
}

/* --------------------------------- media --------------------------------- */

/** Serves the storage folder to Chrome (with Range requests, so a video can be seeked), on localhost only. */
function startMediaServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/media\//, ''));
      const file = path.resolve(STORAGE, rel);
      if (!file.startsWith(STORAGE + path.sep)) throw Object.assign(new Error('forbidden'), { code: 403 });
      const stat = await fs.stat(file);
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      const type = file.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
        res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1, 'Access-Control-Allow-Origin': '*' });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size, 'Access-Control-Allow-Origin': '*' });
        createReadStream(file).pipe(res);
      }
    } catch (err) {
      res.writeHead(err.code === 403 ? 403 : 404).end();
    }
  });
  server.listen(MEDIA_PORT, '127.0.0.1');
  return server;
}

/* --------------------------------- jobs ---------------------------------- */

const JOBS = new Map();
const QUEUE = [];
let busy = false;

const inStorage = (rel) => {
  const abs = path.resolve(STORAGE, rel);
  if (!abs.startsWith(STORAGE + path.sep)) throw new Error('path is outside the storage root');
  return abs;
};

async function runJob(job) {
  const t0 = Date.now();
  const progress = (stage, p) => { job.stage = stage; job.progress = Math.round(p * 1000) / 1000; };
  const { props, sourceRel, outRel } = job.request;
  const source = inStorage(sourceRel);
  const out = inStorage(outRel);
  const work = path.join(path.dirname(out), 'work', job.id.replace(/[^a-z0-9-]/gi, ''));
  await fs.mkdir(work, { recursive: true });
  const clip = path.join(work, 'clip.mp4');
  const cancel = makeCancelSignal();
  job.cancel = () => { job.cancelled = true; cancel.cancel(); job.child?.kill(); };

  try {
    progress('cutting the clip', 0.02);
    const keeps = props.segments.map((s) => ({ start: s.start, end: s.end }));
    await cutClip({ source, segments: keeps, dest: clip, signal: { get aborted() { return job.cancelled; } }, onChild: (c) => { job.child = c; } });
    const duration = props.duration;
    progress('bundling the engine', 0.1);
    const url = await serveUrl((p) => progress('bundling the engine', 0.1 + p * 0.08));

    // The clip is already cut: play it straight through. Framing lookups still use the original source times.
    const inputProps = {
      ...props,
      videoSrc: '',
      playback: { videoSrc: `http://127.0.0.1:${MEDIA_PORT}/media/${path.relative(STORAGE, clip).split(path.sep).join('/')}`, segments: [{ start: 0, end: duration, clipStart: 0, clipEnd: duration }] },
    };
    const composition = await selectComposition({ serveUrl: url, id: 'Short', inputProps });
    progress('rendering', 0.2);
    const part = `${out}.part.mp4`;
    await renderMedia({
      composition, serveUrl: url, inputProps, codec: 'h264', outputLocation: part, crf: 18, pixelFormat: 'yuv420p', audioCodec: 'aac', audioBitrate: '192k',
      x264Preset: 'medium', imageFormat: 'png', colorSpace: 'bt709', enforceAudioTrack: true, cancelSignal: cancel.cancelSignal, concurrency: Math.max(2, Math.floor((await import('node:os')).cpus().length / 2)),
      onProgress: ({ progress: p }) => progress('rendering', 0.2 + p * 0.75),
    });

    progress('finishing', 0.96);
    // Index to the front, so a platform can start playing the file before it has all arrived.
    await ff(['-y', '-i', part, '-c', 'copy', '-movflags', '+faststart', out]);
    await fs.rm(part, { force: true });
    const { groupCaptions, toSrt } = await import(engineFile('captions.js'));
    await fs.writeFile(out.replace(/\.mp4$/, '.srt'), toSrt(groupCaptions(props.words, { maxWords: props.settings.captions.maxWords })), 'utf8');

    const stat = await fs.stat(out);
    job.result = { bytes: stat.size, seconds: Math.round(duration * 10) / 10, renderSeconds: Math.round((Date.now() - t0) / 100) / 10, engineVersion: await engineVersion() };
    job.status = 'done';
    progress('done', 1);
  } catch (err) {
    job.status = job.cancelled ? 'cancelled' : 'failed';
    job.error = job.cancelled ? 'cancelled' : String(err.message || err).slice(0, 600);
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    delete job.cancel;
    delete job.child;
  }
}

async function drain() {
  if (busy) return;
  busy = true;
  try {
    while (QUEUE.length) {
      const job = QUEUE.shift();
      if (job.status !== 'queued') continue;
      job.status = 'running';
      await runJob(job);
    }
  } finally {
    busy = false;
  }
}

/* --------------------------------- http ---------------------------------- */

const send = (res, code, body) => {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
};
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, engineVersion: await engineVersion(), ffmpeg: Boolean(FFMPEG), busy, queued: QUEUE.length });
    if (req.method === 'POST' && url.pathname === '/renders') {
      const body = await readBody(req);
      if (!body.id || !body.sourceRel || !body.outRel || !body.props) return send(res, 400, { error: 'a render needs id, sourceRel, outRel and props' });
      if (!FFMPEG) return send(res, 503, { error: 'FFmpeg was not found. Install it or set FFMPEG_BIN.' });
      try { inStorage(body.sourceRel); inStorage(body.outRel); } catch (e) { return send(res, 403, { error: e.message }); }
      const job = { id: body.id, status: 'queued', progress: 0, stage: 'queued', request: body };
      JOBS.set(job.id, job);
      QUEUE.push(job);
      drain();
      return send(res, 202, { id: job.id });
    }
    const m = /^\/renders\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const job = JOBS.get(decodeURIComponent(m[1]));
      if (!job) return send(res, 404, { error: 'unknown render' });
      if (req.method === 'DELETE') {
        if (job.status === 'queued') job.status = 'cancelled';
        else job.cancel?.();
        return send(res, 200, { ok: true });
      }
      const { request: _r, child: _c, cancel: _x, ...pub } = job;
      return send(res, 200, pub);
    }
    return send(res, 404, { error: 'not found' });
  } catch (err) {
    return send(res, 500, { error: String(err.message || err) });
  }
});

startMediaServer();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[render-worker] listening on http://127.0.0.1:${PORT}; storage ${STORAGE}; ffmpeg ${FFMPEG || 'NOT FOUND'}`);
});
