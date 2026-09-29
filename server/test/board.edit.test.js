import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildEditPrompt } from '../src/design/board/prompts.js';
import { createBoardRouter } from '../src/routes/board.js';
import { BoardError, editBoard, sanitizeEditContext } from '../src/services/boardService.js';
import { NotConfiguredError } from '../src/services/ai/AIProvider.js';
import { makeProvider } from './fixtures/stubProvider.js';
import { SAMPLES } from './fixtures/boardSamples.js';

const outline = {
  title: 'T',
  sections: [{
    id: 's3', title: 'YOU PAID FOR THE CLICK',
    blocks: [
      { id: 's3.b2', type: 'flow', parts: [{ id: 's3.b2.n1', label: '$5 CLICK' }, { id: 's3.b2.n2', label: 'WEBSITE' }] },
      { id: 's3.b3', type: 'hub', parts: [{ id: 's3.b3.center', label: 'BROWSER' }] },
    ],
  }],
  annotations: [{ id: 'a_1', kind: 'text', section: 's3', label: 'LEAK' }],
};
const run = (ops, extra = {}) =>
  editBoard({ message: 'do a thing', outline, selection: [], provider: makeProvider(() => ({ operations: ops, message: 'Done.' })), ...extra });

test('valid operations on known ids are kept, with the model\'s sentence', async () => {
  const r = await run([
    { type: 'SET_STYLE', target: 's3.b2.n1', changes: { fontSize: 120 } },
    { type: 'MOVE', target: 's3.b3', relativeTo: 's3.b2', position: 'below' },
    { type: 'ADD_SHAPE', shape: 'circle', relativeTo: 's3.b2.n2', position: 'below', style: { color: 'problem' } },
  ]);
  assert.equal(r.operations.length, 3);
  assert.equal(r.operations[0].targets[0], 's3.b2.n1');
  assert.equal(r.message, 'Done.');
  assert.equal(r.dropped, 0);
});

test('an operation naming an id that is not in the outline is dropped, not applied', async () => {
  const r = await run([
    { type: 'DELETE', target: 's3.b2.n1' },
    { type: 'DELETE', target: 's9.b1.n7' },
    { type: 'MOVE', target: 's3.b2', relativeTo: 's3.zzz', position: 'below' },
    { type: 'CONNECT', from: 's3.b2.n1', to: 'a_1' },
  ]);
  assert.deepEqual(r.operations.map((o) => o.type), ['DELETE', 'CONNECT']);
  assert.equal(r.dropped, 2);
});

