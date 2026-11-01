import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_OP_TYPES, sanitizeStyle, validateBoardOperation } from '../src/design/board/operations.js';
import { SAMPLES } from './fixtures/boardSamples.js';

const ok = (op) => {
  const r = validateBoardOperation(op);
  assert.ok(r.ok, r.error);
  return r.op;
};
const bad = (op) => assert.equal(validateBoardOperation(op).ok, false, JSON.stringify(op));

test('SET_TEXT needs one target and text', () => {
  assert.deepEqual(ok({ type: 'SET_TEXT', target: 's1.b1.n1', text: 'Hello' }).targets, ['s1.b1.n1']);
  bad({ type: 'SET_TEXT', target: 's1.b1.n1' });
  bad({ type: 'SET_TEXT', text: 'no target' });
});

test('targets are deduplicated, capped and must look like ids', () => {
  const many = Array.from({ length: 80 }, (_, i) => `s1.b${i}`);
  assert.equal(ok({ type: 'DELETE', targets: [...many, ...many] }).targets.length, 50);
  bad({ type: 'DELETE', target: '../etc/passwd' });
  bad({ type: 'DELETE', target: 'x'.repeat(200) });
});

test('SET_STYLE keeps only whitelisted keys, clamps values, and needs at least one', () => {
  const op = ok({ type: 'SET_STYLE', targets: ['s3.b1'], changes: { fontSize: 5000, color: 'problem', bogus: 1, fontFamily: 'Comic Sans' } });
  assert.deepEqual(op.changes, { fontSize: 400, color: 'problem' });
  bad({ type: 'SET_STYLE', targets: ['s3.b1'], changes: { bogus: 1 } });
  bad({ type: 'SET_STYLE', targets: ['s3.b1'] });
});

test('sanitizeStyle validates colours and enums', () => {
  assert.deepEqual(sanitizeStyle({ color: '#ff0000', align: 'left', opacity: 2, italic: true }), { color: '#ff0000', align: 'left', opacity: 1, italic: true });
  assert.deepEqual(sanitizeStyle({ color: 'javascript:alert(1)', align: 'justify' }), {});
  assert.deepEqual(sanitizeStyle({ fontWeight: 'bold', dash: true, radius: -4 }), { fontWeight: 'bold', dash: true, radius: 0 });
  assert.deepEqual(sanitizeStyle({ headEnd: true, headStart: false, headMiddle: true }), { headEnd: true, headStart: false });
});

test('MOVE takes dx/dy or a relative placement, never neither', () => {
  assert.deepEqual(ok({ type: 'MOVE', target: 's1.b1', dx: 10, dy: -20 }), { type: 'MOVE', targets: ['s1.b1'], dx: 10, dy: -20 });
  const rel = ok({ type: 'MOVE', target: 's3.b2', relativeTo: 's3.b1', position: 'below' });
  assert.equal(rel.gap, 40);
  assert.equal(rel.align, 'center');
  bad({ type: 'MOVE', target: 's1.b1' });
  bad({ type: 'MOVE', target: 's1.b1', dx: 10 });
  bad({ type: 'MOVE', target: 's3.b2', relativeTo: 's3.b1', position: 'diagonally' });
});

test('RESIZE takes scale or scaleX+scaleY within range', () => {
  assert.equal(ok({ type: 'RESIZE', target: 'a_1', scale: 1.5 }).scale, 1.5);
  assert.equal(ok({ type: 'RESIZE', target: 'a_1', scale: 99 }).scale, 10);
  assert.equal(ok({ type: 'RESIZE', target: 'a_1', scaleX: 2, scaleY: 0.5 }).scaleY, 0.5);
  bad({ type: 'RESIZE', target: 'a_1' });
  bad({ type: 'RESIZE', target: 'a_1', scaleX: 2 });
});

test('ROTATE clamps the angle', () => {
  assert.equal(ok({ type: 'ROTATE', target: 'a_1', angle: 720 }).angle, 360);
  bad({ type: 'ROTATE', target: 'a_1', angle: 'up' });
});

test('DELETE and RESTORE need targets', () => {
  ok({ type: 'DELETE', targets: ['s1.b1'] });
  ok({ type: 'RESTORE', target: 's1.b1' });
  bad({ type: 'DELETE' });
});

test('INSERT_BLOCK normalizes the block with the shared schema', () => {
  const op = ok({ type: 'INSERT_BLOCK', section: 's2', index: 1, block: SAMPLES.statement });
  assert.equal(op.block.type, 'statement');
  assert.equal(op.index, 1);
  bad({ type: 'INSERT_BLOCK', section: 's2', block: { type: 'nope' } });
  bad({ type: 'INSERT_BLOCK', section: 'section-two', block: SAMPLES.statement });
});

test('REPLACE_BLOCK targets a block id', () => {
  ok({ type: 'REPLACE_BLOCK', target: 's2.b3', block: SAMPLES.flow });
  bad({ type: 'REPLACE_BLOCK', target: 's2', block: SAMPLES.flow });
  bad({ type: 'REPLACE_BLOCK', target: 's2.b3.n1', block: SAMPLES.flow });
});

test('CONNECT and DISCONNECT need two ids', () => {
  assert.equal(ok({ type: 'CONNECT', from: 's1.b1.n1', to: 's1.b1.n2' }).tone, 'ink');
  ok({ type: 'DISCONNECT', from: 's1.b1.n1', to: 's1.b1.n2' });
  bad({ type: 'CONNECT', from: 's1.b1.n1' });
});

test('ADD_TEXT, ADD_SHAPE and ADD_ARROW build annotations', () => {
  const t = ok({ type: 'ADD_TEXT', text: 'THIS IS THE LEAK', section: 's3', x: 700, y: 400, style: { color: 'problem', fontSize: 120 } });
  assert.equal(t.style.fontSize, 120);
  const s = ok({ type: 'ADD_SHAPE', shape: 'circle', relativeTo: 's3.b1.n3', position: 'over' });
  assert.equal(s.shape, 'circle');
  assert.equal(s.position, 'over');
  assert.equal('width' in s, false, 'a shape with no stated size sizes itself to its target');
  assert.equal(ok({ type: 'ADD_SHAPE', shape: 'rectangle', width: 300, height: 90 }).width, 300);
  const a = ok({ type: 'ADD_ARROW', from: 's3.b1.n1', to: 's3.b1.n2', dashed: true });
  assert.equal(a.dashed, true);
  bad({ type: 'ADD_TEXT' });
  bad({ type: 'ADD_SHAPE', shape: 'hexagon' });
  bad({ type: 'ADD_ARROW' });
});

test('FOCUS and SET_VIEW', () => {
  ok({ type: 'FOCUS', target: 's3.b1' });
  assert.equal(ok({ type: 'SET_VIEW', zoom: 9, x: 0, y: 0 }).zoom, 4);
  bad({ type: 'SET_VIEW', x: 0, y: 0 });
});

test('unknown and internal operation types are rejected', () => {
  bad({ type: 'DROP_TABLE' });
  bad({ type: 'OVERRIDE_SET', id: 's1.b1', patch: { dx: 1 } });
  bad({ type: 'ANNOTATIONS_CLEAR' });
  bad(null);
  bad('MOVE');
  assert.equal(BOARD_OP_TYPES.length, 16);
});
