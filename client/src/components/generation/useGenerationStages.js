import { useCallback, useEffect, useRef, useState } from 'react';
import { STAGE_ORDER } from './stages.js';

/** Long enough to read a short line, short enough never to hold up the reveal. */
const MIN_DWELL_MS = 900;

/**
 * A readable view of a pipeline that runs at wildly uneven speed.
 *
 * The server crosses its stages when it crosses them: the model call can take
 * four seconds and the composition step four milliseconds. Showing those raw
 * would flash three messages past unread and then sit still.
 *
 * So stages queue. Each one is displayed for at least `MIN_DWELL_MS` before the
 * next is allowed to replace it, and a stage is never displayed before the
 * server has actually reached it — the screen can lag reality, but it can never
 * lead it. `push` is safe to call more times than there are stages; repeats and
 * anything that would move backwards are dropped.
 */
export function useGenerationStages() {
  const [stage, setStage] = useState('understanding');
  const queue = useRef([]);
  const shownAt = useRef(0);
  const timer = useRef(null);
  const seen = useRef(new Set(['understanding']));

  const drain = useCallback(() => {
    clearTimeout(timer.current);
    if (!queue.current.length) return;

    const waited = performance.now() - shownAt.current;
    if (waited < MIN_DWELL_MS) {
      timer.current = setTimeout(drain, MIN_DWELL_MS - waited);
      return;
    }

    const next = queue.current.shift();
    shownAt.current = performance.now();
    setStage(next);
    if (queue.current.length) timer.current = setTimeout(drain, MIN_DWELL_MS);
  }, []);

  const push = useCallback(
    (name) => {
      if (!STAGE_ORDER.includes(name)) return;
      // A rework legitimately revisits earlier stages, so the guard is against
      // repeating a stage rather than against ever going back.
      if (name !== 'reconsidering' && seen.current.has(name)) return;
      seen.current.add(name);
      queue.current.push(name);
      drain();
    },
    [drain]
  );

  /**
   * The design is ready. Anything still queued is history and gets dropped —
   * the scene exists to make waiting pleasant, never to manufacture it, so the
   * reveal is delayed by at most the remainder of the current message's dwell,
   * and by nothing at all once that has elapsed.
   */
  const finish = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = [];
    const remaining = MIN_DWELL_MS - (performance.now() - shownAt.current);
    const show = () => {
      shownAt.current = performance.now();
      setStage('done');
    };
    if (remaining > 0) timer.current = setTimeout(show, remaining);
    else show();
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { stage, push, finish };
}
