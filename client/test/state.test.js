import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoard } from '../src/components/board/state/schema.js';
import { applyOperation, createBoardState, nextBlockId } from '../src/components/board/state/boardState.js';
import { styleToFabric } from '../src/components/board/state/styleMap.js';
import { sectionAt, toRelative, toWorldY } from '../src/components/board/state/anchor.js';
import { arrowRecord, shapeRecord, stickyRecord, textRecord } from '../src/components/board/state/annotations.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
};

const spec = () => normalizeBoard({
  title: 'T',
  sections: [
    { title: 'One', blocks: [SAMPLES.title, SAMPLES.flow] },
    { title: 'Two', blocks: [SAMPLES.statement, SAMPLES.hub] },
  ],
});
const fresh = () => deepFreeze(createBoardState({ spec: spec(), brief: 'brief' }));

test('createBoardState starts empty and keeps the spec', () => {
  const s = fresh();
  assert.deepEqual(s.overrides, {});
  assert.deepEqual(s.annotations, []);
  assert.deepEqual(s.connections, []);
  assert.deepEqual(s.assets, {});
  assert.equal(s.view, null);
  assert.equal(s.spec.sections.length, 2);
});

test('operations never mutate the state they are given', () => {
  const s = fresh();
  const t = applyOperation(s, { type: 'MOVE', targets: ['s1.b2.n1'], dx: 5, dy: 6 });
  assert.notEqual(t, s);
  assert.deepEqual(s.overrides, {});
});

test('an unknown or malformed operation returns the same state object', () => {
  const s = fresh();
  assert.equal(applyOperation(s, { type: 'NOPE' }), s);
  assert.equal(applyOperation(s, { type: 'MOVE', targets: ['s1.b1'] }), s);
  assert.equal(applyOperation(s, { type: 'FOCUS', targets: ['s1.b1'] }), s);
});

test('SET_TEXT stores an override for a piece and edits an annotation directly', () => {
  let s = applyOperation(fresh(), { type: 'SET_TEXT', targets: ['s1.b1.text'], text: 'NEW' });
  assert.equal(s.overrides['s1.b1.text'].text, 'NEW');
  s = applyOperation(s, { type: 'ADD_TEXT', text: 'hi', section: 's1', x: 700, y: 100 });
  const id = s.annotations[0].id;
  s = applyOperation(s, { type: 'SET_TEXT', targets: [id], text: 'bye' });
  assert.equal(s.annotations[0].json.text, 'bye');
});

test('MOVE accumulates on pieces and shifts annotation coordinates', () => {
  let s = applyOperation(fresh(), { type: 'MOVE', targets: ['s1.b2'], dx: 10, dy: 20 });
  s = applyOperation(s, { type: 'MOVE', targets: ['s1.b2'], dx: 5, dy: -5 });
  assert.equal(s.overrides['s1.b2'].dx, 15);
  assert.equal(s.overrides['s1.b2'].dy, 15);
  s = applyOperation(s, { type: 'ADD_SHAPE', shape: 'rectangle', section: 's1', x: 300, y: 300 });
  const { id, json } = s.annotations[0];
  s = applyOperation(s, { type: 'MOVE', targets: [id], dx: 40, dy: 10 });
  assert.equal(s.annotations[0].json.left, json.left + 40);
  assert.equal(s.annotations[0].json.top, json.top + 10);
});

test('RESIZE multiplies scale; arrows ignore it', () => {
  let s = applyOperation(fresh(), { type: 'RESIZE', targets: ['s1.b1'], scale: 2 });
  s = applyOperation(s, { type: 'RESIZE', targets: ['s1.b1'], scale: 1.5 });
  assert.equal(s.overrides['s1.b1'].scaleX, 3);
  assert.equal(s.overrides['s1.b1'].scaleY, 3);
  s = applyOperation(s, { type: 'ADD_ARROW', section: 's1', x1: 0, y1: 0, x2: 100, y2: 0 });
  const before = s.annotations[0];
  s = applyOperation(s, { type: 'RESIZE', targets: [before.id], scale: 3 });
  assert.equal(s.annotations[0], before);
});

