import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { errorHandler } from '../src/middleware/error.js';
import { createContentRouter } from '../src/routes/content.js';
import { normalizeBoard } from '../src/design/board/schema.js';
import { buildBoardIndex, hashBoardSpec } from '../src/services/content/boardIndex.js';
import { tallyBoard } from '../src/services/content/boardTally.js';
import { ContentError, createContentService, sanitizeBoardSnapshot } from '../src/services/content/contentService.js';
import { createSessionStore, SessionNotFoundError } from '../src/services/content/sessionStore.js';
import { normalizeToken, tokenize } from '../src/services/content/text.js';
import { UploadError, extensionOf, storeUpload } from '../src/services/content/uploadVideo.js';
import { hashFile } from '../src/services/transcription/contentHash.js';
import { normalizeTranscript } from '../src/services/transcription/transcriptSchema.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'apollo-content-'));

/** A transcript from sentences: each word gets 0.4 s, sentences are separated by a pause. */
function transcriptOf(sentences, { gap = 0.6, start = 0 } = {}) {
  let t = start;
  const segments = sentences.map((text, id) => {
    const words = text.split(/\s+/).map((w) => {
      const word = { word: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.4) * 100) / 100, probability: 0.9 };
      t += 0.4;
      return word;
    });
    const seg = { id, start: words[0].start, end: words[words.length - 1].end, text, words };
    t += gap;
    return seg;
  });
  return normalizeTranscript({ language: 'en', duration: t, segments });
}

const BOARD = normalizeBoard({
  title: 'HVAC',
  sections: [
    { title: 'MYTH', kicker: 'OPEN', blocks: [{ type: 'statement', text: 'Most owners think they need more website traffic' }] },
    { title: 'SARAH', blocks: [{ type: 'moment', text: 'SARAH', chips: [{ label: 'AC STOPS WORKING' }] }] },
    { title: 'LEAK', blocks: [{ type: 'bigtype', text: 'THE LEAK' }, { type: 'flow', direction: 'down', steps: ['WEBSITE', 'LEAD', 'REVENUE'] }] },
    { title: 'ABSENT', blocks: [{ type: 'statement', text: 'Quantum dolphin pricing' }] },
  ],
});

/* ------------------------------ text + index ------------------------------ */

test('tokens join leads/lead, drop filler and keep numbers', () => {
  assert.equal(normalizeToken('Leads,'), normalizeToken('lead'));
  assert.equal(normalizeToken('leaking'), 'leak');
  assert.equal(normalizeToken('leaked'), 'leak');
  assert.equal(normalizeToken('the'), '');
  assert.equal(normalizeToken('uh'), '');
  assert.deepEqual(tokenize('AC STOPS WORKING → 24/7'), ['ac', 'stop', 'work', '24', '7']);
});

test('the board index lists every spoken part with a semantic path and the spec ids', () => {
  const index = buildBoardIndex(BOARD);
  assert.equal(index.sections.length, 4);
  const leak = index.sections[2];
  assert.equal(leak.blocks[1].type, 'flow');
  assert.deepEqual(leak.blocks[1].parts.map((p) => p.path), ['steps.0', 'steps.1', 'steps.2']);
  assert.equal(leak.blocks[1].parts[0].id, `${leak.blocks[1].id}#steps.0`);
  assert.equal(index.sections[0].kicker, 'OPEN');
  assert.equal(hashBoardSpec(BOARD), index.hash);
  assert.notEqual(hashBoardSpec({ ...BOARD, title: 'other' }), index.hash);
});

/* --------------------------------- tally ---------------------------------- */

