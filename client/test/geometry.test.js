import test from 'node:test';
import assert from 'node:assert/strict';
import { connectorPoints, edgePoint, overlaps, rectOf } from '../src/components/board/engine/geometry.js';

const box = (cx, cy, w, h) => ({ cx, cy, w, h });

test('edgePoint leaves a rectangle through the side the target is on', () => {
  assert.deepEqual(edgePoint(box(0, 0, 100, 40), 0, 500), { x: 0, y: 20 });
  assert.deepEqual(edgePoint(box(0, 0, 100, 40), 500, 0), { x: 50, y: 0 });
  assert.deepEqual(edgePoint(box(0, 0, 100, 40), 0, 0), { x: 0, y: 0 });
});

test('connectorPoints joins two stacked boxes edge to edge, pulled back by the gap', () => {
  const p = connectorPoints(box(700, 50, 200, 60), box(700, 250, 200, 60), 10);
  assert.equal(Math.round(p.x1), 700);
  assert.equal(Math.round(p.y1), 90);
  assert.equal(Math.round(p.x2), 700);
  assert.equal(Math.round(p.y2), 210);
});

test('connectorPoints falls back to centre-to-centre when boxes touch', () => {
  const p = connectorPoints(box(0, 0, 100, 100), box(0, 90, 100, 100), 10);
  assert.equal(p.degenerate, true);
});

test('overlaps and rectOf', () => {
  assert.equal(overlaps(box(0, 0, 100, 100), box(60, 0, 100, 100)), true);
  assert.equal(overlaps(box(0, 0, 100, 100), box(101, 0, 100, 100)), false);
  assert.deepEqual(rectOf({ id: 'x', cx: 1, cy: 2, w: 3, h: 4, kind: 'text' }), { cx: 1, cy: 2, w: 3, h: 4 });
});
