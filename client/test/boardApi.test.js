import test from 'node:test';
import assert from 'node:assert/strict';
import { boardApi, generateBoardStream } from '../src/api/board.js';

const enc = new TextEncoder();
const sse = (frames) =>
  new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(frames)); c.close(); } }), {
    status: 200, headers: { 'Content-Type': 'text/event-stream' },
  });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

async function withFetch(stub, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

const BOARD = { version: 1, title: 'T', audience: '', sections: [{ id: 's1', title: 'A', blocks: [] }] };

test('the stream reports the outline and each section, then returns the board', async () => {
  const outlines = [];
  const sections = [];
  const frames = 'event: outline\ndata: {"title":"T","sections":[{"id":"s1","title":"A"}]}\n\n'
    + 'event: section\ndata: {"index":0,"section":{"id":"s1"}}\n\n'
    + `event: result\ndata: ${JSON.stringify({ board: BOARD })}\n\n`;
  const board = await withFetch(async () => sse(frames), () =>
    generateBoardStream('brief', { onOutline: (o) => outlines.push(o), onSection: (s) => sections.push(s) }));
  assert.deepEqual(board, BOARD);
  assert.equal(outlines[0].title, 'T');
  assert.equal(sections[0].index, 0);
});

test('a failed event becomes a thrown plain-sentence error', async () => {
  await withFetch(async () => sse('event: failed\ndata: {"error":"Apollo couldn\'t finish that board."}\n\n'), async () => {
    await assert.rejects(generateBoardStream('brief'), /couldn't finish/);
  });
});

test('a 4xx from the stream route is a real error, not a fallback', async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; return json({ error: 'Write at least 40 characters' }, 400); }, async () => {
    await assert.rejects(generateBoardStream('x'), /at least 40/);
  });
  assert.equal(calls, 1);
});

test('a network failure or 5xx falls back to the plain route', async () => {
  const urls = [];
  const stub = async (url) => {
    urls.push(url);
    if (url.includes('/stream')) throw new TypeError('network down');
    return json({ board: BOARD });
  };
  const board = await withFetch(stub, () => generateBoardStream('brief'));
  assert.deepEqual(board, BOARD);
  assert.deepEqual(urls, ['/api/board/generate/stream', '/api/board/generate']);
});

test('a stream that ends without a result falls back to the plain route', async () => {
  const stub = async (url) => (url.includes('/stream') ? sse('event: outline\ndata: {"title":"T","sections":[]}\n\n') : json({ board: BOARD }));
  assert.deepEqual(await withFetch(stub, () => generateBoardStream('brief')), BOARD);
});

test('an abort is not swallowed by the fallback', async () => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  await withFetch(async () => { throw abort; }, async () => {
    await assert.rejects(generateBoardStream('brief'), { name: 'AbortError' });
  });
});

test('regenerateSection posts the outline and returns the section', async () => {
  let seen;
  const stub = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return json({ section: { id: 's2' } }); };
  const section = await withFetch(stub, () => boardApi.regenerateSection({ brief: 'b', outline: { title: 't', sections: [] }, index: 1, note: 'bigger' }));
  assert.equal(section.id, 's2');
  assert.equal(seen.url, '/api/board/section');
  assert.equal(seen.body.note, 'bigger');
});

test('status returns the server answer and errors carry the server sentence', async () => {
  assert.deepEqual(await withFetch(async () => json({ ready: false, model: 'offline' }), () => boardApi.status()), { ready: false, model: 'offline' });
  await withFetch(async () => json({ error: 'Nope, sorry.' }, 503), async () => {
    await assert.rejects(boardApi.status(), /Nope, sorry\./);
  });
});