test('the tally finds where each section is spoken, in video time', () => {
  const transcript = transcriptOf([
    'Most owners think they need more website traffic',
    'Imagine a customer named Sarah whose AC stops working tonight',
    'So the leak is not traffic at all',
    'The leak happens between the website and the lead',
    'Fix that and revenue follows',
  ]);
  const tally = tallyBoard(buildBoardIndex(BOARD), transcript);
  const byTitle = Object.fromEntries(tally.sections.map((s) => [s.title, s]));

  assert.equal(byTitle.MYTH.found, true);
  assert.equal(byTitle.SARAH.found, true);
  assert.equal(byTitle.LEAK.found, true);
  assert.equal(byTitle.ABSENT.found, false);
  assert.equal(tally.stats.sectionsFound, 3);

  // Order in the recording follows the order of the story.
  assert.ok(byTitle.MYTH.primary.start < byTitle.SARAH.primary.start);
  assert.ok(byTitle.SARAH.primary.start < byTitle.LEAK.primary.start);
  // The spans are real transcript times, not window positions.
  const sarah = transcript.segments[1];
  assert.ok(byTitle.SARAH.primary.start >= sarah.start && byTitle.SARAH.primary.end <= sarah.end);
});

test('part-level hits say which flow step was mentioned', () => {
  const filler = Array.from({ length: 40 }, () => 'filler words about nothing important here');
  const transcript = transcriptOf(['the website is where it starts', ...filler, 'and then every lead matters', ...filler]);
  const tally = tallyBoard(buildBoardIndex(BOARD), transcript);
  const flow = tally.sections[2].blocks[1];
  const paths = flow.parts.map((p) => p.path);
  assert.ok(paths.includes('steps.0'));
  assert.ok(paths.includes('steps.1'));
  assert.ok(!paths.includes('steps.2')); // REVENUE was never said
  assert.ok(flow.coverage > 0 && flow.coverage < 1);
});

test('a retaken line is tallied at both takes', () => {
  const filler = Array.from({ length: 40 }, () => 'unrelated talk about the weather today');
  const transcript = transcriptOf([
    'Most owners think they need more website traffic',
    'sorry let me say that again',
    'Most owners think they need more website traffic',
    ...filler,
  ]);
  const tally = tallyBoard(buildBoardIndex(BOARD), transcript);
  const part = tally.sections[0].blocks[0].parts[0];
  assert.equal(part.hits.length, 2);
  assert.ok(part.hits[1].start > part.hits[0].end);
});

test('a word said constantly is a topic, not a pointer', () => {
  const chatter = Array.from({ length: 40 }, () => 'the lead the lead the lead again');
  const quiet = tallyBoard(buildBoardIndex(BOARD), transcriptOf(chatter));
  const flowLead = quiet.sections[2].blocks[1].parts.find((p) => p.path === 'steps.1');
  const strength = flowLead ? Math.max(...flowLead.hits.map((h) => h.score)) : 0;
  const rare = tallyBoard(buildBoardIndex(BOARD), transcriptOf(['the lead is here', ...Array.from({ length: 30 }, () => 'unrelated talk about weather')]));
  const rareLead = rare.sections[2].blocks[1].parts.find((p) => p.path === 'steps.1');
  assert.ok(rareLead, 'a single mention of a rare word is found');
  assert.ok(Math.max(...rareLead.hits.map((h) => h.score)) > strength);
});

test('long stretches of talk with no board content are reported as uncovered', () => {
  const filler = Array.from({ length: 60 }, () => 'here is some other general commentary about nothing in particular');
  const transcript = transcriptOf(['Most owners think they need more website traffic', ...filler, 'The leak happens between the website and the lead']);
  const tally = tallyBoard(buildBoardIndex(BOARD), transcript);
  assert.equal(tally.uncovered.length, 1);
  assert.ok(tally.uncovered[0].end - tally.uncovered[0].start > 45);
});

/* ------------------------------ session store ----------------------------- */

test('sessions are created, listed newest first, updated without losing concurrent changes and removed', async () => {
  const store = createSessionStore(path.join(await tmp(), 'sessions'));
  const a = await store.create({ title: 'A', n: 0 });
  await new Promise((r) => setTimeout(r, 5));
  const b = await store.create({ title: 'B', n: 0 });
  assert.deepEqual((await store.list()).map((s) => s.title), ['B', 'A']);

  await Promise.all(Array.from({ length: 25 }, () => store.update(a.id, (s) => { s.n += 1; })));
  assert.equal((await store.get(a.id)).n, 25);

  await store.remove(b.id);
  await assert.rejects(() => store.get(b.id), SessionNotFoundError);
  await assert.rejects(() => store.get('../etc'), SessionNotFoundError);
  assert.deepEqual((await store.list()).map((s) => s.title), ['A']);
});

