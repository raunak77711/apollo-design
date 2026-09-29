import test from 'node:test';
import assert from 'node:assert/strict';
import { StoreError, createBoardStore } from '../src/components/board/boardStore.js';
import { newBoardRecord, sanitizeSpec } from '../src/components/board/state/boardRecord.js';
import { SAMPLES } from '../../server/test/fixtures/boardSamples.js';

const fakeLS = () => {
  const m = new Map();
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
};
const record = (id, title, updatedAt) => {
  const r = newBoardRecord({ id, spec: sanitizeSpec({ title, sections: [{ title: 'S', blocks: [SAMPLES.title] }] }), brief: 'b' });
  return { ...r, updatedAt };
};

test('the localStorage fallback stores, lists newest first, gets and removes', async () => {
  const store = createBoardStore({ idb: null, ls: fakeLS() });
  await store.put(record('a', 'Older', 100));
  await store.put(record('b', 'Newer', 200));
  assert.deepEqual((await store.list()).map((s) => s.id), ['b', 'a']);
  assert.equal((await store.list())[0].sections, 1);
  assert.equal((await store.get('a')).title, 'Older');
  assert.equal(await store.get('missing'), null);
  await store.remove('a');
  assert.deepEqual((await store.list()).map((s) => s.id), ['b']);
  assert.equal(store.mode, 'localstorage');
});

test('putting the same id again replaces it rather than duplicating it', async () => {
  const store = createBoardStore({ idb: null, ls: fakeLS() });
  await store.put(record('a', 'One', 1));
  await store.put(record('a', 'Two', 2));
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Two');
});

test('a full disk is a plain-sentence StoreError, not a crash', async () => {
  const ls = fakeLS();
  ls.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  const store = createBoardStore({ idb: null, ls });
  await assert.rejects(store.put(record('a', 'x', 1)), (err) => err instanceof StoreError && /storage is full/.test(err.message));
});

test('corrupted entries are skipped, not fatal', async () => {
  const ls = fakeLS();
  const store = createBoardStore({ idb: null, ls });
  await store.put(record('a', 'Good', 1));
  ls.setItem('apollo-boards:item:bad', '{not json');
  ls.setItem('apollo-boards:index', JSON.stringify(['a', 'bad']));
  assert.deepEqual((await store.list()).map((s) => s.id), ['a']);
  assert.equal(await store.get('bad'), null);
});

test('IndexedDB that refuses to open falls back to localStorage', async () => {
  const idb = { open() { const req = {}; queueMicrotask(() => req.onerror?.()); return req; } };
  const store = createBoardStore({ idb, ls: fakeLS() });
  await store.put(record('a', 'x', 1));
  assert.equal(store.mode, 'localstorage');
  assert.equal((await store.get('a')).id, 'a');
});

test('with no storage at all, writes fail with a StoreError and reads are empty', async () => {
  const store = createBoardStore({ idb: null, ls: null });
  assert.deepEqual(await store.list(), []);
  assert.equal(await store.get('a'), null);
  await assert.rejects(store.put(record('a', 'x', 1)), StoreError);
  assert.equal(store.mode, 'none');
});
