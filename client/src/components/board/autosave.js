/**
 * Debounced saving that cannot lose the last edit.
 *
 * `schedule` takes a *thunk*, evaluated when the save actually runs, so the
 * board written is the one that exists then, not the one that existed when the
 * timer started. `flush` runs it now — wired to pagehide/visibilitychange so
 * closing the tab inside the debounce window still writes. A failed save is
 * reported through `onError` and never thrown, and never blocks later saves.
 */
// Wrapped, not passed as `{ set: setTimeout }`: called as a method, the browser's setTimeout throws "Illegal invocation".
const realTimers = { set: (fn, ms) => setTimeout(fn, ms), clear: (handle) => clearTimeout(handle) };

export function createAutosaver({ save, delay = 800, onError, timers = realTimers }) {
  let pending = null;
  let handle = null;
  let inflight = Promise.resolve();

  const run = () => {
    handle = null;
    if (!pending) return inflight;
    const getRecord = pending;
    pending = null;
    inflight = inflight.then(() => save(getRecord())).catch((err) => onError?.(err));
    return inflight;
  };

  return {
    schedule(getRecord) {
      pending = getRecord;
      if (handle) timers.clear(handle);
      handle = timers.set(run, delay);
    },
    flush() {
      if (handle) {
        timers.clear(handle);
        handle = null;
      }
      return run();
    },
    get dirty() {
      return pending !== null;
    },
  };
}
