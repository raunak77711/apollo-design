import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { normalizeBoard } from '../src/design/board/schema.js';
import { errorHandler } from '../src/middleware/error.js';
import { createContentRouter } from '../src/routes/content.js';
import { createLlmCache } from '../src/services/content/analysis/analyze.js';
import { createContentService } from '../src/services/content/contentService.js';
import { createMediaApi } from '../src/services/content/mediaService.js';
import { OUTPUT, PLATFORMS, lengthWarnings, safeRect } from '../src/services/content/platforms.js';
import { renderHash } from '../src/services/content/renderService.js';
import { createSessionStore } from '../src/services/content/sessionStore.js';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/services/content/settings.js';
import { normalizeTranscript } from '../src/services/transcription/transcriptSchema.js';

/* 0.4 s a word, 1.0 s between sentences (so each sentence is its own utterance). */
function transcriptOf(sentences) {
  let t = 0;
  const segments = sentences.map((text, id) => {
    const words = text.split(/\s+/).map((w) => {
      const word = { word: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.4) * 100) / 100, probability: 0.9 };
      t += 0.4;
      return word;
    });
    t += 1.0;
    return { id, start: words[0].start, end: words.at(-1).end, text, words };
  });
  return normalizeTranscript({ language: 'en', duration: t, segments });
}

const SENTENCES = [
  'Welcome back to the channel everybody today.', //                                   u0
  'Most HVAC owners think, sorry.', //                                                 u1
  'Let me say that again.', //                                                         u2
  'Most HVAC owners think they need more website traffic every single month.', //      u3
  'But traffic is not the problem and it never was for them at all.', //               u4
  'They paid $10,000 for ads and the leak was somewhere else entirely.', //             u5
  'The leak happens between the website and the lead every single time.', //           u6
  'Fix that path first and the same traffic produces three times more revenue.', //    u7
  'Think of your website like a salesman who works 24/7 without a day off.', //        u8
  'Anyway that is the idea and now something else entirely different.', //            u9
];

const BOARD = normalizeBoard({
  title: 'T',
  sections: [
    { title: 'LEAK', blocks: [{ type: 'bigtype', text: 'THE LEAK' }, { type: 'flow', direction: 'down', steps: ['WEBSITE', 'LEAD', 'PHONE NUMBER', 'FORM', 'TRAFFIC', 'REVENUE', 'PAGE', 'CUSTOMER'] }] },
  ],
});

const SHORT = {
  title: 'Traffic is not your problem',
  topic: 'lead-generation',
  reason: 'Reframes traffic as a conversion problem.',
  scores: { hook: 9, clarity: 8, value: 8, audienceRelevance: 9 },
  from: 'u1',
  to: 'u8',
  cuts: [{ from: 'u1', to: 'u2', reason: 'abandoned_take' }],
};

function stubProvider({ live = true, director = () => ({ events: [] }) } = {}) {
  const calls = [];
  return {
    live, model: 'stub', calls,
    async completeJSON(req) {
      calls.push(req);
      return /motion editor/.test(req.system) ? director(req) : { shorts: [SHORT] };
    },
  };
}

function fakeMedia() {
  const jobs = [];
  return {
    jobs,
    async health() { return { ok: true }; },
    async run({ kind, onProgress }) {
      jobs.push(kind);
      onProgress?.(0.5);
      if (kind === 'framing') return { method: 'yunet', width: 1280, height: 720, duration: 60, rotation: -180, keyframes: [{ t: 1, face: { x: 0.3, y: 0.1, w: 0.2, h: 0.45, score: 0.9 } }], head: { x: 0.3, y: 0.1, w: 0.2, h: 0.45 } };
      return { encoder: 'h264_nvenc', height: 540, bytes: 1234 };
    },
  };
}

