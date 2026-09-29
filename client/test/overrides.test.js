import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutBoard } from '../src/components/board/engine/layoutBoard.js';
import { buildIndex, effectiveItem, effectiveRect, overrideFromGesture } from '../src/components/board/engine/overrides.js';
import { sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { stubMeasure } from './helpers/stubMeasure.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const scene = layoutBoard(sanitizeSpec({
  title: 'T',
  sections: [{
    title: 'S', density: 3,
    blocks: [
      { type: 'flow', steps: [{ label: 'A', note: 'a note' }, 'B', 'C'] },
      SAMPLES.browser,
    ],
  }],
}), stubMeasure);
const ctxOf = (overrides = {}) => ({ overrides, ...buildIndex(scene) });
const item = (id) => scene.items.find((i) => i.id === id);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('with no overrides an item is where the layout put it', () => {
  const a = item('s1.b1.n1');
  const e = effectiveItem(a, ctxOf());
  assert.deepEqual([e.cx, e.cy, e.scaleX, e.scaleY, e.angle, e.deleted], [a.cx, a.cy, 1, 1, 0, false]);
  assert.equal(e.w, a.w);
});

test('an override moves, scales and rotates a single piece', () => {
  const a = item('s1.b1.n2');
  const e = effectiveItem(a, ctxOf({ 's1.b1.n2': { dx: 10, dy: -20, scaleX: 2, scaleY: 3, angle: 15 } }));
  assert.deepEqual([e.cx, e.cy, e.scaleX, e.scaleY, e.angle], [a.cx + 10, a.cy - 20, 2, 3, 15]);
});

test('text, width and style overrides pass through; block style sits under piece style', () => {
  const e = effectiveItem(item('s1.b1.n1'), ctxOf({
    's1.b1': { style: { fontSize: 50, color: 'money' } },
    's1.b1.n1': { text: 'HELLO', w: 400, style: { color: 'problem' } },
  }));
  assert.equal(e.text, 'HELLO');
  assert.equal(e.w, 400);
  assert.deepEqual(e.style, { fontSize: 50, color: 'problem' });
});

test('a follower travels with its leader', () => {
  const label = item('s1.b1.n1');
  const note = item('s1.b1.n1.note');
  const e = effectiveItem(note, ctxOf({ 's1.b1.n1': { dx: 100, dy: 40 } }));
  assert.deepEqual([e.cx, e.cy], [note.cx + 100, note.cy + 40]);
  assert.ok(label.cy < note.cy);
});

test('a leader that grows pushes its follower outward from the leader\'s centre', () => {
  const label = item('s1.b1.n1');
  const note = item('s1.b1.n1.note');
  const e = effectiveItem(note, ctxOf({ 's1.b1.n1': { scaleX: 2, scaleY: 2 } }));
  near(e.cy - label.cy, (note.cy - label.cy) * 2, 'offset doubles');
  assert.equal(e.scaleX, 2);
});

test('a follower can also be nudged on its own, on top of the leader', () => {
  const note = item('s1.b1.n1.note');
  const e = effectiveItem(note, ctxOf({ 's1.b1.n1': { dx: 5 }, 's1.b1.n1.note': { dx: 7 } }));
  assert.equal(e.cx, note.cx + 12);
});

test('deleting a leader, or the whole block, hides everything under it', () => {
  assert.equal(effectiveItem(item('s1.b1.n1.note'), ctxOf({ 's1.b1.n1': { deleted: true } })).deleted, true);
  assert.equal(effectiveItem(item('s1.b1.n2'), ctxOf({ 's1.b1': { deleted: true } })).deleted, true);
  assert.equal(effectiveItem(item('s1.b1.n2'), ctxOf({ 's1.b2': { deleted: true } })).deleted, false);
});

test('the browser chrome follows the frame', () => {
  const frame = item('s1.b2.frame');
  const url = item('s1.b2.url');
  const e = effectiveItem(url, ctxOf({ 's1.b2.frame': { dx: -50, dy: 30 } }));
  assert.deepEqual([e.cx, e.cy], [url.cx - 50, url.cy + 30]);
  assert.ok(frame.cy > 0);
});

test('a block-level move shifts every piece of the block by the same amount', () => {
  const ctx = ctxOf({ 's1.b1': { dx: 30, dy: 60 } });
  for (const id of ['s1.b1.n1', 's1.b1.n2', 's1.b1.n3']) {
    const e = effectiveItem(item(id), ctx);
    assert.deepEqual([e.cx - item(id).cx, e.cy - item(id).cy], [30, 60]);
  }
});

test('a block-level scale grows the block about its own centre', () => {
  const block = scene.blocks['s1.b1'];
  const bcy = block.y + block.h / 2;
  const a = item('s1.b1.n1');
  const e = effectiveItem(a, ctxOf({ 's1.b1': { scaleX: 2, scaleY: 2 } }));
  near(e.cy - bcy, (a.cy - bcy) * 2, 'distance from the block centre doubles');
  assert.equal(e.scaleX, 2);
});

test('a block-level rotation turns pieces about the block centre and adds to their angle', () => {
  const block = scene.blocks['s1.b1'];
  const bcx = block.x + block.w / 2;
  const bcy = block.y + block.h / 2;
  const a = item('s1.b1.n1');
  const e = effectiveItem(a, ctxOf({ 's1.b1': { angle: 90 } }));
  near(Math.hypot(e.cx - bcx, e.cy - bcy), Math.hypot(a.cx - bcx, a.cy - bcy), 'radius preserved');
  assert.equal(e.angle, 90);
});

test('effectiveRect scales the size, for connectors', () => {
  const a = item('s1.b1.n2');
  const r = effectiveRect(a, ctxOf({ 's1.b1.n2': { scaleX: 2, scaleY: 0.5, dx: 4 } }));
  assert.deepEqual(r, { cx: a.cx + 4, cy: a.cy, w: a.w * 2, h: a.h * 0.5 });
});

test('overrideFromGesture produces a patch that reproduces the gesture exactly', () => {
  const targets = [
    { cx: 300, cy: 900, scaleX: 1.5, scaleY: 1.5, angle: 20 },
    { cx: 1000, cy: 400, scaleX: 0.8, scaleY: 1.2, angle: -45 },
  ];
  for (const id of ['s1.b1.n2', 's1.b1.n1.note', 's1.b2.url']) {
    for (const target of targets) {
      const ctx = ctxOf({ 's1.b1.n1': { dx: 12 }, 's1.b2.frame': { dx: 9, dy: -3, scaleX: 1.1, scaleY: 1.1 } });
      const patch = overrideFromGesture(item(id), target, ctx);
      const after = effectiveItem(item(id), { ...ctx, overrides: { ...ctx.overrides, [id]: patch } });
      near(after.cx, target.cx, `${id} cx`);
      near(after.cy, target.cy, `${id} cy`);
      near(after.scaleX, target.scaleX, `${id} scaleX`);
      near(after.scaleY, target.scaleY, `${id} scaleY`);
      near(after.angle, target.angle, `${id} angle`);
    }
  }
});

test('overrideFromGesture records a text width change only when it really changed', () => {
  const a = item('s1.b1.n1');
  const same = overrideFromGesture(a, { cx: a.cx, cy: a.cy, scaleX: 1, scaleY: 1, angle: 0, w: a.w }, ctxOf());
  assert.equal('w' in same, false);
  const wider = overrideFromGesture(a, { cx: a.cx, cy: a.cy, scaleX: 1, scaleY: 1, angle: 0, w: a.w + 100 }, ctxOf());
  assert.equal(wider.w, a.w + 100);
});
