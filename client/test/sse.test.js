import test from 'node:test';
import assert from 'node:assert/strict';
import { readEventStream } from '../src/lib/sse.js';

const enc = new TextEncoder();
const streamOf = (chunks) =>
  new Response(new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  }));

async function collect(chunks) {
  const events = [];
  await readEventStream(streamOf(chunks), (event, data) => events.push([event, data]));
  return events;
}

test('parses events delivered whole', async () => {
  const events = await collect(['event: outline\ndata: {"a":1}\n\nevent: result\ndata: {"b":2}\n\n']);
  assert.deepEqual(events, [['outline', { a: 1 }], ['result', { b: 2 }]]);
});

test('reassembles frames split across chunks', async () => {
  const events = await collect(['event: sec', 'tion\ndata: {"i"', ':3}\n', '\nevent: result\ndata: {}\n\n']);
  assert.deepEqual(events, [['section', { i: 3 }], ['result', {}]]);
});

test('flushes a final frame that has no trailing blank line', async () => {
  const events = await collect(['event: result\ndata: {"ok":true}']);
  assert.deepEqual(events, [['result', { ok: true }]]);
});

test('skips malformed and incomplete frames', async () => {
  const events = await collect(['event: a\ndata: {not json}\n\ndata: {"x":1}\n\nevent: b\n\nevent: c\ndata: {"y":2}\n\n']);
  assert.deepEqual(events, [['c', { y: 2 }]]);
});
