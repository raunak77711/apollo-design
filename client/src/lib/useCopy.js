import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy to the clipboard, with the tick that confirms it happened.
 *
 * The confirmation is the point: a copy button that does not visibly change
 * leaves you pressing it twice. `copied` stays true for `resetAfter` and then
 * releases on its own.
 */
export function useCopy(resetAfter = 1600) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(String(text ?? ''));
      } catch {
        // Denied permission, or an insecure origin. The fallback is the oldest
        // trick there is, and it still works everywhere.
        const area = document.createElement('textarea');
        area.value = String(text ?? '');
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
        } catch {
          document.body.removeChild(area);
          return false;
        }
        document.body.removeChild(area);
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetAfter);
      return true;
    },
    [resetAfter]
  );

  return { copied, copy };
}
