import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createBoardRouter } from '../src/routes/board.js';
import { NotConfiguredError } from '../src/services/ai/AIProvider.js';
import { goodSection, isOutline, makeProvider, outlineOf } from './fixtures/stubProvider.js';

const BRIEF = 'A video essay about why a slow website loses paid clicks. '.repeat(3);

async function withServer(provider, fn) {
  const app = express();
  app.use(express.json());
  app.use('/api/board', createBoardRouter({ provider }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/board`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, path, body) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function parseSSE(text) {
  return text.split('\n\n').filter(Boolean).map((frame) => ({
    event: /^event: (.+)$/m.exec(frame)?.[1],
    data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] || 'null'),
  }));
}

const provider = () => makeProvider((req) => (isOutline(req) ? outlineOf(2) : goodSection()));

test('GET /status reports whether a live model is configured', async () => {
  await withServer(provider(), async (base) => {
    assert.deepEqual(await (await fetch(`${base}/status`)).json(), { ready: true, model: 'stub' });
  });
  await withServer(makeProvider(() => ({}), { live: false }), async (base) => {
    assert.equal((await (await fetch(`${base}/status`)).json()).ready, false);
  });
});

test('POST /generate/stream narrates outline, sections, then the result', async () => {
  await withServer(provider(), async (base) => {
    const res = await post(base, '/generate/stream', { brief: BRIEF });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const frames = parseSSE(await res.text());
    assert.equal(frames[0].event, 'outline');
    assert.equal(frames.filter((f) => f.event === 'section').length, 2);
    const last = frames.at(-1);
    assert.equal(last.event, 'result');
    assert.equal(last.data.board.sections.length, 2);
  });
});

test('POST /generate/stream rejects a short brief with a plain 400 before streaming', async () => {
  await withServer(provider(), async (base) => {
    const res = await post(base, '/generate/stream', { brief: 'tiny' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /at least/);
  });
});

test('POST /generate returns the whole board', async () => {
  await withServer(provider(), async (base) => {
    const res = await post(base, '/generate', { brief: BRIEF });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).board.sections.length, 2);
  });
});

test('a missing model is a friendly 503 that never names a provider or status code', async () => {
  const p = makeProvider(() => { throw new NotConfiguredError(); });
  await withServer(p, async (base) => {
    const res = await post(base, '/generate', { brief: BRIEF });
    assert.equal(res.status, 503);
    const { error } = await res.json();
    assert.match(error, /needs a DeepSeek key/);
    assert.doesNotMatch(error, /\b40[123]\b/);
  });
});

test('a stream that fails after it began ends with a failed event', async () => {
  const p = makeProvider(() => ({ sections: [] }));
  await withServer(p, async (base) => {
    const frames = parseSSE(await (await post(base, '/generate/stream', { brief: BRIEF })).text());
    assert.equal(frames.at(-1).event, 'failed');
    assert.match(frames.at(-1).data.error, /couldn't find any sections/);
  });
});

test('POST /section rebuilds one section from a client-held outline', async () => {
  await withServer(provider(), async (base) => {
    const res = await post(base, '/section', { brief: BRIEF, outline: outlineOf(3), index: 2, note: 'bigger' });
    assert.equal(res.status, 200);
    const { section } = await res.json();
    assert.equal(section.id, 's3');
  });
});

test('POST /section validates its body', async () => {
  await withServer(provider(), async (base) => {
    assert.equal((await post(base, '/section', { brief: BRIEF, outline: outlineOf(2), index: 9 })).status, 400);
    assert.equal((await post(base, '/section', { brief: BRIEF, outline: { sections: [] }, index: 0 })).status, 400);
    assert.equal((await post(base, '/section', { brief: 'x', outline: outlineOf(2), index: 0 })).status, 400);
  });
});
