import test from 'node:test';
import assert from 'node:assert/strict';
import { constrain45, fitInto, nearestPoint, rectSnapPoints, scaledSize, tint } from '../src/components/board/tools/util.js';

test('tint turns hex colours into translucent rgba and leaves other strings alone', () => {
  assert.equal(tint('#c81e3a', 0.06), 'rgba(200,30,58,0.06)');
  assert.equal(tint('#fff', 0.5), 'rgba(255,255,255,0.5)');
  assert.equal(tint('red', 0.5), 'red');
});

test('nearestPoint finds the closest candidate inside the radius, else null', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 100, y: 100 }];
  assert.deepEqual(nearestPoint(pts, 9, 9, 5), { x: 10, y: 10 });
  assert.equal(nearestPoint(pts, 50, 50, 5), null);
  assert.equal(nearestPoint([], 0, 0, 5), null);
});

test('rectSnapPoints returns the centre and the four edge midpoints', () => {
  const pts = rectSnapPoints({ left: 0, top: 0, width: 100, height: 50 });
  assert.equal(pts.length, 5);
  assert.deepEqual(pts, [{ x: 50, y: 25 }, { x: 50, y: 0 }, { x: 100, y: 25 }, { x: 50, y: 50 }, { x: 0, y: 25 }]);
});

test('constrain45 snaps a drag to the nearest 45 degree step and keeps its length', () => {
  const p = constrain45({ x: 0, y: 0 }, { x: 100, y: 12 });
  assert.ok(Math.abs(p.y) < 1e-9);
  assert.ok(Math.abs(p.x - Math.hypot(100, 12)) < 1e-9);
  const d = constrain45({ x: 0, y: 0 }, { x: 50, y: 60 });
  assert.ok(Math.abs(d.x - d.y) < 1e-9);
});

test('scaledSize shrinks the long side to the limit and never enlarges', () => {
  assert.deepEqual(scaledSize(3200, 1600, 1600), { w: 1600, h: 800 });
  assert.deepEqual(scaledSize(800, 4000, 1600), { w: 320, h: 1600 });
  assert.deepEqual(scaledSize(400, 300, 1600), { w: 400, h: 300 });
});

test('fitInto scales an image to sit centred inside a box', () => {
  const f = fitInto(1000, 500, { x: 100, y: 200, w: 400, h: 400 }, 20);
  assert.equal(f.scale, 0.36);
  assert.equal(f.left, 100 + (400 - 1000 * 0.36) / 2);
  assert.equal(f.top, 200 + (400 - 500 * 0.36) / 2);
});
