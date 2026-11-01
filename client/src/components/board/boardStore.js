/**
 * Boards live in the browser: IndexedDB first (room for images), with
 * localStorage as the fallback when IndexedDB is missing or refuses to open —
 * private windows and locked-down profiles do that. If neither works, reads
 * return nothing and writes fail with a sentence the person can act on; the
 * board on screen is unaffected and Save-to-file still works.
 */

const DB_NAME = 'apollo-boards';
const STORE = 'boards';
const LS_INDEX = 'apollo-boards:index';
const LS_ITEM = 'apollo-boards:item:';

export class StoreError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreError';
  }
}

const isQuota = (err) => err && (err.name === 'QuotaExceededError' || err.code === 22 || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

const writeError = (err) =>
  new StoreError(
    isQuota(err)
      ? "Couldn't save — your browser's storage is full. Save the board to a file to keep it."
      : "Couldn't save this board in your browser. Save it to a file to keep it."
  );

export function summarize(record) {
  return {
    id: record.id,
    title: record.title || record.spec?.title || 'Untitled board',
    sections: record.spec?.sections?.length || 0,
    degraded: (record.spec?.sections || []).filter((s) => s.degraded).length,
    updatedAt: record.updatedAt || 0,
  };
}

export function createBoardStore({
  idb = typeof indexedDB !== 'undefined' ? indexedDB : null,
  ls = typeof localStorage !== 'undefined' ? localStorage : null,
} = {}) {
  let dbPromise = null;
  let idbFailed = false;
  let mode = 'none';

  const openDb = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = idb.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
        req.onblocked = () => reject(new Error('indexedDB blocked'));
      });
    }
    return dbPromise;
  };

  async function usingIdb() {
    if (!idb || idbFailed) return false;
    try {
      await openDb();
      mode = 'indexeddb';
      return true;
    } catch {
      idbFailed = true;
      return false;
    }
  }

  const usingLs = () => {
    if (!ls) return false;
    mode = 'localstorage';
    return true;
  };

  async function run(kind, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, kind);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const readIndex = () => {
    try {
      const ids = JSON.parse(ls.getItem(LS_INDEX) || '[]');
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  };

  const readItem = (id) => {
    try {
      const raw = ls.getItem(LS_ITEM + id);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  return {
    get mode() {
      return mode;
    },

    async list() {
      let records = [];
      if (await usingIdb()) records = (await run('readonly', (s) => s.getAll())) || [];
      else if (usingLs()) records = readIndex().map(readItem).filter(Boolean);
      return records.map(summarize).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async get(id) {
      if (await usingIdb()) return (await run('readonly', (s) => s.get(id))) || null;
      if (usingLs()) return readItem(id);
      return null;
    },

    async put(record) {
      try {
        if (await usingIdb()) {
          await run('readwrite', (s) => s.put(record));
          return;
        }
        if (!usingLs()) throw new Error('no storage');
        ls.setItem(LS_ITEM + record.id, JSON.stringify(record));
        const ids = readIndex().filter((x) => x !== record.id);
        ids.push(record.id);
        ls.setItem(LS_INDEX, JSON.stringify(ids));
      } catch (err) {
        throw writeError(err);
      }
    },

    async remove(id) {
      try {
        if (await usingIdb()) {
          await run('readwrite', (s) => s.delete(id));
          return;
        }
        if (!usingLs()) return;
        ls.removeItem(LS_ITEM + id);
        ls.setItem(LS_INDEX, JSON.stringify(readIndex().filter((x) => x !== id)));
      } catch (err) {
        throw writeError(err);
      }
    },
  };
}

export const boardStore = createBoardStore();
