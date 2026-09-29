import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaver } from '../src/components/board/autosave.js';

function fakeTimers() {
  let next = 1;
  const pending = new Map();
  return {
    set: (fn) => { const id = next++; pending.set(id, fn); return id; },
    clear: (id) => pending.delete(id),
    fire: () => { const fns = [...pending.values()]; pending.clear(); fns.forEach((f) => f()); },
    get count() { return pending.size; },
  };
}

test('a burst of changes saves once, with the latest record', async () => {
  const timers = fakeTimers();
  const saved = [];
  const saver = createAutosaver({ save: async (r) => { saved.push(r); }, timers });
  saver.schedule(() => 'v1');
  saver.schedule(() => 'v2');
  saver.schedule(() => 'v3');
  assert.equal(timers.count, 1);
  assert.equal(saver.dirty, true);
  timers.fire();
  await saver.flush();
  assert.deepEqual(saved, ['v3']);
  assert.equal(saver.dirty, false);
});

test('flush saves immediately — the closing-the-tab path', async () => {
  const timers = fakeTimers();
  const saved = [];
  const saver = createAutosaver({ save: async (r) => { saved.push(r); }, timers });
  saver.schedule(() => 'now');
  await saver.flush();
  assert.deepEqual(saved, ['now']);
  assert.equal(timers.count, 0, 'the pending timer was cancelled');
});

test('flush with nothing pending does nothing', async () => {
  const saved = [];
  const saver = createAutosaver({ save: async (r) => { saved.push(r); }, timers: fakeTimers() });
  await saver.flush();
  assert.deepEqual(saved, []);
});

test('a failing save is reported, never thrown, and later saves still run', async () => {
  const timers = fakeTimers();
  const errors = [];
  const saved = [];
  let fail = true;
  const saver = createAutosaver({
    save: async (r) => { if (fail) throw new Error('disk full'); saved.push(r); },
    onError: (e) => errors.push(e.message),
    timers,
  });
  saver.schedule(() => 'a');
  await saver.flush();
  fail = false;
  saver.schedule(() => 'b');
  await saver.flush();
  assert.deepEqual(errors, ['disk full']);
  assert.deepEqual(saved, ['b']);
});
