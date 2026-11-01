import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { hashFile } from '../src/services/transcription/contentHash.js';
import { createTranscriptCache } from '../src/services/transcription/transcriptCache.js';
import { TranscriptError, flattenWords, normalizeTranscript } from '../src/services/transcription/transcriptSchema.js';
import { createTranscriptionService } from '../src/services/transcription/transcriptionService.js';
import {
  TranscriptionFailedError, TranscriptionUnavailableError, createWorkerRunner, resolveRunner,
} from '../src/services/transcription/whisperRunner.js';

const word = (w, start, end, probability = 0.9) => ({ word: w, start, end, probability });
const RAW = {
  language: 'en',
  duration: 12.5,
  segments: [
    { id: 7, start: 0, end: 3, text: ' Most HVAC owners ', words: [word(' Most', 0, 0.4), word('HVAC', 0.4, 1), word('owners', 1, 1.5)] },
    { id: 9, start: 3.5, end: 6, text: 'think so.', words: [word('think', 3.5, 4), word('so.', 4, 4.5)] },
  ],
  meta: { model: 'large-v3-turbo', device: 'cuda' },
};

async function tmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'apollo-tx-'));
}

async function makeVideo(dir, name, bytes) {
  const file = path.join(dir, name);
  await fs.writeFile(file, bytes);
  return file;
}

/** A runner that counts how many times Whisper would have run. */
function fakeRunner(raw = RAW, delay = 0) {
  const runner = {
    mode: 'fake',
    calls: 0,
    async health() { return { ok: true, mode: 'fake' }; },
    async transcribe({ onProgress }) {
      runner.calls += 1;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      onProgress?.(0.5);
      return structuredClone(raw);
    },
  };
  return runner;
}

/* --------------------------------- schema --------------------------------- */

test('normalizeTranscript renumbers segments, trims text and keeps meta', () => {
  const t = normalizeTranscript(RAW);
  assert.deepEqual(t.segments.map((s) => s.id), [0, 1]);
  assert.equal(t.segments[0].text, 'Most HVAC owners');
  assert.equal(t.segments[0].words[0].word, 'Most');
  assert.equal(t.text, 'Most HVAC owners think so.');
  assert.equal(t.duration, 12.5);
  assert.equal(t.meta.device, 'cuda');
});

test('word times are made monotonic: never before the previous word ended, never ending before they start', () => {
  const t = normalizeTranscript({
    segments: [{ start: 0, end: 5, text: 'a b c', words: [word('a', 1, 2), word('b', 1.5, 1.2), word('c', 3, 4)] }],
  });
  const [a, b, c] = t.segments[0].words;
  assert.ok(b.start >= a.end);
  assert.ok(b.end >= b.start);
  assert.ok(c.start >= b.end);
});

test('junk is dropped and an empty transcript is an error, not a cache entry', () => {
  const t = normalizeTranscript({
    segments: [
      { start: 0, end: 1, text: '   ', words: [] },
      { start: 'x', end: 1, text: 'bad times', words: [] },
      { start: 1, end: 2, text: 'kept', words: [word('', 1, 2), word('kept', 1, 2), { word: 'nan', start: NaN, end: 2 }] },
    ],
  });
  assert.equal(t.segments.length, 1);
  assert.deepEqual(t.segments[0].words.map((w) => w.word), ['kept']);
  assert.throws(() => normalizeTranscript({ segments: [] }), TranscriptError);
  assert.throws(() => normalizeTranscript(null), TranscriptError);
});

test('flattenWords lists every word in order with its segment and index', () => {
  const flat = flattenWords(normalizeTranscript(RAW));
  assert.deepEqual(flat.map((w) => w.word), ['Most', 'HVAC', 'owners', 'think', 'so.']);
  assert.deepEqual(flat.map((w) => w.segment), [0, 0, 0, 1, 1]);
  assert.deepEqual(flat.map((w) => w.index), [0, 1, 2, 3, 4]);
});

/* ---------------------------------- hash ---------------------------------- */

test('the hash depends on content, not on the name or location', async () => {
  const dir = await tmp();
  const a = await makeVideo(dir, 'a.mp4', 'same bytes');
  const b = await makeVideo(dir, 'renamed.mov', 'same bytes');
  const c = await makeVideo(dir, 'c.mp4', 'different bytes');
  assert.equal(await hashFile(a), await hashFile(b));
  assert.notEqual(await hashFile(a), await hashFile(c));
  assert.match(await hashFile(a), /^[a-f0-9]{64}$/);
});

/* ---------------------------------- cache --------------------------------- */

