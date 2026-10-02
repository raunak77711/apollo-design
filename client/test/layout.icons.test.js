import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { ICONS } from '../src/components/board/state/schema.js';
import { iconParts } from '../src/components/board/editor/iconShapes.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { checkScene } from './helpers/checkScene.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const sceneOf = (block) => layoutBoard(sanitizeSpec({ title: 'T', sections: [{ title: 'S', density: 3, blocks: [block] }] }), stubMeasure);
const icons = (scene) => scene.items.filter((i) => i.kind === 'icon');
const byId = (scene, id) => scene.items.find((i) => i.id === id);

test('every icon in the vocabulary is a Lucide glyph the renderer can draw', () => {
  for (const name of ICONS) {
    const parts = iconParts(name);
    assert.ok(parts && parts.length > 0, `${name} has no drawable parts`);
  }
});

test('icon parts carry their SVG attributes', () => {
  const parts = iconParts('clock');
  assert.ok(parts.some((p) => p.tag === 'circle' && Number(p.attrs.r) === 10));
  assert.ok(parts.some((p) => p.tag === 'polyline' || p.tag === 'path'));
});

test('a flow with icons hugs each icon to the left of its own label, each following that label', () => {
  const scene = sceneOf({ type: 'flow', direction: 'down', steps: [{ label: 'GOOGLE', icon: 'search' }, { label: 'WEBSITE', icon: 'globe' }, { label: 'LEAD' }] });
  const found = icons(scene);
  assert.equal(found.length, 2);
  const labels = ['s1.b1.n1', 's1.b1.n2'].map((k) => byId(scene, k));
  assert.equal(new Set(labels.map((l) => l.cx)).size, 1); // the arrows keep one centre line
  assert.ok(found[0].cx < labels[0].cx - labels[0].tight / 2);
  assert.equal(found[0].follow, 's1.b1.n1');
  assert.equal(found[0].name, 'search');
  checkScene(scene);
});

test('a rightward flow with icons grows its boxes and pins each icon to its box', () => {
  const plain = sceneOf({ type: 'flow', direction: 'right', steps: ['A', 'B', 'C'] });
  const withIcons = sceneOf({ type: 'flow', direction: 'right', steps: [{ label: 'A', icon: 'search' }, { label: 'B', icon: 'globe' }, 'C'] });
  assert.ok(byId(withIcons, 's1.b1.n1').h > byId(plain, 's1.b1.n1').h);
  assert.equal(byId(withIcons, 's1.b1.n1.icon').follow, 's1.b1.n1');
  checkScene(withIcons);
});

test('cards, compare, list, loop, bucket, equation and timeline all draw the icons they are given', () => {
  const cases = [
    { type: 'cards', items: [{ label: 'One', icon: 'phone' }, { label: 'Two', icon: 'mail' }, 'Three'] },
    { type: 'compare', left: { heading: 'A', steps: [{ label: 'x', icon: 'clock' }, 'y'] }, right: { heading: 'B', steps: [{ label: 'z', icon: 'zap' }] } },
    { type: 'list', items: [{ label: 'A', icon: 'search' }, { label: 'B', icon: 'eye' }] },
    { type: 'loop', nodes: [{ label: 'A', icon: 'eye' }, 'B', 'C'] },
    { type: 'bucket', leaks: [{ label: 'SLOW', icon: 'hourglass' }, 'BAD'] },
    { type: 'equation', terms: ['A', 'B'], icons: ['eye', 'gauge'], operator: '×', result: 'C', resultIcon: 'dollar-sign' },
    { type: 'timeline', events: [{ when: '1', label: 'a', icon: 'clock' }, { when: '2', label: 'b' }] },
    { type: 'title', text: 'HELLO', icon: 'rocket' },
  ];
  for (const block of cases) {
    const scene = sceneOf(block);
    assert.ok(icons(scene).length >= 1, `${block.type} draws no icon`);
    checkScene(scene);
  }
});

test('a title icon sits above the title', () => {
  const scene = sceneOf({ type: 'title', text: 'HELLO', icon: 'rocket' });
  assert.ok(icons(scene)[0].cy < byId(scene, 's1.b1.text').cy);
});

test('the moment block stacks icon, name and chips, with an icon on each chip', () => {
  const scene = sceneOf(SAMPLES.moment);
  const hero = byId(scene, 's1.b1.icon');
  const name = byId(scene, 's1.b1.text');
  assert.ok(hero.cy < name.cy);
  assert.equal(icons(scene).length, 3);
  assert.ok(byId(scene, 's1.b1.c1').cy > name.cy);
  checkScene(scene);
});

test('a meter draws one track and one proportional bar per row, longest first row for 100', () => {
  const scene = sceneOf(SAMPLES.meter);
  const bar = (i) => byId(scene, `s1.b1.b${i}`);
  assert.ok(bar(1).w > bar(2).w && bar(2).w > bar(3).w && bar(3).w > bar(4).w);
  assert.equal(bar(1).w, byId(scene, 's1.b1.t1').w);
  assert.equal(bar(1).follow, 's1.b1.t1');
  assert.ok(byId(scene, 's1.b1.total'));
  checkScene(scene);
});

test('eliminate adds a row per elimination, crosses out the knocked-out ones and highlights the survivor', () => {
  const scene = sceneOf(SAMPLES.eliminate);
  const rows = new Set(scene.items.filter((i) => i.kind === 'box').map((i) => Math.round(i.cy)));
  assert.equal(rows.size, 4);
  assert.equal(icons(scene).length, 1 + 2 + 3);
  assert.equal(byId(scene, 's1.b1.r4.o1').stroke, '#0f7a3c');
  assert.equal(byId(scene, 's1.b1.r2.x2').follow, 's1.b1.r2.o2');
  checkScene(scene);
});

test('a track runs start to end through its stops, with a bracket title', () => {
  const scene = sceneOf(SAMPLES.track);
  const arrows = scene.items.filter((i) => i.kind === 'connector');
  // One pale road under everything, and a single arrow: the last leg into the destination.
  assert.ok(byId(scene, 's1.b1.road'));
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0].from, `s1.b1.s${SAMPLES.track.stops.length}`);
  assert.equal(arrows[0].to, 's1.b1.end');
  assert.ok(byId(scene, 's1.b1.title').cy < byId(scene, 's1.b1.start').cy);
  checkScene(scene);
});

test('a track with no stops is just two ends and the distance between them', () => {
  const scene = sceneOf({ type: 'track', title: 'DECISION DISTANCE', start: 'I HAVE A PROBLEM', end: 'I BOUGHT' });
  assert.equal(scene.items.filter((i) => i.kind === 'connector').length, 1);
  assert.equal(scene.items.find((i) => i.kind === 'connector').from, 's1.b1.start');
  checkScene(scene);
});

test('zones frame what is inside and pin its contents to the frame', () => {
  const scene = sceneOf(SAMPLES.zones);
  const frame = byId(scene, 's1.b1.in.frame');
  assert.equal(byId(scene, 's1.b1.in.n1').follow, frame.id);
  assert.equal(byId(scene, 's1.b1.in.head').follow, frame.id);
  const out = byId(scene, 's1.b1.out.n1');
  assert.ok(out.cy > frame.cy + frame.h / 2);
  assert.ok(Array.isArray(out.dash));
  checkScene(scene);
});
