import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAIOperations } from '../src/components/board/direct/runDirect.js';
import { resolveOperation } from '../src/components/board/direct/resolveOps.js';
import { buildSceneOutline } from '../src/components/board/direct/sceneOutline.js';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { applyOperation, createBoardState } from '../src/components/board/state/boardState.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sections = [{ id: 's1', y: 0, height: 1000 }, { id: 's2', y: 1000, height: 1000 }];
const boxes = { mover: { x: 100, y: 100, w: 200, h: 50 }, rel: { x: 500, y: 300, w: 100, h: 100 } };
const ctx = { sections, boundsOf: (id) => boxes[id] || null };

/* ------------------------------ resolveOperation --------------------------- */

test('MOVE below another object: centred under it, a gap apart', () => {
  const [op] = resolveOperation({ type: 'MOVE', targets: ['mover'], relativeTo: 'rel', position: 'below', gap: 40, align: 'center' }, ctx);
  assert.deepEqual(op, { type: 'MOVE', targets: ['mover'], dx: 350, dy: 340 });
});

test('MOVE honours above, left, right and start/end alignment', () => {
  const at = (extra) => resolveOperation({ type: 'MOVE', targets: ['mover'], relativeTo: 'rel', gap: 20, ...extra }, ctx)[0];
  assert.deepEqual([at({ position: 'over' }).dx, at({ position: 'over' }).dy], [550 - 100 - 100, 350 - 25 - 100], 'over centres the mover on the anchor');
  assert.deepEqual([at({ position: 'above' }).dx, at({ position: 'above' }).dy], [350, 300 - 20 - 50 - 100]);
  assert.deepEqual([at({ position: 'right' }).dx, at({ position: 'right' }).dy], [500 + 100 + 20 - 100, 300 + 100 / 2 - 50 / 2 - 100]);
  assert.equal(at({ position: 'below', align: 'start' }).dx, 400);
  assert.equal(at({ position: 'below', align: 'end' }).dx, 500 + 100 - 200 - 100);
  assert.equal(at({ position: 'left' }).dx, 500 - 20 - 200 - 100);
});

test('moving several targets moves the group as one, by the union of their bounds', () => {
  const both = { ...ctx, boundsOf: (id) => ({ a: { x: 0, y: 0, w: 100, h: 100 }, b: { x: 200, y: 0, w: 100, h: 100 }, rel: boxes.rel })[id] };
  const [op] = resolveOperation({ type: 'MOVE', targets: ['a', 'b'], relativeTo: 'rel', position: 'below', gap: 0, align: 'start' }, both);
  assert.equal(op.dx, 500 - 0);
  assert.equal(op.dy, 400 - 0);
});

test('a relative move whose target or anchor cannot be found is dropped', () => {
  assert.deepEqual(resolveOperation({ type: 'MOVE', targets: ['ghost'], relativeTo: 'rel', position: 'below' }, ctx), []);
  assert.deepEqual(resolveOperation({ type: 'MOVE', targets: ['mover'], relativeTo: 'ghost', position: 'below' }, ctx), []);
});

test('MOVE with dx/dy, and other operations, pass through unchanged', () => {
  const move = { type: 'MOVE', targets: ['mover'], dx: 5, dy: 6 };
  assert.deepEqual(resolveOperation(move, ctx), [move]);
  const style = { type: 'SET_STYLE', targets: ['mover'], changes: { fontSize: 90 } };
  assert.deepEqual(resolveOperation(style, ctx), [style]);
  const focus = { type: 'FOCUS', targets: ['mover'] };
  assert.deepEqual(resolveOperation(focus, ctx), [focus]);
});

test('ADD_SHAPE relative to an object becomes a section-relative placement', () => {
  const [op] = resolveOperation({ type: 'ADD_SHAPE', shape: 'circle', width: 200, height: 100, relativeTo: 'rel', position: 'below', gap: 20 }, {
    sections, boundsOf: () => ({ x: 500, y: 1900, w: 100, h: 50 }),
  });
  // rel is at world y 1900–1950 (section s2, which starts at 1000); the shape's top goes at 1970 and its centre at 2020
  assert.equal(op.section, 's2');
  assert.equal(op.x, 550);
  assert.equal(op.y, 2020 - 1000);
  assert.equal('relativeTo' in op, false);
});

test('ADD_SHAPE over an object sizes itself around it and is centred on it', () => {
  const [op] = resolveOperation({ type: 'ADD_SHAPE', shape: 'circle', relativeTo: 'rel', position: 'over' }, ctx);
  assert.equal(op.width, 100 + 80);
  assert.equal(op.height, 100 + 50);
  assert.equal(op.x, 550);
  assert.equal(op.y, 350);
  assert.equal(op.section, 's1');
});

test('ADD_TEXT relative to an object is centred on it, top-anchored', () => {
  const [op] = resolveOperation({ type: 'ADD_TEXT', text: 'LEAK', style: { fontSize: 100 }, relativeTo: 'rel', position: 'above', gap: 10 }, ctx);
  assert.equal(op.section, 's1');
  assert.equal(op.x, 550);
  assert.equal(op.y, 300 - 10 - 100 * 1.1);
});

