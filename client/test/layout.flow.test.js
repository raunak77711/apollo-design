import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { overlaps } from '../src/components/board/engine/geometry.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { checkScene } from './helpers/checkScene.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sceneOf = (block) =>
  layoutBoard(sanitizeSpec({ title: 'T', sections: [{ title: 'S', density: 3, blocks: [block] }] }), stubMeasure);
const byId = (scene, id) => scene.items.find((i) => i.id === id);
const flow = (over) => ({ type: 'flow', steps: ['A', 'B', 'C'], ...over });

test('a downward flow puts step 1 at the top and connects each step to the next', () => {
  const scene = sceneOf(flow({ direction: 'down' }));
  assert.ok(byId(scene, 's1.b1.n1').cy < byId(scene, 's1.b1.n2').cy);
  const conns = scene.items.filter((i) => i.kind === 'connector');
  assert.deepEqual(conns.map((c) => [c.from, c.to]), [['s1.b1.n1', 's1.b1.n2'], ['s1.b1.n2', 's1.b1.n3']]);
  assert.ok(conns.every((c) => c.head === true));
});

test('an upward flow puts step 1 at the bottom (a funnel climbing toward the goal)', () => {
  const scene = sceneOf(flow({ direction: 'up' }));
  assert.ok(byId(scene, 's1.b1.n1').cy > byId(scene, 's1.b1.n3').cy);
  const first = scene.items.find((i) => i.id === 's1.b1.c1');
  assert.deepEqual([first.from, first.to], ['s1.b1.n1', 's1.b1.n2']);
});

test('connectors are drawn behind the steps', () => {
  const scene = sceneOf(flow({}));
  const firstStep = scene.items.findIndex((i) => i.kind === 'text');
  const lastConnector = scene.items.map((i) => i.kind).lastIndexOf('connector');
  assert.ok(lastConnector < firstStep);
});

test('a step note sits under its label, follows it, and the connector leaves from the note', () => {
  const scene = sceneOf(flow({ steps: [{ label: 'A', note: 'the first thing' }, 'B'], direction: 'down' }));
  const label = byId(scene, 's1.b1.n1');
  const note = byId(scene, 's1.b1.n1.note');
  assert.ok(note.cy > label.cy);
  assert.equal(note.follow, label.id);
  assert.equal(scene.items.find((i) => i.kind === 'connector').from, note.id);
});

test('scale changes size; hero > normal > small; normal labels stay at least 22', () => {
  const size = (scale) => byId(sceneOf(flow({ scale })), 's1.b1.n1').font.size;
  assert.ok(size('hero') > size('normal') && size('normal') > size('small'));
  assert.ok(size('normal') >= 22);
  assert.ok(size('small') >= 16);
});

test('per-step tone overrides the block tone', () => {
  const scene = sceneOf(flow({ tone: 'money', steps: [{ label: 'A', tone: 'problem' }, 'B'] }));
  assert.equal(byId(scene, 's1.b1.n1').color, '#c81e3a');
  assert.equal(byId(scene, 's1.b1.n2').color, '#0f7a3c');
});

test('a rightward flow lays steps in boxes left to right', () => {
  const scene = sceneOf(flow({ direction: 'right', steps: ['A', 'B', 'C'] }));
  const [a, b, c] = ['n1', 'n2', 'n3'].map((k) => byId(scene, `s1.b1.${k}`));
  assert.ok(a.cx < b.cx && b.cx < c.cx);
  assert.equal(a.cy, b.cy);
  assert.equal(a.kind, 'box');
  checkScene(scene);
});

test('a long rightward flow wraps in a serpentine so each row ends above where the next begins', () => {
  const steps = ['A', 'B', 'C', 'D', 'E', 'F'];
  const scene = sceneOf(flow({ direction: 'right', steps }));
  const n = (k) => byId(scene, `s1.b1.n${k}`);
  assert.ok(n(5).cy > n(4).cy, 'row 2 is below row 1');
  assert.equal(n(5).cx, n(4).cx, 'step 5 sits directly under step 4');
  assert.ok(n(6).cx < n(5).cx, 'row 2 runs right to left');
  checkScene(scene);
});

test('long labels, unbroken words and emoji grow the boxes instead of overflowing them', () => {
  const long = 'A very long label that certainly needs several lines inside a narrow box 💀';
  const scene = sceneOf(flow({ direction: 'right', steps: [long, 'B', 'C'] }));
  const a = byId(scene, 's1.b1.n1');
  const textH = stubMeasure(a.label, a.labelFont, a.labelWidth).h;
  assert.ok(a.h >= textH, 'box is at least as tall as its wrapped label');
  assert.ok(byId(scene, 's1.b1.n2').h === a.h, 'boxes in a flow share one height');
  checkScene(scene);
});

test('steps in a column never overlap', () => {
  const scene = sceneOf(flow({ steps: ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'], scale: 'hero' }));
  const texts = scene.items.filter((i) => i.kind === 'text');
  for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) assert.equal(overlaps(texts[i], texts[j]), false);
  checkScene(scene);
});

test('a timeline going right spaces dots evenly and puts when above, label below', () => {
  const scene = sceneOf(SAMPLES.timeline);
  const d = (k) => byId(scene, `s1.b1.d${k}`);
  assert.equal(Math.round(d(2).cx - d(1).cx), Math.round(d(3).cx - d(2).cx));
  assert.ok(byId(scene, 's1.b1.w1').cy < d(1).cy);
  assert.ok(byId(scene, 's1.b1.l1').cy > d(1).cy);
  checkScene(scene);
});

test('a timeline going down alternates when-left, label-right around the axis', () => {
  const scene = sceneOf({ ...SAMPLES.timeline, direction: 'down' });
  const d1 = byId(scene, 's1.b1.d1');
  assert.ok(byId(scene, 's1.b1.w1').cx < d1.cx);
  assert.ok(byId(scene, 's1.b1.l1').cx > d1.cx);
  assert.ok(byId(scene, 's1.b1.d2').cy > d1.cy);
  checkScene(scene);
});

test('an eight-event timeline still fits the board', () => {
  const events = Array.from({ length: 8 }, (_, i) => ({ when: `${i}:00`, label: `Event number ${i}` }));
  const scene = sceneOf({ type: 'timeline', events });
  checkScene(scene);
  assert.ok(Object.values(scene.blocks)[0].w <= 1300);
});

test('a funnel narrows stage by stage and puts values in the labels', () => {
  const scene = sceneOf(SAMPLES.funnel);
  const f = (k) => byId(scene, `s1.b1.f${k}`);
  assert.ok(f(1).w > f(4).w);
  assert.ok(f(1).cy < f(2).cy);
  assert.equal(f(1).kind, 'poly');
  assert.match(f(1).label, /Searches\s+1,000/);
  assert.equal(f(1).points.length, 4);
  checkScene(scene);
});