test('ROTATE sets the angle', () => {
  const s = applyOperation(fresh(), { type: 'ROTATE', targets: ['s1.b1'], angle: 15 });
  assert.equal(s.overrides['s1.b1'].angle, 15);
});

test('DELETE flags a piece, removes an annotation; RESTORE clears the flag and tidies the override', () => {
  let s = applyOperation(fresh(), { type: 'DELETE', targets: ['s1.b1'] });
  assert.equal(s.overrides['s1.b1'].deleted, true);
  s = applyOperation(s, { type: 'RESTORE', targets: ['s1.b1'] });
  assert.equal('s1.b1' in s.overrides, false);
  s = applyOperation(s, { type: 'ADD_TEXT', text: 'x', section: 's2', x: 1, y: 1 });
  s = applyOperation(s, { type: 'DELETE', targets: [s.annotations[0].id] });
  assert.deepEqual(s.annotations, []);
});

test('SET_STYLE stores semantic style on pieces and Fabric props on annotations', () => {
  let s = applyOperation(fresh(), { type: 'SET_STYLE', targets: ['s1.b1.text'], changes: { fontSize: 110, color: 'problem' } });
  assert.deepEqual(s.overrides['s1.b1.text'].style, { fontSize: 110, color: 'problem' });
  s = applyOperation(s, { type: 'SET_STYLE', targets: ['s1.b1.text'], changes: { italic: true } });
  assert.deepEqual(s.overrides['s1.b1.text'].style, { fontSize: 110, color: 'problem', italic: true });
  s = applyOperation(s, { type: 'ADD_TEXT', text: 'x', section: 's1', x: 1, y: 1 });
  s = applyOperation(s, { type: 'SET_STYLE', targets: [s.annotations[0].id], changes: { color: 'money', fontSize: 30, italic: true } });
  const j = s.annotations[0].json;
  assert.equal(j.fill, '#0f7a3c');
  assert.equal(j.fontSize, 30);
  assert.equal(j.fontStyle, 'italic');
});

test('INSERT_BLOCK allocates a stable id and never renumbers existing blocks', () => {
  let s = applyOperation(fresh(), { type: 'OVERRIDE_SET', id: 's1.b2', patch: { dx: 9 } });
  s = applyOperation(s, { type: 'INSERT_BLOCK', section: 's1', index: 0, block: SAMPLES.quote });
  const ids = s.spec.sections[0].blocks.map((b) => b.id);
  assert.deepEqual(ids, ['s1.b3', 's1.b1', 's1.b2']);
  assert.equal(s.overrides['s1.b2'].dx, 9);
  assert.equal(nextBlockId(s.spec.sections[0]), 's1.b4');
});

test('INSERT_BLOCK ignores unknown sections and invalid blocks', () => {
  const s = fresh();
  assert.equal(applyOperation(s, { type: 'INSERT_BLOCK', section: 's9', block: SAMPLES.quote }), s);
  assert.equal(applyOperation(s, { type: 'INSERT_BLOCK', section: 's1', block: { type: 'nope' } }), s);
});

test('REPLACE_BLOCK keeps the id and drops only the overrides beneath it', () => {
  let s = fresh();
  s = applyOperation(s, { type: 'OVERRIDE_SET', id: 's1.b2.n1', patch: { dx: 5 } });
  s = applyOperation(s, { type: 'OVERRIDE_SET', id: 's1.b1.text', patch: { dx: 7 } });
  s = applyOperation(s, { type: 'REPLACE_BLOCK', targets: ['s1.b2'], block: SAMPLES.statement });
  assert.equal(s.spec.sections[0].blocks[1].id, 's1.b2');
  assert.equal(s.spec.sections[0].blocks[1].type, 'statement');
  assert.equal('s1.b2.n1' in s.overrides, false);
  assert.equal(s.overrides['s1.b1.text'].dx, 7);
});

