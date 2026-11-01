import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/components/board/state/history.js';

test('undo and redo walk snapshots in order', () => {
  const h = createHistory();
  h.record('A');
  h.record('B');
  assert.equal(h.canUndo, true);
  assert.equal(h.undo('C'), 'B');
  assert.equal(h.undo('B'), 'A');
  assert.equal(h.undo('A'), null);
  assert.equal(h.canRedo, true);
  assert.equal(h.redo('A'), 'B');
  assert.equal(h.redo('B'), 'C');
  assert.equal(h.redo('C'), null);
});

test('recording a new change clears the redo stack', () => {
  const h = createHistory();
  h.record('A');
  h.undo('B');
  assert.equal(h.canRedo, true);
  h.record('A2');
  assert.equal(h.canRedo, false);
});

test('a burst with the same coalesce key keeps only the first snapshot', () => {
  let t = 0;
  const h = createHistory(100, () => t);
  h.record('S0', 'style:a_1');
  t = 100; h.record('S1', 'style:a_1');
  t = 200; h.record('S2', 'style:a_1');
  assert.equal(h.undo('S3'), 'S0');
  assert.equal(h.canUndo, false);
});

test('coalescing stops after a pause or a different key', () => {
  let t = 0;
  const h = createHistory(100, () => t);
  h.record('S0', 'k');
  t = 2000; h.record('S1', 'k');
  h.record('S2', 'other');
  assert.equal(h.undo('X'), 'S2');
  assert.equal(h.undo('S2'), 'S1');
  assert.equal(h.undo('S1'), 'S0');
});

test('history is capped', () => {
  const h = createHistory(3);
  ['A', 'B', 'C', 'D', 'E'].forEach((s) => h.record(s));
  assert.equal(h.undo('F'), 'E');
  assert.equal(h.undo('E'), 'D');
  assert.equal(h.undo('D'), 'C');
  assert.equal(h.undo('C'), null);
});

test('clear empties both stacks', () => {
  const h = createHistory();
  h.record('A');
  h.undo('B');
  h.clear();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
});