test('ADD_ARROW between two ids becomes a live connection', () => {
  const [op] = resolveOperation({ type: 'ADD_ARROW', from: 'mover', to: 'rel', dashed: true, tone: 'problem' }, ctx);
  assert.deepEqual(op, { type: 'CONNECT', from: 'mover', to: 'rel', tone: 'problem', dashed: true });
  const free = { type: 'ADD_ARROW', section: 's1', x1: 0, y1: 0, x2: 10, y2: 10 };
  assert.deepEqual(resolveOperation(free, ctx), [free]);
});

/* ------------------------------ buildSceneOutline -------------------------- */

const spec = sanitizeSpec({ title: 'T', sections: [{ title: 'S', blocks: [SAMPLES.title, { type: 'flow', steps: ['A', 'B', 'C'] }] }] });
const scene = layoutBoard(spec, stubMeasure);

test('the outline names every block and its labelled parts', () => {
  const o = buildSceneOutline({ scene, state: createBoardState({ spec }) });
  assert.equal(o.title, 'T');
  const flow = o.sections[0].blocks.find((b) => b.type === 'flow');
  assert.deepEqual(flow.parts.map((p) => [p.id, p.label]), [['s1.b2.n1', 'A'], ['s1.b2.n2', 'B'], ['s1.b2.n3', 'C']]);
  assert.ok(o.sections[0].blocks.every((b) => b.parts.every((p) => !p.id.includes('.c'))), 'connectors are not parts');
});

test('the outline reflects edits: changed text, hidden pieces, annotations', () => {
  let state = createBoardState({ spec });
  state = applyOperation(state, { type: 'SET_TEXT', targets: ['s1.b2.n1'], text: 'RENAMED' });
  state = applyOperation(state, { type: 'DELETE', targets: ['s1.b2.n2'] });
  state = applyOperation(state, { type: 'ADD_TEXT', text: 'THIS IS THE LEAK', section: 's1', x: 700, y: 100 });
  const o = buildSceneOutline({ scene, state });
  const flow = o.sections[0].blocks[1];
  assert.equal(flow.parts[0].label, 'RENAMED');
  assert.equal(flow.parts[1].hidden, true);
  assert.deepEqual(o.annotations.map((a) => [a.kind, a.label]), [['text', 'THIS IS THE LEAK']]);
});

test('the outline never carries image data and clips long labels', () => {
  let state = createBoardState({ spec });
  state = { ...state, assets: { img_1: `data:image/png;base64,${'A'.repeat(5000)}` }, annotations: [{ id: 'a_1', section: 's1', kind: 'image', json: { type: 'image', src: 'asset:img_1' } }] };
  state = applyOperation(state, { type: 'SET_TEXT', targets: ['s1.b2.n1'], text: 'x'.repeat(500) });
  const text = JSON.stringify(buildSceneOutline({ scene, state }));
  assert.doesNotMatch(text, /data:image/);
  assert.ok(text.length < 3000);
});

/* ------------------------------ applyAIOperations -------------------------- */

function fakeEditor() {
  const calls = [];
  const editor = {
    state: { v: 0 },
    getState() { return this.state; },
    getScene: () => ({ sections }),
    boundsOf: (id) => boxes[id] || null,
    dispatch(op, opts) { calls.push(['dispatch', op.type, opts]); this.state = { v: this.state.v + 1 }; return true; },
    recordUndoPoint(prev) { calls.push(['undo-point', prev]); },
    focusObject(id) { calls.push(['focus', id]); },
  };
  return { editor, calls };
}

test('a batch is applied op by op with one undo step, then focus', () => {
  const { editor, calls } = fakeEditor();
  const before = editor.getState();
  const r = applyAIOperations(editor, {
    message: 'Done.',
    operations: [
      { type: 'RESIZE', targets: ['mover'], scale: 2 },
      { type: 'MOVE', targets: ['mover'], relativeTo: 'rel', position: 'below' },
      { type: 'FOCUS', targets: ['mover'] },
    ],
  });
  assert.deepEqual(calls.map((c) => c[0]), ['dispatch', 'dispatch', 'undo-point', 'focus']);
  assert.ok(calls.filter((c) => c[0] === 'dispatch').every((c) => c[2].record === false));
  assert.equal(calls.find((c) => c[0] === 'undo-point')[1], before);
  assert.equal(r.applied, 2);
  assert.equal(r.changed, true);
});

test('a batch that changes nothing records no undo step', () => {
  const { editor, calls } = fakeEditor();
  editor.dispatch = () => false;
  const r = applyAIOperations(editor, { message: 'Nothing to do.', operations: [{ type: 'MOVE', targets: ['ghost'], relativeTo: 'rel', position: 'below' }] });
  assert.deepEqual(calls, []);
  assert.equal(r.changed, false);
  assert.equal(r.message, 'Nothing to do.');
});