test('SECTION_REPLACE swaps a section, drops its overrides and connections, keeps annotations', () => {
  let s = fresh();
  s = applyOperation(s, { type: 'OVERRIDE_SET', id: 's2.b1', patch: { dx: 1 } });
  s = applyOperation(s, { type: 'OVERRIDE_SET', id: 's1.b1', patch: { dx: 2 } });
  s = applyOperation(s, { type: 'CONNECT', from: 's2.b1', to: 's1.b1' });
  s = applyOperation(s, { type: 'ADD_TEXT', text: 'keep me', section: 's2', x: 1, y: 1 });
  const replacement = { id: 's2', title: 'Two again', beat: '', density: 2, blocks: [{ ...SAMPLES.statement, id: 's2.b1' }] };
  s = applyOperation(s, { type: 'SECTION_REPLACE', index: 1, section: replacement });
  assert.equal(s.spec.sections[1].title, 'Two again');
  assert.equal('s2.b1' in s.overrides, false);
  assert.equal(s.overrides['s1.b1'].dx, 2);
  assert.deepEqual(s.connections, []);
  assert.equal(s.annotations.length, 1);
});

test('CONNECT deduplicates and DISCONNECT removes', () => {
  let s = applyOperation(fresh(), { type: 'CONNECT', from: 'a', to: 'b', tone: 'problem', dashed: true });
  s = applyOperation(s, { type: 'CONNECT', from: 'a', to: 'b' });
  assert.equal(s.connections.length, 1);
  assert.deepEqual(s.connections[0], { id: 'c_a__b', from: 'a', to: 'b', tone: 'problem', dashed: true });
  s = applyOperation(s, { type: 'DISCONNECT', from: 'a', to: 'b' });
  assert.deepEqual(s.connections, []);
});

test('ADD_TEXT, ADD_SHAPE, ADD_ARROW create section-relative annotations', () => {
  let s = applyOperation(fresh(), { type: 'ADD_TEXT', text: 'THIS IS THE LEAK', section: 's2', x: 700, y: 400, style: { fontSize: 120 } });
  s = applyOperation(s, { type: 'ADD_SHAPE', shape: 'circle', section: 's2', x: 700, y: 900, width: 300, height: 200 });
  s = applyOperation(s, { type: 'ADD_ARROW', section: 's2', x1: 100, y1: 100, x2: 400, y2: 100, dashed: true });
  assert.deepEqual(s.annotations.map((a) => a.kind), ['text', 'shape', 'arrow']);
  assert.ok(s.annotations.every((a) => a.section === 's2' && a.id.startsWith('a_')));
  assert.equal(s.annotations[0].json.top, 400);
  assert.equal(s.annotations[0].json.fontSize, 120);
  assert.equal(s.annotations[1].json.type, 'ellipse');
  assert.equal(s.annotations[2].json.dashed, true);
});

test('ADD_ARROW without coordinates is a no-op (Direct mode resolves ids into coordinates first)', () => {
  const s = fresh();
  assert.equal(applyOperation(s, { type: 'ADD_ARROW', from: 'a', to: 'b' }), s);
});

test('internal operations: override set/reset, annotation add/update/remove/clear, view', () => {
  let s = applyOperation(fresh(), { type: 'OVERRIDE_SET', id: 's1.b1', patch: { dx: 1, w: 500 } });
  s = applyOperation(s, { type: 'OVERRIDE_SET', id: 's1.b1', patch: { dy: 2 } });
  assert.deepEqual(s.overrides['s1.b1'], { dx: 1, w: 500, dy: 2 });
  s = applyOperation(s, { type: 'OVERRIDES_RESET' });
  assert.deepEqual(s.overrides, {});

  const rec = textRecord({ id: 'a_1', section: 's1', x: 10, y: 20, text: 'hi' });
  s = applyOperation(s, { type: 'ANNOTATION_ADD', record: rec, assets: { img_1: 'data:image/png;base64,AA' } });
  assert.equal(s.annotations.length, 1);
  assert.equal(s.assets.img_1, 'data:image/png;base64,AA');
  s = applyOperation(s, { type: 'ANNOTATION_UPDATE', record: { ...rec, json: { ...rec.json, left: 99 } } });
  assert.equal(s.annotations[0].json.left, 99);
  s = applyOperation(s, { type: 'ANNOTATION_UPDATE', record: textRecord({ id: 'a_2', section: 's1', x: 0, y: 0, text: 'new' }) });
  assert.equal(s.annotations.length, 2);
  s = applyOperation(s, { type: 'ANNOTATION_REMOVE', ids: ['a_1'] });
  assert.deepEqual(s.annotations.map((a) => a.id), ['a_2']);
  s = applyOperation(s, { type: 'CONNECT', from: 'x', to: 'y' });
  s = applyOperation(s, { type: 'ANNOTATIONS_CLEAR' });
  assert.deepEqual([s.annotations, s.connections, s.assets], [[], [], {}]);

  s = applyOperation(s, { type: 'VIEW_SET', zoom: 1.2, x: -5, y: -100 });
  assert.deepEqual(s.view, { zoom: 1.2, x: -5, y: -100 });
});