test('malformed and internal operations are dropped, and a silent model gets a plain sentence', async () => {
  const silent = makeProvider(() => ({ operations: [{ type: 'NOPE' }, { type: 'OVERRIDE_SET', id: 's3.b2', patch: { dx: 1 } }, 'text', null, { type: 'SET_STYLE', target: 's3.b2', changes: { junk: 1 } }] }));
  const r = await editBoard({ message: 'do a thing', outline, selection: [], provider: silent });
  assert.deepEqual(r.operations, []);
  assert.equal(r.dropped, 5);
  assert.match(r.message, /couldn't turn that into a change/i);
});

test('INSERT_BLOCK needs a known section', async () => {
  const good = await run([{ type: 'INSERT_BLOCK', section: 's3', index: 1, block: SAMPLES.statement }]);
  assert.equal(good.operations.length, 1);
  const bad = await run([{ type: 'INSERT_BLOCK', section: 's8', block: SAMPLES.statement }]);
  assert.equal(bad.operations.length, 0);
});

test('at most forty operations are considered', async () => {
  const many = Array.from({ length: 60 }, () => ({ type: 'ROTATE', target: 's3.b2', angle: 5 }));
  assert.equal((await run(many)).operations.length, 40);
});

test('a model that answers with nonsense yields no operations and a sentence, not an error', async () => {
  const provider = makeProvider(() => ({ operations: 'lots', message: 12 }));
  const r = await editBoard({ message: 'do a thing', outline, selection: [], provider });
  assert.deepEqual(r.operations, []);
  assert.ok(r.message.length > 0);
});

test('the instruction must be between 3 and 600 characters', async () => {
  const provider = makeProvider(() => ({ operations: [], message: '' }));
  await assert.rejects(editBoard({ message: 'hi', outline, selection: [], provider }), (e) => e instanceof BoardError && e.status === 400);
  await assert.rejects(editBoard({ message: 'x'.repeat(601), outline, selection: [], provider }), (e) => e.status === 400);
  assert.equal(provider.calls.length, 0);
});

test('a fatal provider error propagates', async () => {
  const provider = makeProvider(() => { throw Object.assign(new Error('nope'), { status: 401 }); });
  await assert.rejects(editBoard({ message: 'make it bigger', outline, selection: [], provider }), (e) => e.status === 401);
});

test('sanitizeEditContext never lets pixel data or huge lists reach the model', () => {
  const dirty = {
    title: 'T',
    sections: Array.from({ length: 30 }, (_, i) => ({
      id: `s${i + 1}`, title: 'x'.repeat(300),
      blocks: [{ id: `s${i + 1}.b1`, type: 'flow', parts: Array.from({ length: 80 }, (__, j) => ({ id: `s${i + 1}.b1.n${j}`, label: 'data:image/png;base64,AAAA' })) }],
    })),
    annotations: Array.from({ length: 100 }, (_, i) => ({ id: `a_${i}`, kind: 'text', section: 's1', label: 'data:image/png;base64,BBBB' })),
  };
  const { outline: clean, selection } = sanitizeEditContext(dirty, Array.from({ length: 50 }, (_, i) => `a_${i}`));
  assert.equal(clean.sections.length, 20);
  assert.equal(clean.sections[0].blocks[0].parts.length, 30);
  assert.equal(clean.annotations.length, 60);
  assert.equal(selection.length, 30);
  assert.doesNotMatch(JSON.stringify(clean), /data:image/);
  assert.ok(clean.sections[0].title.length <= 80);
});

test('sanitizeEditContext rejects a context that is not an outline or is enormous', () => {
  assert.throws(() => sanitizeEditContext('nope', []), (e) => e.status === 400);
  assert.throws(() => sanitizeEditContext({ sections: 'x' }, []), (e) => e.status === 400);
  const enormous = { sections: [{ id: 's1', title: 't', blocks: [] }], annotations: [], padding: 'x'.repeat(600000) };
  assert.throws(() => sanitizeEditContext(enormous, []), (e) => e.status === 400);
  const wide = {
    title: 'T',
    sections: Array.from({ length: 20 }, (_, i) => ({
      id: `s${i + 1}`, title: 't',
      blocks: Array.from({ length: 12 }, (__, j) => ({
        id: `s${i + 1}.b${j + 1}`, type: 'flow',
        parts: Array.from({ length: 30 }, (___, k) => ({ id: `s${i + 1}.b${j + 1}.n${k + 1}`, label: 'L'.repeat(80) })),
      })),
    })),
    annotations: [],
  };
  assert.throws(() => sanitizeEditContext(wide, []), (e) => e.status === 400, 'a board too big to fit a prompt is refused, not silently truncated');
});

test('the edit prompt carries the instruction, the selection and the outline', () => {
  const { system, user } = buildEditPrompt({ message: 'make this bigger', outline, selection: ['s3.b2.n1'] });
  assert.match(user, /make this bigger/);
  assert.match(user, /s3\.b2\.n1/);
  assert.match(user, /\$5 CLICK/);
  for (const type of ['SET_TEXT', 'SET_STYLE', 'MOVE', 'RESIZE', 'INSERT_BLOCK', 'CONNECT', 'ADD_ARROW', 'FOCUS']) assert.ok(system.includes(type), `system prompt lacks ${type}`);
  assert.match(system, /Never invent ids/);
});

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
const post = (base, body) => fetch(`${base}/edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('POST /edit returns validated operations', async () => {
  const provider = makeProvider(() => ({ operations: [{ type: 'ROTATE', target: 's3.b2', angle: 10 }, { type: 'DELETE', target: 'ghost' }], message: 'Tilted it.' }));
  await withServer(provider, async (base) => {
    const res = await post(base, { message: 'tilt the flow', outline, selection: [] });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.operations.length, 1);
    assert.equal(body.message, 'Tilted it.');
  });
});

test('POST /edit answers a bad instruction with a plain 400 and a missing model with a friendly 503', async () => {
  await withServer(makeProvider(() => ({})), async (base) => {
    const res = await post(base, { message: 'a', outline, selection: [] });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /instruction/i);
  });
  await withServer(makeProvider(() => { throw new NotConfiguredError(); }), async (base) => {
    const res = await post(base, { message: 'make it bigger', outline, selection: [] });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /needs a DeepSeek key/);
  });
});