function fakeRenderer({ fail = false, delay = 0 } = {}) {
  const jobs = [];
  return {
    jobs,
    async health() { return { ok: true }; },
    async render(job, { onProgress, signal }) {
      jobs.push(job);
      onProgress?.({ progress: 0.4, stage: 'rendering' });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (signal?.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      if (fail) throw new Error('Chrome crashed');
      return { bytes: 4321, seconds: 33, renderSeconds: 12 };
    },
  };
}

const until = async (check, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function setup({ provider = stubProvider(), renderer = fakeRenderer(), media = fakeMedia() } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-rv-'));
  const transcript = transcriptOf(SENTENCES);
  const cache = new Map();
  const transcription = {
    async status() { return { available: true }; },
    async getCached(hash) { return cache.has(hash) ? { transcript: cache.get(hash) } : null; },
    async transcribeVideo(_p, opts) { cache.set(opts.sourceHash, transcript); return { sourceHash: opts.sourceHash, cached: false, transcript }; },
  };
  const service = createContentService({
    store: createSessionStore(path.join(dir, 'sessions')), transcription, getProvider: () => provider, llmCache: createLlmCache(path.join(dir, 'llm')),
    media, renderClient: renderer, log: { error() {} },
  });
  const { id } = await service.createSession({ title: 'Ep' });
  await service.attachVideo(id, { body: Readable.from([Buffer.from('video bytes')]), fileName: 'ep.mp4' });
  await service.attachBoard(id, { boardId: 'b', spec: BOARD });
  await service.process(id);
  const session = await until(async () => { const s = await service.getSession(id); return s.analysis.status === 'complete' && s.candidates.length && s.candidates[0].director && s; });
  return { service, id, session, provider, renderer, media, cid: session.candidates[0].id, transcript };
}

/* -------------------------------- platforms -------------------------------- */

test('the output format is the one every platform accepts, and safe zones sit inside the frame', () => {
  assert.deepEqual([OUTPUT.width, OUTPUT.height, OUTPUT.fps], [1080, 1920, 30]);
  assert.equal(OUTPUT.videoCodec, 'h264');
  assert.equal(OUTPUT.pixelFormat, 'yuv420p');
  assert.equal(OUTPUT.audioCodec, 'aac');
  assert.equal(OUTPUT.faststart, true);
  for (const [id, p] of Object.entries(PLATFORMS)) {
    const r = safeRect(id);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1080 && r.y + r.h <= 1920, `${id} safe zone is inside the frame`);
  }
  // "Every platform" is at least as strict as each of them.
  const u = PLATFORMS.universal.safe;
  for (const p of Object.values(PLATFORMS)) for (const side of ['top', 'bottom', 'left', 'right']) assert.ok(u[side] >= Math.min(p.safe[side], u[side]));
  assert.equal(lengthWarnings(45, 'tiktok').length, 0);
  assert.match(lengthWarnings(200, 'youtube_shorts')[0], /allows up to 180s/);
  assert.match(lengthWarnings(5, 'universal')[0], /only 5s/);
});

/* --------------------------------- settings -------------------------------- */

test('settings merge safely: unknown keys ignored, bad values keep the old one, the toggle is a boolean', () => {
  const s = mergeSettings(DEFAULT_SETTINGS, { aiDirector: 'yes', framing: { aspect: '7:3', handsRoom: 9 }, platform: 'myspace', captions: { maxWords: 99 }, evil: true });
  assert.equal(s.aiDirector, true); //                 not a boolean: unchanged
  assert.equal(s.framing.aspect, '4:3'); //            unknown aspect: unchanged
  assert.equal(s.framing.handsRoom, 1); //             clamped
  assert.equal(s.platform, 'universal');
  assert.equal(s.captions.maxWords, 6);
  assert.equal('evil' in s, false);
  const off = mergeSettings(s, { aiDirector: false, platform: 'tiktok', framing: { aspect: '1:1' } });
  assert.equal(off.aiDirector, false);
  assert.equal(off.platform, 'tiktok');
  assert.equal(off.framing.aspect, '1:1');
  assert.equal(DEFAULT_SETTINGS.framing.aspect, '4:3'); // wide enough for the hands by default
});

/* ----------------------------- the AI-director toggle ----------------------------- */

test('analysis gives every new short an edit: the AI director when the toggle is on, the rules when it is off', async () => {
  const on = await setup({ provider: stubProvider({ director: () => ({ events: [{ type: 'emphasis', at: 0, text: 'leak', strength: 3 }] }) }) });
  assert.equal(on.session.candidates[0].director.source, 'deepseek');
  assert.equal(on.provider.calls.filter((c) => /motion editor/.test(c.system)).length, 1);

  const off = await setup();
  await off.service.updateSettings(off.id, { aiDirector: false });
  const regenerated = await off.service.regenerateDirector(off.id, off.cid);
  assert.equal(regenerated.source, 'baseline');
  assert.equal(off.provider.calls.filter((c) => /motion editor/.test(c.system)).length, 1); // that was the first, from analysis; the regenerate added none
});

test('flipping the toggle can re-direct every short, but never overwrites an edit a person made', async () => {
  const t = await setup({ provider: stubProvider({ director: () => ({ events: [{ type: 'emphasis', at: 0, text: 'leak', strength: 2 }] }) }) });
  await t.service.setDirector(t.id, t.cid, { events: [{ type: 'emphasis', text: 'revenue', strength: 3 }], source: 'manual' });
  await t.service.updateSettings(t.id, { aiDirector: false });
  const done = await t.service.directAll(t.id, {});
  assert.equal(done, 0); // the only short has a hand-made edit
  assert.equal((await t.service.getSession(t.id)).candidates[0].director.source, 'manual');
  assert.equal(await t.service.directAll(t.id, { includeManual: true }), 1);
  assert.equal((await t.service.getSession(t.id)).candidates[0].director.source, 'baseline');
});

/* ---------------------------------- review ---------------------------------- */

test('approve, reject and un-decide a short; reviewing is recorded and counted', async () => {
  const t = await setup();
  let s = await t.service.updateCandidate(t.id, t.cid, { status: 'approved' });
  let c = s.candidates.find((x) => x.id === t.cid);
  assert.equal(c.status, 'approved');
  assert.ok(c.reviewedAt);
  assert.equal((await t.service.getSession(t.id)).counts.approved, 1);
  s = await t.service.updateCandidate(t.id, t.cid, { status: 'rejected' });
  assert.equal((await t.service.getSession(t.id)).counts.rejected, 1);
  s = await t.service.updateCandidate(t.id, t.cid, { status: 'pending' });
  assert.equal(s.candidates[0].reviewedAt, undefined);
  await assert.rejects(() => t.service.updateCandidate(t.id, t.cid, { status: 'published' }), (e) => e.status === 400);
  await assert.rejects(() => t.service.updateCandidate(t.id, 'c_nope', { status: 'approved' }), (e) => e.status === 404);
});

test('a short can be renamed, noted, and have its captions switched off', async () => {
  const t = await setup();
  let s = await t.service.updateCandidate(t.id, t.cid, { title: '  A better   title  ', note: 'check the hook', captions: false });
  const c = s.candidates[0];
  assert.equal(c.title, 'A better title');
  assert.equal(c.note, 'check the hook');
  const props = await t.service.engineProps(t.id, t.cid);
  assert.equal(props.settings.captions.enabled, false);
  await assert.rejects(() => t.service.updateCandidate(t.id, t.cid, { title: '   ' }), (e) => e.status === 400);
});

test('a misheard caption word can be corrected and reverted, without touching other candidates or the timing', async () => {
  const t = await setup();
  const before = await t.service.engineProps(t.id, t.cid);
  const target = before.words[1];

  await t.service.updateCandidate(t.id, t.cid, { captionOverrides: { [target.wordIndex]: '  HVAC  owners  ' } });
  const corrected = await t.service.engineProps(t.id, t.cid);
  const same = corrected.words[1];
  assert.equal(same.word, 'HVAC owners');
  assert.equal(same.originalWord, target.word);
  assert.equal(same.start, target.start);
  assert.equal(same.end, target.end);

  // Clearing it (empty string) reverts to exactly what Whisper produced.
  await t.service.updateCandidate(t.id, t.cid, { captionOverrides: { [target.wordIndex]: '' } });
  const reverted = await t.service.engineProps(t.id, t.cid);
  assert.equal(reverted.words[1].word, target.word);
  assert.equal(reverted.words[1].originalWord, undefined);

  // A non-numeric key (not a real word position) is ignored rather than silently stored.
  await t.service.updateCandidate(t.id, t.cid, { captionOverrides: { 'not-a-word-index': 'nope' } });
  const session = await t.service.getSession(t.id);
  assert.deepEqual(session.candidates[0].edits?.captionOverrides || {}, {});
});

test('trimming moves an edge to real word boundaries, shifts the edit with it, and keeps what is still valid', async () => {
  const t = await setup({ provider: stubProvider({ director: () => ({ events: [{ type: 'emphasis', text: 'leak', strength: 3 }, { type: 'number', value: '$10,000' }] }) }) });
  const before = t.session.candidates[0];
  const emphasis = before.director.events.find((e) => e.type === 'emphasis');
  // Start one sentence later: the first sentence of the short disappears, everything shifts earlier.
  const next = t.transcript.segments[4].words[0].start;
  const trimmed = await t.service.trimCandidate(t.id, t.cid, { start: next });
  assert.ok(trimmed.sourceStart > before.sourceStart);
  assert.ok(trimmed.duration < before.duration);
  assert.ok(trimmed.sourceStart <= next && trimmed.sourceStart > next - 0.3);
  assert.match(trimmed.hook, /^But traffic is not the problem/);
  assert.deepEqual(trimmed.edits.trim, { start: trimmed.sourceStart, end: trimmed.sourceEnd });
  const moved = trimmed.director.events.find((e) => e.type === 'emphasis');
  assert.ok(moved.at < emphasis.at, 'the emphasis moved earlier with the clip');
  // Out-of-range or silly trims are refused with a sentence.
  await assert.rejects(() => t.service.trimCandidate(t.id, t.cid, { start: before.sourceStart - 50 }), (e) => e.status === 400 && /up to 12s/.test(e.message));
  await assert.rejects(() => t.service.trimCandidate(t.id, t.cid, { start: trimmed.sourceEnd - 1 }), (e) => e.status === 400);
});

test('a hand edit is validated: a word that was never said is dropped with a reason, not saved', async () => {
  const t = await setup();
  const track = await t.service.setDirector(t.id, t.cid, { events: [{ type: 'emphasis', text: 'revenue', strength: 3 }, { type: 'emphasis', text: 'unicorn' }, { type: 'camera', action: 'punch_in', at: 4 }], source: 'external' });
  assert.equal(track.source, 'external');
  assert.equal(track.events.filter((e) => e.type === 'emphasis').length, 1);
  assert.ok(track.issues.some((i) => /unicorn/.test(i)));
  const stored = (await t.service.getSession(t.id)).candidates[0].director;
  assert.equal(stored.events.length, track.events.length);
  assert.deepEqual(stored.events.filter((e) => e.type === 'camera').map((e) => e.action), ['punch_in', 'return']);
});

test('the Claude/ChatGPT package carries the vocabulary, the words, the board blocks and the current edit; the prompt carries it as text', async () => {
  const t = await setup();
  const pkg = await t.service.exportPackage(t.id, t.cid);
  assert.equal(pkg.format, 'apollo-short-package');
  assert.ok(pkg.vocabulary.eventTypes.includes('board'));
  assert.ok(pkg.transcript.length > 20);
  assert.ok(pkg.boardBlocks.some((b) => b.type === 'flow'));
  assert.ok(Array.isArray(pkg.director.events));
  assert.ok(pkg.director.events.every((e) => e.id === undefined)); // ids are Apollo's business
  const text = await t.service.promptText(t.id, t.cid);
  assert.match(text, /motion editor/);
  assert.match(text, /THE CURRENT EDIT/);
  assert.match(text, /Return ONLY the JSON/);
  // Round trip: what the other AI sends back goes through the same validation.
  const back = await t.service.setDirector(t.id, t.cid, { events: pkg.director.events, source: 'external' });
  assert.equal(back.source, 'external');
});

/* ------------------------------- engine props ------------------------------- */

test('the engine props are one self-contained description of a short', async () => {
  const t = await setup({ provider: stubProvider({ director: ({ user }) => ({ events: [{ type: 'board', at: 3, blockId: /(s1\.b\d)\s+\(flow\)/.exec(user)[1], animation: 'progressive', duration: 6 }] }) }) });
  await until(async () => (await t.service.getSession(t.id)).media.framing.status === 'complete');
  const props = await t.service.engineProps(t.id, t.cid);
  assert.equal(props.fps, 30);
  assert.ok(props.videoSrc.includes('/storage/content/sessions/'));
  assert.deepEqual(props.source, { width: 1280, height: 720 });
  assert.equal(props.framing.head.x, 0.3);
  assert.ok(props.segments.length >= 1 && props.segments[0].clipStart === 0);
  assert.ok(props.words.length > 10);
  assert.ok(props.duration > 20);
  const board = props.events.find((e) => e.type === 'board');
  assert.ok(board, 'the board event survived validation');
  assert.equal(props.blocks[board.blockId].block.type, 'flow'); // the block itself travels with the props
  assert.equal(props.platform, 'universal');
  // A preview copy is preferred once it exists.
  await until(async () => (await t.service.getSession(t.id)).media.proxy.status === 'complete');
  assert.match((await t.service.engineProps(t.id, t.cid)).videoSrc, /proxy\.mp4$/);
  // Disabled events do not reach the engine.
  const disabled = (await t.service.getSession(t.id)).candidates[0].director.events.map((e) => ({ ...e, disabled: true }));
  await t.service.setDirector(t.id, t.cid, { events: disabled });
  assert.equal((await t.service.engineProps(t.id, t.cid)).events.length, 0);
});

/* ---------------------------------- media ---------------------------------- */

test('uploading prepares the media in the background; a worker that is down is a sentence and can be retried', async () => {
  const media = fakeMedia();
  const t = await setup({ media });
  const s = await until(async () => { const x = await t.service.getSession(t.id); return x.media.proxy.status === 'complete' && x; });
  assert.deepEqual(media.jobs.slice(0, 2), ['framing', 'proxy']);
  assert.equal(s.media.framing.head.x, 0.3);
  assert.match(s.media.playUrl, /proxy\.mp4$/);

  const down = { async health() { return { ok: false, reason: 'not running' }; }, async run() { throw new Error('The worker isn\'t running'); } };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-md-'));
  const store = createSessionStore(path.join(dir, 's'));
  const api = createMediaApi({ store, media: down, log: { error() {} } });
  const { id } = await store.create({ title: 'x', source: { storedName: 'a.mp4', sha256: 'h' }, media: undefined });
  await api.prepare(id);
  const failed = await store.get(id);
  assert.equal(failed.media.framing.status, 'failed');
  assert.match(failed.media.framing.error, /isn't running/);
});

/* ---------------------------------- render ---------------------------------- */

test('only an approved short is rendered in a batch, one at a time, and the result is recorded', async () => {
  const renderer = fakeRenderer({ delay: 20 });
  const t = await setup({ renderer });
  const none = await t.service.renderApproved(t.id);
  assert.equal(none.queued, 0); // nothing approved yet: nothing renders
  await t.service.updateCandidate(t.id, t.cid, { status: 'approved' });
  const { queued } = await t.service.renderApproved(t.id);
  assert.equal(queued, 1);
  const s = await until(async () => { const x = await t.service.getSession(t.id); return x.candidates[0].render?.status === 'done' && x; });
  const r = s.candidates[0].render;
  assert.match(r.file, /^renders\/traffic-is-not-your-problem-[a-f0-9]{8}\.mp4$/);
  assert.equal(r.bytes, 4321);
  assert.equal(r.hash.length, 16);
  const job = renderer.jobs[0];
  assert.match(job.sourceRel, /^content\/sessions\/[a-z0-9]{12}\/source-[a-f0-9]{12}\.mp4$/);
  assert.equal(job.platform, 'universal');
  assert.equal(job.props.videoSrc, '__CLIP__');
});

test('an unchanged short is not rendered twice; any change to what the viewer sees renders it again', async () => {
  const renderer = fakeRenderer();
  const t = await setup({ renderer });
  const wait = () => until(async () => { const x = await t.service.getSession(t.id); return ['done', 'failed'].includes(x.candidates[0].render?.status) && x; });
  await t.service.renderCandidate(t.id, t.cid);
  const first = await wait();
  assert.equal(renderer.jobs.length, 1);

  // The file is not really on disk in this test, so make it so.
  const dir = t.service.store.dirFor(t.id);
  await fs.mkdir(path.join(dir, 'renders'), { recursive: true });
  await fs.writeFile(path.join(dir, first.candidates[0].render.file), 'mp4');
  await t.service.renderCandidate(t.id, t.cid);
  await until(async () => (await t.service.getSession(t.id)).candidates[0].render.cached === true);
  assert.equal(renderer.jobs.length, 1, 'same inputs: served from the earlier render');

  await t.service.setDirector(t.id, t.cid, { events: [{ type: 'emphasis', text: 'revenue', strength: 3 }] });
  await t.service.renderCandidate(t.id, t.cid);
  await until(async () => renderer.jobs.length === 2);
  const second = await wait();
  assert.notEqual(second.candidates[0].render.hash, first.candidates[0].render.hash);
});

test('a render that fails says why and can be tried again; a restart does not leave a render "running" forever', async () => {
  const t = await setup({ renderer: fakeRenderer({ fail: true }) });
  await t.service.renderCandidate(t.id, t.cid);
  const s = await until(async () => { const x = await t.service.getSession(t.id); return x.candidates[0].render?.status === 'failed' && x; });
  assert.match(s.candidates[0].render.error, /Chrome crashed/);
  await t.service.store.update(t.id, (x) => { x.candidates[0].render = { status: 'rendering', progress: 0.3 }; });
  await t.service.recoverInterrupted();
  assert.match((await t.service.getSession(t.id)).candidates[0].render.error, /restarted/);
});

test('the render hash covers the video, the edit and the engine version, and ignores the playback URL', () => {
  const props = { videoSrc: '/a', words: [1], events: [], settings: { aspect: '4:3' }, warnings: ['x'] };
  const h = renderHash(props, 'src1', 'engine-1');
  assert.equal(h, renderHash({ ...props, videoSrc: '/different', warnings: [] }, 'src1', 'engine-1'));
  assert.notEqual(h, renderHash({ ...props, events: [{ type: 'camera' }] }, 'src1', 'engine-1'));
  assert.notEqual(h, renderHash(props, 'src2', 'engine-1'));
  assert.notEqual(h, renderHash(props, 'src1', 'engine-2'));
  assert.notEqual(h, renderHash({ ...props, settings: { aspect: '1:1' } }, 'src1', 'engine-1'));
});

/* ---------------------------------- routes ---------------------------------- */

async function withApp(service, fn) {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.use('/api/content', createContentRouter({ service }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/content`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('the HTTP API reviews, edits, hands off and renders a short', async () => {
  const t = await setup();
  await withApp(t.service, async (base) => {
    const send = (p, method, body) => fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const sp = `/sessions/${t.id}`;
    const cp = `${sp}/candidates/${t.cid}`;

    assert.equal((await send(`${sp}/settings`, 'PATCH', { aiDirector: false, platform: 'tiktok' })).status, 200);
    assert.equal((await (await fetch(`${base}${sp}`)).json()).settings.platform, 'tiktok');
    assert.equal((await send(cp, 'PATCH', { status: 'approved' })).status, 200);
    assert.equal((await send(`${cp}/director/regenerate`, 'POST', {})).status, 200);
    const props = await (await fetch(`${base}${cp}/props`)).json();
    assert.equal(props.platform, 'tiktok');
    const pkg = await (await fetch(`${base}${cp}/package`)).json();
    assert.equal(pkg.format, 'apollo-short-package');
    const prompt = await fetch(`${base}${cp}/prompt`);
    assert.match(prompt.headers.get('content-type'), /text\/plain/);
    assert.match(await prompt.text(), /THE CURRENT EDIT/);
    assert.equal((await send(`${cp}/director`, 'PUT', { events: pkg.director.events, source: 'external' })).status, 200);
    assert.equal((await send(`${cp}/render`, 'POST')).status, 202);
    assert.equal((await send(`${sp}/render`, 'POST')).status, 202);
    assert.equal((await send(`${sp}/director`, 'POST', { ai: false })).status, 200);
    assert.equal((await send(`${cp}/trim`, 'POST', { start: 'x' })).status, 400);
    assert.equal((await send(`${sp}/candidates/c_missing`, 'PATCH', { status: 'approved' })).status, 404);
    const status = await (await fetch(`${base}/status`)).json();
    assert.equal(status.render.ok, true);
  });
});