test('ANNOTATIONS_CLEAR on an already-empty board returns the same state', () => {
  const s = fresh();
  assert.equal(applyOperation(s, { type: 'ANNOTATIONS_CLEAR' }), s);
});

test('styleToFabric maps semantic style by annotation kind', () => {
  assert.deepEqual(styleToFabric({ color: 'problem', italic: true, letterSpacing: 40 }, 'text'), { fill: '#c81e3a', fontStyle: 'italic', charSpacing: 40 });
  assert.deepEqual(styleToFabric({ color: '#123456', strokeWidth: 9, dash: true }, 'arrow'), { color: '#123456', lineWidth: 9, dashed: true });
  assert.deepEqual(styleToFabric({ headEnd: false, headStart: true }, 'arrow'), { headEnd: false, headStart: true });
  assert.deepEqual(styleToFabric({ headEnd: true }, 'shape'), {});
  assert.deepEqual(styleToFabric({ color: 'money', strokeWidth: 3, radius: 12, dash: true }, 'shape'), { stroke: '#0f7a3c', strokeWidth: 3, rx: 12, ry: 12, strokeDashArray: [14, 9] });
  assert.equal(styleToFabric({ fontWeight: 'bold' }).fontWeight, '700');
  assert.deepEqual(styleToFabric({ nonsense: 1 }), {});
});

test('annotation builders produce Fabric-shaped JSON tagged as annotations', () => {
  const t = textRecord({ id: 'a_t', section: 's1', x: 700, y: 50, text: 'T' });
  assert.equal(t.json.type, 'textbox');
  assert.deepEqual(t.json.data, { kind: 'annotation', id: 'a_t', ann: 'text' });
  const st = stickyRecord({ id: 'a_s', section: 's1', x: 10, y: 10 });
  assert.equal(st.json.backgroundColor, '#fff6b7');
  const sh = shapeRecord({ id: 'a_r', section: 's1', shape: 'rectangle', x: 400, y: 300, width: 200, height: 100 });
  assert.equal(sh.json.left, 300);
  assert.equal(sh.json.top, 250);
  const ar = arrowRecord({ id: 'a_a', section: 's1', x1: 500, y1: 100, x2: 100, y2: 300 });
  assert.equal(ar.json.type, 'lineArrow');
  assert.equal(ar.json.left, 100);
  assert.equal(ar.json.top, 100);
  assert.deepEqual([ar.json.sx, ar.json.sy, ar.json.ex, ar.json.ey], [400, 0, 0, 200]);
});

test('anchoring: annotations follow their section when a section changes height', () => {
  const before = [{ id: 's1', y: 0, height: 1000 }, { id: 's2', y: 1000, height: 1000 }, { id: 's3', y: 2000, height: 1000 }];
  const after = [{ id: 's1', y: 0, height: 1600 }, { id: 's2', y: 1600, height: 1000 }, { id: 's3', y: 2600, height: 1000 }];
  const rel = toRelative(before, 2350);
  assert.deepEqual(rel, { section: 's3', y: 350 });
  assert.equal(toWorldY(after, rel.section, rel.y), 2950);
  assert.equal(sectionAt(before, -50).id, 's1');
  assert.equal(sectionAt(before, 99999).id, 's3');
  assert.equal(toWorldY(after, 'missing', 10), 2610);
});
