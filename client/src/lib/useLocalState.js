import { useCallback, useState } from 'react';

/**
 * State that survives a reload. Used for interface preferences — which
 * inspector sections are open, for instance — so the editor comes back the way
 * it was left. Never used for document data.
 */
export function useLocalState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? next(current) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Storage can be unavailable (private mode); the preference is not
          // important enough to fail an edit over.
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, update];
}
