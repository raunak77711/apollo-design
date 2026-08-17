import { useCallback, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { applyOperations } from '../../design/operations.js';

/**
 * Ask Apollo's conversation engine.
 *
 * Lifted out of the editor panel so the homepage assistant and the editor share
 * one brain: the same endpoints, the same rules about what comes back, and one
 * transcript shape. Apollo never returns markup — it returns operations, and
 * the only thing the two callers disagree about is where those land: the
 * editor's undo stack, or Home's scratch document.
 */
export function useApolloChat({ document, selectedElementId = null, onOperations }) {
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [directions, setDirections] = useState(null);

  // The document is replaced on every applied operation, so a request in flight
  // must read it at send time rather than from the closure it was created in.
  const latest = useRef(null);
  latest.current = { document, selectedElementId, onOperations };

  // The last thing asked for is the brief a set of alternative directions works
  // from; the first is what the design ends up being called.
  const lastBrief = useMemo(() => [...messages].reverse().find((m) => m.role === 'user')?.text || '', [messages]);
  const firstBrief = useMemo(() => messages.find((m) => m.role === 'user')?.text || '', [messages]);
  const lastAppliedIndex = useMemo(
    () => messages.reduce((last, m, i) => (m.applied > 0 ? i : last), -1),
    [messages]
  );

  const fail = useCallback((err) => {
    setMessages((m) => [...m, { role: 'apollo', text: err.message, error: true }]);
  }, []);

  const send = useCallback(
    async (text) => {
      const message = String(text ?? '').trim();
      if (!message || busy) return null;
      const { document: doc, selectedElementId: target, onOperations: apply } = latest.current;

      setDirections(null);
      setMessages((m) => [...m, { role: 'user', text: message }]);
      setBusy(true);
      try {
        const res = await api.aiChat({ message, document: doc, selectedElementId: target || null });
        if (res.operations?.length) apply?.(res.operations);
        setMessages((m) => [
          ...m,
          {
            role: 'apollo',
            text: res.message || 'Done.',
            applied: res.operations?.length || 0,
            rejected: res.skipped?.length || 0,
            direction: res.direction || null,
          },
        ]);
        return res;
      } catch (err) {
        fail(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, fail]
  );

  /**
   * Three complete alternatives — different layout and type voice, not the same
   * design recoloured. Each is previewed live from its own operations, so what
   * you pick is exactly what lands on the canvas.
   */
  const explore = useCallback(async () => {
    const { document: doc } = latest.current;
    if (!lastBrief || busy) return;
    setBusy(true);
    setDirections(null);
    try {
      const res = await api.aiVariations({ message: lastBrief, document: doc });
      setDirections(
        (res.directions || []).map((d) => ({ ...d, preview: applyOperations(doc, d.operations).document }))
      );
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [busy, lastBrief, fail]);

  const chooseDirection = useCallback((direction) => {
    latest.current.onOperations?.(direction.operations);
    setDirections(null);
    setMessages((m) => [...m, { role: 'apollo', text: direction.message, applied: direction.operations.length }]);
  }, []);

  return { messages, busy, directions, send, explore, chooseDirection, lastBrief, firstBrief, lastAppliedIndex };
}
