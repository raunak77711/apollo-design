const KEY = 'apollo-board-prefs';

/** What a new stroke, shape or text looks like. Remembered across boards and sessions. */
export const DEFAULT_PREFS = { color: 'problem', strokeWidth: 5, fontFamily: 'Inter', fontSize: 56 };

function load() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function createDefaults(onChange) {
  let prefs = load();
  return {
    get: () => prefs,
    set(patch) {
      prefs = { ...prefs, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(prefs));
      } catch {
        /* preferences are a convenience; never fail an edit over them */
      }
      onChange?.(prefs);
    },
  };
}
