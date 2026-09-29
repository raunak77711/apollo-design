import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MARGIN, MAX_ZOOM, MIN_ZOOM, clampView, clampZoom, fitZoom, focusRect, panBy, scrollThumb, viewForSection, worldYAtCenter, zoomAbout,
} from '../src/components/board/engine/viewportMath.js';

const box = { viewW: 1000, viewH: 800, worldW: 1400, worldH: 20000 };

test('zoom is clamped to 0.25–4', () => {
  assert.equal(clampZoom(100), MAX_ZOOM);
  assert.equal(clampZoom(0.001), MIN_ZOOM);
  assert.equal(clampZoom(1.7), 1.7);
});

test('fitZoom fits the board width to the window', () => {
  assert.equal(fitZoom(1400), 1);
  assert.equal(fitZoom(700), 0.5);
  assert.equal(fitZoom(100), MIN_ZOOM);
});

test('zoomAbout keeps the world point under the cursor fixed', () => {
  const view = { zoom: 1, x: -100, y: -2000 };
  const sx = 300;
  const sy = 400;
  const before = { wx: (sx - view.x) / view.zoom, wy: (sy - view.y) / view.zoom };
  const next = zoomAbout(view, 2, sx, sy);
  assert.equal(next.zoom, 2);
  assert.ok(Math.abs((sx - next.x) / next.zoom - before.wx) < 1e-9);
  assert.ok(Math.abs((sy - next.y) / next.zoom - before.wy) < 1e-9);
});

test('zoomAbout respects the zoom limits and does not drift at them', () => {
  const view = { zoom: MAX_ZOOM, x: 0, y: 0 };
  assert.deepEqual(zoomAbout(view, 2, 500, 500), { zoom: MAX_ZOOM, x: 0, y: 0 });
});

test('a board narrower than the window is centred and cannot be panned sideways', () => {
  const v = clampView({ zoom: 0.5, x: 999, y: 0 }, box);
  assert.equal(v.x, (1000 - 700) / 2);
});

test('a board wider than the window can be panned only to its edges, plus a margin', () => {
  const left = clampView({ zoom: 1, x: 9999, y: 0 }, box);
  const right = clampView({ zoom: 1, x: -9999, y: 0 }, box);
  assert.equal(left.x, MARGIN);
  assert.equal(right.x, 1000 - 1400 - MARGIN);
});

test('vertical pan stops at the top and the bottom of the board', () => {
  assert.equal(clampView({ zoom: 1, x: 0, y: 5000 }, box).y, MARGIN);
  assert.equal(clampView({ zoom: 1, x: 0, y: -999999 }, box).y, 800 - 20000 - MARGIN);
});

test('a board shorter than the window sits at the top margin', () => {
  assert.equal(clampView({ zoom: 0.25, x: 0, y: -500 }, { ...box, worldH: 1000 }).y, MARGIN);
});

test('panBy translates', () => {
  assert.deepEqual(panBy({ zoom: 2, x: 10, y: 20 }, 5, -5), { zoom: 2, x: 15, y: 15 });
});

test('focusRect centres a rectangle and never zooms past maxZoom', () => {
  const v = focusRect({ x: 600, y: 3000, w: 200, h: 100 }, { viewW: 1000, viewH: 800, pad: 100, maxZoom: 2.5 });
  assert.equal(v.zoom, 2.5);
  assert.ok(Math.abs(700 * v.zoom + v.x - 500) < 1e-9, 'rect centre x is at the window centre');
  assert.ok(Math.abs(3050 * v.zoom + v.y - 400) < 1e-9, 'rect centre y is at the window centre');
});

test('focusRect zooms out to fit a large rectangle', () => {
  const v = focusRect({ x: 0, y: 0, w: 1400, h: 2000 }, { viewW: 1000, viewH: 800, pad: 50 });
  assert.ok(v.zoom < 0.4);
});

test('scrollThumb tracks position through the board and never vanishes', () => {
  const top = scrollThumb({ zoom: 1, x: 0, y: 0 }, 800, 8000);
  assert.equal(top.top, 0);
  assert.equal(top.size, 0.1);
  const bottom = scrollThumb({ zoom: 1, x: 0, y: -(8000 - 800) }, 800, 8000);
  assert.ok(Math.abs(bottom.top - 0.9) < 1e-9);
  const middle = scrollThumb({ zoom: 1, x: 0, y: -3600 }, 800, 8000);
  assert.ok(Math.abs(middle.top - 0.45) < 1e-9);
  assert.equal(scrollThumb({ zoom: 1, x: 0, y: 0 }, 800, 500).size, 1, 'a board shorter than the window fills the track');
  assert.equal(scrollThumb({ zoom: 1, x: 0, y: 0 }, 800, 1e7).size, 0.04, 'a huge board still has a visible thumb');
});

test('worldYAtCenter and viewForSection', () => {
  assert.equal(worldYAtCenter({ zoom: 2, x: 0, y: -1000 }, 800), 700);
  const v = viewForSection({ y: 5000 }, { zoom: 1, x: 0, y: 0 });
  assert.equal(v.zoom, 1);
  assert.equal(v.y, -5000 + 24);
});
