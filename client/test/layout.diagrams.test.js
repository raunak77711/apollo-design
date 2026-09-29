import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_TYPES } from '../src/components/board/state/schema.js';
import { LAYOUTS, layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { overlaps } from '../src/components/board/engine/geometry.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { checkScene } from './helpers/checkScene.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sceneOf = (block, density = 3) =>
  layoutBoard(sanitizeSpec({ title: 'T', sections: [{ title: 'S', density, blocks: [block] }] }), stubMeasure);
const byId = (scene, id) => scene.items.find((i) => i.id === id);
const kind = (scene, k) => scene.items.filter((i) => i.kind === k);

test('every block type in the vocabulary has a layout', () => {
  assert.deepEqual(Object.keys(LAYOUTS).sort(), [...BLOCK_TYPES].sort());
});

test('hub: a centre, a node per label, a spoke to each, all symmetric about x = 700', () => {
  const scene = sceneOf({ ...SAMPLES.hub, links: 'spokes' });
  assert.equal(kind(scene, 'box').length, 11);
  const spokes = scene.items.filter((i) => i.id.includes('.s'));
  assert.equal(spokes.length, 10);
  assert.ok(spokes.every((s) => s.from === 's1.b1.center' && s.head === false));
  const nodes = scene.items.filter((i) => /\.n\d+$/.test(i.id));
  const mean = nodes.reduce((s, n) => s + n.cx, 0) / nodes.length;
  assert.ok(Math.abs(mean - 700) < 1, 'nodes are balanced around the midline');
  checkScene(scene);
});

test('hub: nodes never overlap each other or the centre, even with twelve long labels', () => {
  const nodes = Array.from({ length: 12 }, (_, i) => ({ label: `Integration number ${i + 1}` }));
  const scene = sceneOf({ type: 'hub', center: 'BUSINESS', nodes });
  const boxes = kind(scene, 'box');
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.equal(overlaps(boxes[i], boxes[j]), false, `${boxes[i].id} overlaps ${boxes[j].id}`);
  checkScene(scene);
});

test('hub: spokes+cross adds distinct cross-links, more at high density, none twice', () => {
  const plain = sceneOf({ ...SAMPLES.hub, links: 'spokes' });
  const cross = sceneOf(SAMPLES.hub, 3);
  const dense = sceneOf(SAMPLES.hub, 5);
  const x = (s) => s.items.filter((i) => /\.x\d+$/.test(i.id));
  assert.equal(x(plain).length, 0);
  assert.equal(x(cross).length, 10);
  assert.ok(x(dense).length > x(cross).length);
  const pairs = x(dense).map((c) => [c.from, c.to].sort().join('|'));
  assert.equal(new Set(pairs).size, pairs.length);
});

test('hub: cross-links are behind spokes, spokes behind boxes', () => {
  const scene = sceneOf(SAMPLES.hub);
  const order = scene.items.map((i) => (i.id.includes('.x') ? 0 : i.id.includes('.s') ? 1 : 2));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('cards: a grid of N columns, last row centred, tags and tone carried through', () => {
  const scene = sceneOf({ type: 'cards', columns: 3, tone: 'problem', items: ['a', 'b', 'c', 'd'].map((label) => ({ label, tag: 'LEAK' })) });
  const c = (k) => byId(scene, `s1.b1.n${k}`);
  assert.equal(c(1).cy, c(2).cy);
  assert.ok(c(4).cy > c(1).cy);
  assert.equal(c(4).cx, 700, 'a lone card on the last row is centred');
  assert.equal(c(1).tag, 'LEAK');
  assert.equal(c(1).tagColor, '#c81e3a');
  checkScene(scene);
});

test('cards: a long unbroken word widens the card rather than spilling out', () => {
  const scene = sceneOf({ type: 'cards', columns: 4, items: [{ label: 'Internationalization' }, { label: 'b' }, { label: 'c' }, { label: 'd' }] });
  const card = byId(scene, 's1.b1.n1');
  assert.ok(stubMeasure('Internationalization', card.labelFont, 9999).w <= card.labelWidth + 1);
  checkScene(scene);
});

test('compare: two columns mirrored about the midline with a divider between them', () => {
  const scene = sceneOf(SAMPLES.compare);
  const left = byId(scene, 's1.b1.l.head');
  const right = byId(scene, 's1.b1.r.head');
  assert.equal(left.cy, right.cy);
  assert.equal(700 - left.cx, right.cx - 700);
  const divider = byId(scene, 's1.b1.divider');
  assert.equal(divider.kind, 'rule');
  assert.equal(divider.cx, 700);
  assert.ok(byId(scene, 's1.b1.r.foot'));
  assert.equal(left.color, '#6b6b6b');
  assert.equal(right.color, '#0f7a3c');
  checkScene(scene);
});

test('compare: sides of unequal length are top aligned and the divider spans the taller one', () => {
  const scene = sceneOf(SAMPLES.compare);
  const block = Object.values(scene.blocks)[0];
  const divider = byId(scene, 's1.b1.divider');
  assert.ok(divider.h >= block.h - 1);
});

test('panels: rows follow their panel; locked rows read locked', () => {
  const scene = sceneOf(SAMPLES.panels);
  const p1 = byId(scene, 's1.b1.p1');
  const p2 = byId(scene, 's1.b1.p2');
  assert.equal(p1.h, p2.h, 'panels share a height');
  assert.equal(byId(scene, 's1.b1.p1.r1').follow, p1.id);
  assert.equal(byId(scene, 's1.b1.p1.head').follow, p1.id);
  const locked = byId(scene, 's1.b1.p2.r1');
  assert.equal(locked.tag, 'LOCKED');
  assert.equal(locked.tagAlign, 'right');
  assert.equal(byId(scene, 's1.b1.p1.r1').tag, 'EDITABLE');
  assert.equal(700 - p1.cx, p2.cx - 700);
  checkScene(scene);
});

test('panels: three panels still fit and stay symmetric', () => {
  const panel = (heading) => ({ heading, tone: 'ink', rows: [{ label: 'One' }, { label: 'Two' }] });
  const scene = sceneOf({ type: 'panels', panels: [panel('A'), panel('B'), panel('C')] });
  assert.equal(byId(scene, 's1.b1.p2').cx, 700);
  checkScene(scene);
});

test('browser: a frame with chrome that follows it, and a drop target for a screenshot', () => {
  const scene = sceneOf(SAMPLES.browser);
  const frame = byId(scene, 's1.b1.frame');
  for (const k of ['bar', 'dot1', 'dot2', 'dot3', 'url', 'body']) assert.equal(byId(scene, `s1.b1.${k}`).follow, frame.id, `${k} follows the frame`);
  assert.equal(byId(scene, 's1.b1.body').drop, true);
  assert.equal(byId(scene, 's1.b1.url').label, 'example.com');
  assert.equal(byId(scene, 's1.b1.title').text, 'Your homepage');
  checkScene(scene);
});

test('browser: a blank placeholder has no drop target, and note text sits below the frame', () => {
  const scene = sceneOf({ type: 'browser', placeholder: 'blank', note: 'iframe · external scripts' });
  assert.equal(byId(scene, 's1.b1.body'), undefined);
  assert.ok(byId(scene, 's1.b1.note').cy > byId(scene, 's1.b1.frame').cy);
  checkScene(scene);
});
