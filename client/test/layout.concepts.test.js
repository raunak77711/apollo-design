import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { checkScene } from './helpers/checkScene.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sceneOf = (block, section = {}) => layoutBoard(
  sanitizeSpec({ title: 'T', sections: [{ title: 'S', density: 3, blocks: [block], ...section }] }),
  stubMeasure
);
const byId = (scene, id) => scene.items.find((i) => i.id === id);

test('an equation lays terms and operators in one row, with the result filled', () => {
  const scene = sceneOf(SAMPLES.equation);
  const terms = scene.items.filter((i) => /\.t\d+$/.test(i.id));
  assert.ok(terms.length >= 2);
  assert.ok(terms.every((t) => Math.abs(t.cy - terms[0].cy) < 1));
  assert.ok(terms[0].cx < terms[1].cx);
  const result = scene.items.find((i) => /\.r\d+$/.test(i.id));
  assert.ok(result.cx > terms[terms.length - 1].cx);
  assert.notEqual(result.fill, '#ffffff');
  checkScene(scene);
});

test('an equation too wide for one row stacks its terms', () => {
  const long = { type: 'equation', terms: ['A VERY LONG FIRST TERM', 'ANOTHER LONG TERM HERE', 'AND A THIRD ONE', 'FOURTH TERM TOO'], operator: 'x', result: 'THE RESULT' };
  const scene = sceneOf(long);
  const terms = scene.items.filter((i) => /\.t\d+$/.test(i.id));
  assert.ok(terms[1].cy > terms[0].cy);
  checkScene(scene);
});

test('a loop closes: the last arrow returns to the first node', () => {
  const scene = sceneOf(SAMPLES.loop);
  const arrows = scene.items.filter((i) => i.kind === 'connector');
  const nodes = scene.items.filter((i) => /\.n\d+$/.test(i.id));
  assert.equal(arrows.length, nodes.length);
  const last = arrows[arrows.length - 1];
  assert.equal(last.to, nodes[0].id);
  assert.equal(last.from, nodes[nodes.length - 1].id);
  checkScene(scene);
});

test('a matrix keeps columns aligned and joins each row left to right', () => {
  const scene = sceneOf(SAMPLES.matrix);
  const col = (c) => scene.items.filter((i) => new RegExp(`c${c}$`).test(i.id)).map((i) => Math.round(i.cx));
  assert.equal(new Set(col(1)).size, 1);
  assert.ok(col(1)[0] < col(2)[0]);
  assert.ok(scene.items.some((i) => i.kind === 'rule'));
  checkScene(scene);
});

test('a bucket draws a body, water, one hole + label + connector per leak, and the leaks follow the bucket', () => {
  const scene = sceneOf(SAMPLES.bucket);
  const body = byId(scene, 's1.b1.body');
  assert.equal(body.kind, 'poly');
  assert.equal(body.label, undefined);
  const leaks = scene.items.filter((i) => /\.l\d+$/.test(i.id));
  assert.equal(leaks.length, SAMPLES.bucket.leaks.length);
  assert.ok(leaks.every((l) => l.follow === body.id));
  assert.equal(scene.items.filter((i) => i.kind === 'connector').length, leaks.length);
  assert.ok(leaks.some((l) => l.cx < 700) && leaks.some((l) => l.cx > 700));
  checkScene(scene);
});

test('a list numbers its items and keeps details under their labels', () => {
  const scene = sceneOf(SAMPLES.list);
  const n1 = byId(scene, 's1.b1.n1');
  assert.equal(n1.label, '1');
  assert.ok(byId(scene, 's1.b1.n2').cy > n1.cy);
  checkScene(scene);
});

test('an inverse statement is a black band with white words', () => {
  const scene = sceneOf({ type: 'statement', text: 'IT IS A SYSTEM.', emphasis: 'inverse' });
  const band = byId(scene, 's1.b1.text');
  assert.equal(band.kind, 'box');
  assert.equal(band.fill, '#0a0a0a');
  assert.equal(band.labelColor, '#ffffff');
  checkScene(scene);
});

test('a section kicker prints a marker and a hairline above the first block', () => {
  const scene = sceneOf(SAMPLES.title, { kicker: 'Scene 7' });
  const text = byId(scene, 's1.b0.text');
  assert.equal(text.text, 'SCENE 7');
  assert.ok(text.cy < byId(scene, 's1.b1.text').cy);
  assert.ok(byId(scene, 's1.b0.rule'));
  checkScene(scene);
});

test('a long flow folds into rows instead of a long column; an upward one still starts at the bottom', () => {
  const steps = Array.from({ length: 12 }, (_, i) => `Step ${i + 1}`);
  const down = sceneOf({ type: 'flow', steps, direction: 'down' });
  const up = sceneOf({ type: 'flow', steps, direction: 'up' });
  const rows = (scene) => new Set(scene.items.filter((i) => i.kind === 'box').map((i) => Math.round(i.cy))).size;
  assert.equal(rows(down), 3);
  assert.ok(byId(up, 's1.b1.n1').cy > byId(up, 's1.b1.n12').cy);
  checkScene(down);
  checkScene(up);
});