test('the cache round-trips a transcript and misses cleanly', async () => {
  const dir = await tmp();
  const cache = createTranscriptCache(path.join(dir, 'transcripts'));
  const key = 'a'.repeat(64);
  assert.equal(await cache.get(key), null);
  assert.equal(await cache.has(key), false);
  await cache.put(key, normalizeTranscript(RAW), { fileName: 'x.mp4' });
  assert.equal(await cache.has(key), true);
  const hit = await cache.get(key);
  assert.equal(hit.transcript.text, 'Most HVAC owners think so.');
  assert.equal(hit.source.fileName, 'x.mp4');
  const leftovers = (await fs.readdir(path.join(dir, 'transcripts'))).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('a corrupt cache entry is a miss, and keys must be real hashes', async () => {
  const dir = await tmp();
  const cache = createTranscriptCache(dir);
  const key = 'b'.repeat(64);
  await fs.writeFile(cache.pathFor(key), '{ not json');
  assert.equal(await cache.get(key), null);
  await assert.rejects(() => cache.get('../../etc/passwd'));
});

/* --------------------------------- service -------------------------------- */

test('the first call runs Whisper and caches; later calls, even of a renamed copy, never do', async () => {
  const dir = await tmp();
  const runner = fakeRunner();
  const service = createTranscriptionService({ runner, cache: createTranscriptCache(path.join(dir, 'c')) });
  const video = await makeVideo(dir, 'talk.mp4', 'video bytes');
  const copy = await makeVideo(dir, 'talk copy.mp4', 'video bytes');

  const first = await service.transcribeVideo(video);
  assert.equal(first.cached, false);
  assert.equal(runner.calls, 1);

  const second = await service.transcribeVideo(video);
  const third = await service.transcribeVideo(copy);
  assert.equal(second.cached, true);
  assert.equal(third.cached, true);
  assert.equal(third.sourceHash, first.sourceHash);
  assert.equal(runner.calls, 1);
});

test('force transcribes again and replaces the cached transcript', async () => {
  const dir = await tmp();
  const runner = fakeRunner();
  const service = createTranscriptionService({ runner, cache: createTranscriptCache(path.join(dir, 'c')) });
  const video = await makeVideo(dir, 'talk.mp4', 'video bytes');
  await service.transcribeVideo(video);
  const again = await service.transcribeVideo(video, { force: true });
  assert.equal(again.cached, false);
  assert.equal(runner.calls, 2);
});

test('simultaneous requests for one uncached video share a single Whisper run', async () => {
  const dir = await tmp();
  const runner = fakeRunner(RAW, 40);
  const service = createTranscriptionService({ runner, cache: createTranscriptCache(path.join(dir, 'c')) });
  const video = await makeVideo(dir, 'talk.mp4', 'video bytes');
  const [a, b, c] = await Promise.all([service.transcribeVideo(video), service.transcribeVideo(video), service.transcribeVideo(video)]);
  assert.equal(runner.calls, 1);
  assert.equal(a.sourceHash, b.sourceHash);
  assert.equal(c.transcript.text, a.transcript.text);
});

test('progress and stages are reported', async () => {
  const dir = await tmp();
  const service = createTranscriptionService({ runner: fakeRunner(), cache: createTranscriptCache(path.join(dir, 'c')) });
  const video = await makeVideo(dir, 'talk.mp4', 'video bytes');
  const stages = [];
  const progress = [];
  await service.transcribeVideo(video, { onStage: (s) => stages.push(s), onProgress: (p) => progress.push(p) });
  assert.deepEqual(stages, ['hashing', 'transcribing']);
  assert.deepEqual(progress, [0.5]);
});

test('with no Whisper at all, Apollo reports it, still serves cached transcripts and fails new ones clearly', async () => {
  const dir = await tmp();
  const cache = createTranscriptCache(path.join(dir, 'c'));
  const service = createTranscriptionService({ runner: null, cache });
  const status = await service.status();
  assert.equal(status.available, false);
  assert.match(status.reason, /setup/i);

  const video = await makeVideo(dir, 'talk.mp4', 'video bytes');
  await assert.rejects(() => service.transcribeVideo(video), TranscriptionUnavailableError);

  await cache.put(await hashFile(video), normalizeTranscript(RAW));
  const hit = await service.transcribeVideo(video);
  assert.equal(hit.cached, true);
});

test('a missing video is a plain error', async () => {
  const dir = await tmp();
  const service = createTranscriptionService({ runner: fakeRunner(), cache: createTranscriptCache(dir) });
  await assert.rejects(() => service.transcribeVideo(path.join(dir, 'nope.mp4')), /not found/);
});

test('a runner failure is not cached', async () => {
  const dir = await tmp();
  const runner = fakeRunner();
  runner.transcribe = async () => { throw new TranscriptionFailedError('boom'); };
  const cache = createTranscriptCache(path.join(dir, 'c'));
  const service = createTranscriptionService({ runner, cache });
  const video = await makeVideo(dir, 'talk.mp4', 'video bytes');
  await assert.rejects(() => service.transcribeVideo(video), /boom/);
  assert.equal(await cache.has(await hashFile(video)), false);
});

/* ------------------------------ worker runner ------------------------------ */

function fakeWorker(script) {
  const seen = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (url.endsWith('/health')) return reply(200, { ok: true, cuda: true });
    if (url.endsWith('/jobs')) return reply(202, { id: 'job1' });
    polls += 1;
    return script(polls, reply);
  };
  return { fetchImpl, seen };
}

test('the worker runner sends a storage-relative path, polls, and returns the result', async () => {
  const storageRoot = path.join(os.tmpdir(), 'apollo-storage');
  const { fetchImpl, seen } = fakeWorker((n, reply) => (n < 3 ? reply(200, { status: 'running', progress: n / 4 }) : reply(200, { status: 'done', progress: 1, result: RAW })));
  const runner = createWorkerRunner({ url: 'http://host:5011/', storageRoot, model: 'm', device: 'auto', language: 'en', fetchImpl, pollMs: 1 });
  const progress = [];
  const raw = await runner.transcribe({ absPath: path.join(storageRoot, 'content', 'a b.mp4'), onProgress: (p) => progress.push(p) });
  assert.equal(raw.language, 'en');
  assert.deepEqual(seen[0].body.path, 'content/a b.mp4');
  assert.equal(seen[0].url, 'http://host:5011/jobs');
  assert.ok(progress.length >= 2);
});

test('the worker runner refuses a video outside the shared storage folder', async () => {
  const runner = createWorkerRunner({ url: 'http://host:5011', storageRoot: path.join(os.tmpdir(), 'apollo-storage'), fetchImpl: async () => { throw new Error('should not be called'); } });
  await assert.rejects(() => runner.transcribe({ absPath: path.join(os.tmpdir(), 'elsewhere', 'a.mp4') }), TranscriptionUnavailableError);
});

test('a failed worker job surfaces its reason; an unreachable worker is "unavailable", not a crash', async () => {
  const storageRoot = path.join(os.tmpdir(), 'apollo-storage');
  const failing = fakeWorker((n, reply) => reply(200, { status: 'failed', error: 'no speech was found in the audio' }));
  const r1 = createWorkerRunner({ url: 'http://h', storageRoot, fetchImpl: failing.fetchImpl, pollMs: 1 });
  await assert.rejects(() => r1.transcribe({ absPath: path.join(storageRoot, 'a.mp4') }), /no speech/);

  const down = async () => { throw new Error('ECONNREFUSED'); };
  const r2 = createWorkerRunner({ url: 'http://h', storageRoot, fetchImpl: down });
  await assert.rejects(() => r2.transcribe({ absPath: path.join(storageRoot, 'a.mp4') }), TranscriptionUnavailableError);
  const health = await r2.health();
  assert.equal(health.ok, false);
  assert.match(health.reason, /not reachable/);
});

test('a worker that vanishes mid-job is reported after repeated poll failures', async () => {
  const storageRoot = path.join(os.tmpdir(), 'apollo-storage');
  let created = false;
  const fetchImpl = async (url) => {
    if (url.endsWith('/jobs') && !created) { created = true; return { ok: true, status: 202, json: async () => ({ id: 'j' }) }; }
    throw new Error('socket hang up');
  };
  const runner = createWorkerRunner({ url: 'http://h', storageRoot, fetchImpl, pollMs: 1, maxPollFailures: 3 });
  await assert.rejects(() => runner.transcribe({ absPath: path.join(storageRoot, 'a.mp4') }), TranscriptionUnavailableError);
});

test('resolveRunner prefers a configured worker, then an explicit Python', () => {
  const storageRoot = '/s';
  const withWorker = resolveRunner({ whisper: { workerUrl: 'http://h:5011', python: '', model: 'm', device: 'auto', language: 'en' }, storageRoot });
  assert.equal(withWorker.mode, 'worker');
  const withPython = resolveRunner({ whisper: { workerUrl: '', python: '/x/python', model: 'm', device: 'auto', language: 'en' }, storageRoot });
  assert.equal(withPython.mode, 'spawn');
});

test('a spawn runner with a missing Python reports itself unavailable instead of throwing', async () => {
  const runner = resolveRunner({ whisper: { workerUrl: '', python: path.join(os.tmpdir(), 'no-such-python'), model: 'm', device: 'auto', language: 'en' }, storageRoot: '/s' });
  const health = await runner.health();
  assert.equal(health.ok, false);
  assert.match(health.reason, /setup/i);
});
