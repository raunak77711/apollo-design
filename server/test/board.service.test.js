import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIEF_MAX, BRIEF_MIN, BoardError, checkBrief, generateBoard, generateSection } from '../src/services/boardService.js';
import { delay, goodSection, isOutline, makeProvider, outlineOf, sectionIndex } from './fixtures/stubProvider.js';
import { SAMPLES } from './fixtures/boardSamples.js';

const BRIEF = 'A video essay about why a slow website loses paid clicks. '.repeat(3);

test('checkBrief enforces the length window with plain sentences', () => {
  assert.match(checkBrief('short'), new RegExp(String(BRIEF_MIN)));
  assert.match(checkBrief('x'.repeat(BRIEF_MAX + 1)), /too long/);
  assert.equal(checkBrief(BRIEF), null);
  assert.ok(checkBrief(undefined));
});

test('generateBoard runs the outline, then every section, and emits events', async () => {
  const events = [];
  const provider = makeProvider((req) => (isOutline(req) ? outlineOf(3) : goodSection()));
  const board = await generateBoard({ brief: BRIEF, provider, onEvent: (name, data) => events.push([name, data]) });
  assert.equal(board.version, 1);
  assert.deepEqual(board.sections.map((s) => s.id), ['s1', 's2', 's3']);
  assert.equal(events[0][0], 'outline');
  assert.deepEqual(events[0][1].sections.map((s) => s.id), ['s1', 's2', 's3']);
  assert.equal(events.filter(([name]) => name === 'section').length, 3);
});

test('the brief leads every section prompt', async () => {
  const provider = makeProvider((req) => (isOutline(req) ? outlineOf(2) : goodSection()));
  await generateBoard({ brief: BRIEF, provider });
  const sectionCalls = provider.calls.filter((c) => !isOutline(c));
  assert.equal(sectionCalls.length, 2);
  for (const call of sectionCalls) assert.ok(call.user.startsWith(`BRIEF:\n${BRIEF}`));
});

test('sections run in parallel but never more than four at once', async () => {
  let inFlight = 0;
  let max = 0;
  const provider = makeProvider(async (req) => {
    if (isOutline(req)) return outlineOf(10);
    inFlight += 1;
    max = Math.max(max, inFlight);
    await delay(15);
    inFlight -= 1;
    return goodSection();
  });
  const board = await generateBoard({ brief: BRIEF, provider });
  assert.equal(board.sections.length, 10);
  assert.equal(max, 4);
});

test('a section with a bad block is retried once with the validator errors in the prompt', async () => {
  const seen = [];
  const provider = makeProvider((req) => {
    if (isOutline(req)) return outlineOf(1);
    seen.push(req.user);
    return seen.length === 1 ? { blocks: [SAMPLES.title, { type: 'carousel' }] } : goodSection();
  });
  const board = await generateBoard({ brief: BRIEF, provider });
  assert.equal(seen.length, 2);
  assert.match(seen[1], /unknown block type "carousel"/);
  assert.equal(board.sections[0].degraded, undefined);
  assert.equal(board.sections[0].blocks.length, 2);
});

test('a section that stays mildly wrong is kept after the retry, not degraded', async () => {
  const provider = makeProvider((req) => (isOutline(req) ? outlineOf(1) : { blocks: [SAMPLES.title, { type: 'carousel' }, SAMPLES.flow] }));
  const board = await generateBoard({ brief: BRIEF, provider });
  assert.equal(board.sections[0].degraded, undefined);
  assert.equal(board.sections[0].blocks.length, 2);
});

test('two failed calls degrade that section but not the board', async () => {
  const provider = makeProvider((req) => {
    if (isOutline(req)) return outlineOf(2);
    if (sectionIndex(req) === 1) throw new Error('boom');
    return goodSection();
  });
  const board = await generateBoard({ brief: BRIEF, provider });
  assert.equal(board.sections[0].degraded, undefined);
  assert.equal(board.sections[1].degraded, true);
  assert.deepEqual(board.sections[1].blocks.map((b) => b.type), ['title', 'statement']);
});

test('a model that returns nothing usable degrades the section', async () => {
  const provider = makeProvider((req) => (isOutline(req) ? outlineOf(1) : { blocks: [] }));
  const board = await generateBoard({ brief: BRIEF, provider });
  assert.equal(board.sections[0].degraded, true);
});

test('a fatal provider error (bad key) fails the whole board instead of degrading everything', async () => {
  const provider = makeProvider((req) => {
    if (isOutline(req)) return outlineOf(3);
    throw Object.assign(new Error('unauthorised'), { status: 401 });
  });
  await assert.rejects(generateBoard({ brief: BRIEF, provider }), (err) => err.status === 401);
});

test('a brief with no usable chapters is a plain-sentence 422', async () => {
  const provider = makeProvider(() => ({ sections: [] }));
  await assert.rejects(generateBoard({ brief: BRIEF, provider }), (err) => err instanceof BoardError && err.status === 422 && /couldn't find any sections/.test(err.message));
});

test('a too-short brief is a 400 before any model call', async () => {
  const provider = makeProvider(() => outlineOf(1));
  await assert.rejects(generateBoard({ brief: 'tiny', provider }), (err) => err.status === 400);
  assert.equal(provider.calls.length, 0);
});

test('aborting stops further model calls', async () => {
  const ctrl = new AbortController();
  const provider = makeProvider(async (req) => {
    if (isOutline(req)) return outlineOf(8);
    ctrl.abort();
    await delay(5);
    return goodSection();
  });
  await assert.rejects(generateBoard({ brief: BRIEF, provider, signal: ctrl.signal }), { name: 'AbortError' });
  assert.ok(provider.calls.length <= 5, `made ${provider.calls.length} calls after abort`);
});

test('generateSection rebuilds one section and passes the creator note along', async () => {
  const provider = makeProvider(() => goodSection());
  const section = await generateSection({ brief: BRIEF, outline: outlineOf(3), index: 1, note: 'make it more visual', provider });
  assert.equal(section.id, 's2');
  assert.equal(section.title, 'Section 2');
  assert.match(provider.calls[0].user, /make it more visual/);
});