/* --------------------------------- upload --------------------------------- */

test('an upload is stored under its own hash, which matches the file on disk', async () => {
  const dir = await tmp();
  const payload = Buffer.from('pretend this is a video '.repeat(5000));
  const stored = await storeUpload(Readable.from([payload.subarray(0, 1000), payload.subarray(1000)]), { dir, ext: '.mp4', maxBytes: 10 ** 7 });
  assert.equal(stored.bytes, payload.length);
  assert.match(stored.storedName, /^source-[a-f0-9]{12}\.mp4$/);
  assert.equal(await hashFile(path.join(dir, stored.storedName)), stored.sha256);
  assert.deepEqual((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
});

test('an oversized or empty upload fails cleanly and leaves nothing behind', async () => {
  const dir = await tmp();
  await assert.rejects(() => storeUpload(Readable.from([Buffer.alloc(5000)]), { dir, ext: '.mp4', maxBytes: 1000 }), (e) => e instanceof UploadError && e.status === 413);
  await assert.rejects(() => storeUpload(Readable.from([]), { dir, ext: '.mp4', maxBytes: 1000 }), (e) => e.status === 400);
  assert.deepEqual(await fs.readdir(dir), []);
  assert.equal(extensionOf('Talk.MOV'), '.mov');
  assert.throws(() => extensionOf('notes.pdf'), UploadError);
});

/* --------------------------------- service -------------------------------- */

function fakeTranscription({ available = true, transcript } = {}) {
  const cache = new Map();
  const calls = [];
  return {
    calls,
    cache,
    async status() { return available ? { available: true, mode: 'fake' } : { available: false, reason: 'Worker is not running.' }; },
    async getCached(hash) { return cache.has(hash) ? { transcript: cache.get(hash) } : null; },
    async transcribeVideo(videoPath, opts) {
      calls.push({ videoPath, ...opts });
      opts.onProgress?.(0.5);
      cache.set(opts.sourceHash, transcript);
      return { sourceHash: opts.sourceHash, cached: false, transcript };
    },
  };
}

const waitFor = async (check, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function makeService(options = {}) {
  const dir = await tmp();
  const transcription = options.transcription || fakeTranscription({ transcript: transcriptOf(['Most owners think they need more website traffic', 'Sarah AC stops working', 'The leak happens between the website and the lead']) });
  const service = createContentService({ store: createSessionStore(path.join(dir, 'sessions')), transcription, maxUploadBytes: options.maxUploadBytes || 10 ** 8, log: { error() {} } });
  return { service, transcription };
}

const upload = (service, id, bytes = 'video bytes', fileName = 'talk.mp4') => service.attachVideo(id, { body: Readable.from([Buffer.from(bytes)]), fileName });

test('the board snapshot is re-validated but keeps the ids the board already has', () => {
  const spec = {
    title: 'T',
    sections: [
      { id: 's3', title: 'Kept', blocks: [{ id: 's3.b7', type: 'statement', text: 'hello there' }, { id: 's3.b8', type: 'carousel' }, { id: 'nope', type: 'statement', text: 'x' }] },
      { id: 'bad id', title: 'Dropped', blocks: [{ id: 's9.b1', type: 'statement', text: 'x' }] },
      { id: 's4', title: 'Empty', blocks: [] },
    ],
  };
  const clean = sanitizeBoardSnapshot(spec);
  assert.equal(clean.sections.length, 1);
  assert.equal(clean.sections[0].id, 's3');
  assert.deepEqual(clean.sections[0].blocks.map((b) => b.id), ['s3.b7']);
  assert.throws(() => sanitizeBoardSnapshot({ sections: [] }), ContentError);
  assert.throws(() => sanitizeBoardSnapshot(null), ContentError);
});

test('upload, link a board, process: transcript, tally and status all arrive', async () => {
  const { service, transcription } = await makeService();
  const created = await service.createSession({ title: 'Episode 1' });
  assert.equal(created.transcription.status, 'not_started');

  const withVideo = await upload(service, created.id);
  assert.equal(withVideo.source.fileName, 'talk.mp4');
  assert.match(withVideo.source.url, new RegExp(`^/storage/content/sessions/${created.id}/source-`));

  const linked = await service.attachBoard(created.id, { boardId: 'b_1', title: 'My board', spec: BOARD });
  assert.equal(linked.board.sections, 4);
  assert.equal(linked.tally.status, 'not_started'); // no transcript yet

  const started = await service.process(created.id);
  assert.equal(started.transcription.status, 'processing');
  const done = await waitFor(async () => {
    const s = await service.getSession(created.id);
    return s.tally.status === 'complete' && s;
  });
  assert.equal(done.transcription.status, 'complete');
  assert.equal(done.tally.sectionsTotal, 4);
  assert.ok(done.tally.sectionsFound >= 2);
  assert.equal(transcription.calls[0].sourceHash, withVideo.source.sha256); // the upload's hash is reused, not recomputed

  const tally = await service.getTally(created.id);
  assert.equal(tally.sections.length, 4);
  assert.ok((await service.getTranscript(created.id)).segments.length > 0);
});

test('linking a board after the transcript exists tallies immediately, and re-linking a changed board refreshes it', async () => {
  const { service } = await makeService();
  const { id } = await service.createSession({});
  await upload(service, id);
  await service.process(id);
  await waitFor(async () => (await service.getSession(id)).transcription.status === 'complete');

  const linked = await service.attachBoard(id, { boardId: 'b', spec: BOARD });
  assert.equal(linked.tally.status, 'complete');
  const before = linked.tally.key.boardHash;

  const changed = structuredClone(BOARD);
  changed.sections[3].blocks[0].text = 'Sarah AC stops working';
  const relinked = await service.attachBoard(id, { boardId: 'b', spec: changed });
  assert.notEqual(relinked.tally.key.boardHash, before);
  assert.equal((await service.getTally(id)).stats.sectionsTotal, 4);
});

test('process explains itself when there is no video or no Whisper, but still serves a cached transcript', async () => {
  const transcript = transcriptOf(['Most owners think they need more website traffic']);
  const transcription = fakeTranscription({ available: false, transcript });
  const { service } = await makeService({ transcription });
  const { id } = await service.createSession({});
  await assert.rejects(() => service.process(id), (e) => e.status === 400 && /upload/i.test(e.message));

  const withVideo = await upload(service, id);
  await assert.rejects(() => service.process(id), (e) => e.status === 503 && /worker is not running/i.test(e.message));

  transcription.cache.set(withVideo.source.sha256, transcript); // transcribed earlier
  const started = await service.process(id);
  assert.equal(started.transcription.status, 'processing');
  await waitFor(async () => (await service.getSession(id)).transcription.status === 'complete');
});

test('a failed transcription is recorded as a sentence, not a stuck spinner', async () => {
  const transcription = fakeTranscription({ transcript: null });
  transcription.transcribeVideo = async () => { throw new Error('GPU out of memory'); };
  const { service } = await makeService({ transcription });
  const { id } = await service.createSession({});
  await upload(service, id);
  await service.process(id);
  const failed = await waitFor(async () => {
    const s = await service.getSession(id);
    return s.transcription.status === 'failed' && s;
  });
  assert.match(failed.transcription.error, /GPU out of memory/);
});

test('replacing the video clears what was derived from the old one; the same video keeps it', async () => {
  const { service } = await makeService();
  const { id } = await service.createSession({});
  const first = await upload(service, id, 'video one');
  await service.process(id);
  await waitFor(async () => (await service.getSession(id)).transcription.status === 'complete');

  const same = await upload(service, id, 'video one');
  assert.equal(same.transcription.status, 'complete');
  const other = await upload(service, id, 'video two');
  assert.equal(other.transcription.status, 'not_started');
  assert.notEqual(other.source.sha256, first.source.sha256);
  const files = await fs.readdir(service.store.dirFor(id));
  assert.equal(files.filter((f) => f.startsWith('source-')).length, 1);
});

test('sessions stuck "processing" by a restart are marked failed so the page does not wait forever', async () => {
  const { service } = await makeService();
  const { id } = await service.createSession({});
  await service.store.update(id, (s) => { s.transcription = { status: 'processing', progress: 0.4 }; });
  await service.recoverInterrupted();
  const s = await service.getSession(id);
  assert.equal(s.transcription.status, 'failed');
  assert.match(s.transcription.error, /restarted/i);
});

test('an unnamed recording takes its file name; a named one keeps its name', async () => {
  const { service } = await makeService();
  const unnamed = await service.createSession({});
  assert.equal((await upload(service, unnamed.id, 'a', 'episode_12-hvac.mp4')).title, 'episode 12 hvac');
  const named = await service.createSession({ title: 'My title' });
  assert.equal((await upload(service, named.id, 'b', 'whatever.mp4')).title, 'My title');
});

test('unlinking a board and deleting a session', async () => {
  const { service } = await makeService();
  const { id } = await service.createSession({ title: 'x' });
  await service.attachBoard(id, { boardId: 'b', spec: BOARD });
  const unlinked = await service.unlinkBoard(id);
  assert.equal(unlinked.board, null);
  await service.deleteSession(id);
  await assert.rejects(() => service.getSession(id), SessionNotFoundError);
});

/* ---------------------------------- routes -------------------------------- */

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

test('the HTTP API drives a whole session: create, upload a raw body, link, process, read the tally', async () => {
  const { service } = await makeService();
  await withApp(service, async (base) => {
    const json = (path, method, body) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    const created = await (await json('/sessions', 'POST', { title: 'API test' })).json();
    assert.equal(created.title, 'API test');

    const put = await fetch(`${base}/sessions/${created.id}/video?name=episode.mp4`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from('raw bytes of a video') });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).source.fileName, 'episode.mp4');

    assert.equal((await json(`/sessions/${created.id}/board`, 'PUT', { boardId: 'b', title: 'Board', spec: BOARD })).status, 200);
    assert.equal((await json(`/sessions/${created.id}/process`, 'POST', {})).status, 202);
    await waitFor(async () => (await (await fetch(`${base}/sessions/${created.id}`)).json()).tally.status === 'complete');

    const tally = await (await fetch(`${base}/sessions/${created.id}/tally`)).json();
    assert.equal(tally.sections.length, 4);
    const transcript = await (await fetch(`${base}/sessions/${created.id}/transcript`)).json();
    assert.ok(transcript.segments.length > 0);
    const list = await (await fetch(`${base}/sessions`)).json();
    assert.equal(list.sessions.length, 1);
    assert.equal((await fetch(`${base}/status`)).status, 200);
  });
});

test('the HTTP API answers errors with a status and a sentence', async () => {
  const { service } = await makeService();
  await withApp(service, async (base) => {
    assert.equal((await fetch(`${base}/sessions/doesnotexist`)).status, 404);
    const created = await (await fetch(`${base}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    const badType = await fetch(`${base}/sessions/${created.id}/video?name=notes.pdf`, { method: 'PUT', body: Buffer.from('x') });
    assert.equal(badType.status, 400);
    assert.match((await badType.json()).error, /isn't supported/);
    const noBoard = await fetch(`${base}/sessions/${created.id}/tally`);
    assert.equal(noBoard.status, 404);
    const emptyBoard = await fetch(`${base}/sessions/${created.id}/board`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: { sections: [] } }) });
    assert.equal(emptyBoard.status, 400);
  });
});
