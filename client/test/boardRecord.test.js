import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, createBoardState } from '../src/components/board/state/boardState.js';
import { exportBoard, newBoardRecord, parseBoardFile, recordFromState, sanitizeSpec, stateFromRecord } from '../src/components/board/state/boardRecord.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const rawSpec = () => ({
  title: 'T',
  sections: [
    { title: 'One', blocks: [SAMPLES.title, SAMPLES.flow] },
    { title: 'Two', blocks: [SAMPLES.statement] },
  ],
});

test('sanitizeSpec assigns ids, drops invalid blocks and empty sections', () => {
  const spec = sanitizeSpec({ ...rawSpec(), sections: [...rawSpec().sections, { title: 'Bad', blocks: [{ type: 'nope' }] }] });
  assert.deepEqual(spec.sections.map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(spec.sections[0].blocks.map((b) => b.id), ['s1.b1', 's1.b2']);
  assert.equal(sanitizeSpec({ sections: [] }), null);
  assert.equal(sanitizeSpec(null), null);
});

test('sanitizeSpec keeps existing stable ids (a board that had blocks inserted)', () => {
  const spec = sanitizeSpec({
    title: 'T',
    sections: [{ id: 's1', title: 'One', blocks: [{ ...SAMPLES.title, id: 's1.b3' }, { ...SAMPLES.flow, id: 's1.b1' }, { ...SAMPLES.quote }] }],
  });
  assert.deepEqual(spec.sections[0].blocks.map((b) => b.id), ['s1.b3', 's1.b1', 's1.b4']);
});

test('sanitizeSpec repairs duplicate ids', () => {
  const spec = sanitizeSpec({ title: 'T', sections: [{ id: 's1', title: 'One', blocks: [{ ...SAMPLES.title, id: 's1.b1' }, { ...SAMPLES.flow, id: 's1.b1' }] }] });
  assert.deepEqual(spec.sections[0].blocks.map((b) => b.id), ['s1.b1', 's1.b2']);
});

test('a record survives state -> record -> state', () => {
  let state = createBoardState({ spec: sanitizeSpec(rawSpec()), brief: 'the brief' });
  state = applyOperation(state, { type: 'MOVE', targets: ['s1.b1'], dx: 4, dy: 5 });
  state = applyOperation(state, { type: 'ADD_TEXT', text: 'hi', section: 's2', x: 1, y: 2 });
  state = applyOperation(state, { type: 'VIEW_SET', zoom: 1.5, x: 3, y: 4 });
  const record = recordFromState(state, { id: 'b1', createdAt: 10, updatedAt: 20 });
  assert.equal(record.id, 'b1');
  assert.equal(record.title, 'T');
  const back = stateFromRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(back, state);
});

test('exportBoard / parseBoardFile round-trip and validate', () => {
  const rec = newBoardRecord({ id: 'b9', spec: sanitizeSpec(rawSpec()), brief: 'b' });
  const parsed = parseBoardFile(exportBoard(rec));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.record.spec.sections.length, 2);
  assert.equal(parseBoardFile('not json').ok, false);
  assert.equal(parseBoardFile(JSON.stringify({ format: 'something-else' })).ok, false);
  assert.equal(parseBoardFile(JSON.stringify({ format: 'apollo-board', board: { spec: { sections: [] } } })).ok, false);
});

test('parseBoardFile discards malformed overrides, annotations, assets and connections', () => {
  const rec = newBoardRecord({ id: 'b9', spec: sanitizeSpec(rawSpec()), brief: 'b' });
  const dirty = {
    ...rec,
    overrides: { 's1.b1': { dx: 5, evil: '<script>', dy: 'nope' }, junk: 5 },
    annotations: [{ id: 'a_1', section: 's1', kind: 'text', json: { type: 'textbox' } }, { id: 5 }, 'x'],
    assets: { good: 'data:image/png;base64,AAAA', bad: 'http://evil.test/x.png', worse: 7 },
    connections: [{ id: 'c_1', from: 'a', to: 'b', tone: 'ink', dashed: false }, { from: 'a' }],
  };
  const { record } = parseBoardFile(JSON.stringify({ format: 'apollo-board', version: 1, board: dirty }));
  assert.deepEqual(record.overrides, { 's1.b1': { dx: 5 } });
  assert.deepEqual(record.annotations.map((a) => a.id), ['a_1']);
  assert.deepEqual(Object.keys(record.assets), ['good']);
  assert.equal(record.connections.length, 1);
});
