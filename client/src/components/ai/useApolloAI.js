import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssistantError, streamAssistant } from '../../api/assistant.js';
import {
  groupByAge,
  loadActiveId,
  loadConversations,
  newId,
  saveActiveId,
  saveConversations,
  titleFrom,
} from './conversations.js';

/**
 * Apollo AI's brain, on the client side: the conversation list, the active
 * transcript, and one turn in flight.
 *
 * Two decisions are worth knowing about.
 *
 * A new chat does not exist until it is spoken to. `activeId === null` is the
 * home state, and pressing "New chat" simply returns there — so the history
 * never fills up with empty threads someone opened and thought better of.
 *
 * Streaming text is accumulated in a ref and flushed on an animation frame,
 * not committed per token. A fast model emits fragments far quicker than the
 * screen refreshes, and re-rendering (and re-parsing markdown for) a long
 * answer on every one of them is what makes a chat interface feel heavy.
 */

/** Rewritten to disk at most this often, so streaming never thrashes storage. */
const PERSIST_DEBOUNCE_MS = 500;

export function useApolloAI() {
  const [conversations, setConversations] = useState(() => loadConversations());
  const [activeId, setActiveId] = useState(() => {
    const saved = loadActiveId();
    return saved && loadConversations().some((c) => c.id === saved) ? saved : null;
  });
  const [busy, setBusy] = useState(false);

  const abortRef = useRef(null);
  const frameRef = useRef(0);
  const bufferRef = useRef('');
  // The transcript a request was launched against — read at send time rather
  // than from a closure, so a reply always lands on the thread that asked.
  const targetRef = useRef(null);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );
  const messages = active?.messages ?? [];

  /* ------------------------------ persistence ----------------------------- */

  useEffect(() => {
    const timer = setTimeout(() => saveConversations(conversations), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [conversations]);

  useEffect(() => saveActiveId(activeId), [activeId]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      abortRef.current?.abort();
    },
    []
  );

  /* -------------------------------- helpers ------------------------------- */

  /** Update one conversation's messages and float it to the top of the list. */
  const patchMessages = useCallback((id, update) => {
    setConversations((list) => {
      const index = list.findIndex((c) => c.id === id);
      if (index === -1) return list;
      const conversation = list[index];
      const next = {
        ...conversation,
        messages: update(conversation.messages),
        updatedAt: new Date().toISOString(),
      };
      return [next, ...list.slice(0, index), ...list.slice(index + 1)];
    });
  }, []);

  /** Replace the trailing assistant message — the one currently being written. */
  const patchLastReply = useCallback(
    (id, changes) =>
      patchMessages(id, (list) => {
        const index = list.length - 1;
        if (index < 0 || list[index].role !== 'assistant') return list;
        return [...list.slice(0, index), { ...list[index], ...changes }];
      }),
    [patchMessages]
  );

  const flush = useCallback(
    (id) => {
      if (!bufferRef.current) return;
      const chunk = bufferRef.current;
      bufferRef.current = '';
      patchMessages(id, (list) => {
        const index = list.length - 1;
        if (index < 0 || list[index].role !== 'assistant') return list;
        return [...list.slice(0, index), { ...list[index], content: list[index].content + chunk }];
      });
    },
    [patchMessages]
  );

  /* --------------------------------- turn --------------------------------- */

  /**
   * Run one turn against `history`, appending the answer to `id`.
   * Shared by `send` and `retry` so a retried question follows exactly the same
   * path as the original — including which messages the model gets to see.
   */
  const run = useCallback(
    async (id, history) => {
      targetRef.current = id;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      bufferRef.current = '';
      patchMessages(id, (list) => [...list, { id: newId(), role: 'assistant', content: '', pending: true }]);

      const schedule = () => {
        if (frameRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = 0;
          flush(id);
        });
      };

      try {
        const { text, stopped, warning } = await streamAssistant({
          messages: history.map(({ role, content }) => ({ role, content })),
          signal: controller.signal,
          onDelta: (chunk) => {
            bufferRef.current += chunk;
            schedule();
          },
        });

        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
        bufferRef.current = '';

        // The server's final text is authoritative: it is whole even if a frame
        // was dropped, and it is what the non-streaming fallback returns.
        patchLastReply(id, {
          content: text,
          pending: false,
          stopped: stopped || undefined,
          warning: warning || undefined,
        });
      } catch (err) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
        bufferRef.current = '';

        // Stopping before the first token still lands here, as an abort. That is
        // a decision the user made, not a failure to report back to them.
        const aborted = err?.kind === 'aborted' || err?.name === 'AbortError';
        const message = aborted
          ? null
          : err instanceof AssistantError
            ? err.message
            : "Apollo AI couldn't complete that response. Try again.";
        // An error replaces the empty placeholder, but never a partial answer
        // that already has something worth reading in it.
        patchMessages(id, (list) => {
          const index = list.length - 1;
          if (index < 0 || list[index].role !== 'assistant') return list;
          const partial = list[index].content;
          return [
            ...list.slice(0, index),
            {
              ...list[index],
              pending: false,
              content: partial,
              ...(message ? { error: message } : { stopped: true }),
            },
          ];
        });
      } finally {
        abortRef.current = null;
        targetRef.current = null;
        setBusy(false);
      }
    },
    [flush, patchLastReply, patchMessages]
  );

  const send = useCallback(
    (raw) => {
      const content = String(raw ?? '').trim();
      if (!content || busy) return;

      const userMessage = { id: newId(), role: 'user', content };
      const now = new Date().toISOString();

      let id = activeId;
      let history;

      if (!id) {
        // First message of a fresh chat: this is where the conversation is born.
        id = newId();
        history = [userMessage];
        setConversations((list) => [
          { id, title: titleFrom(content), createdAt: now, updatedAt: now, messages: history },
          ...list,
        ]);
        setActiveId(id);
      } else {
        // A failed turn stays on screen but never goes back to the model — an
        // empty assistant message would just confuse the next answer.
        const current = conversations.find((c) => c.id === id);
        history = [
          ...(current?.messages ?? []).filter((m) => m.role !== 'assistant' || m.content),
          userMessage,
        ];
        patchMessages(id, (list) => [...list, userMessage]);
      }

      run(id, history);
    },
    [activeId, busy, conversations, patchMessages, run]
  );

  /** Ask the last question again, discarding the answer that failed. */
  const retry = useCallback(() => {
    if (busy || !activeId || !active) return;
    const list = active.messages;
    const lastUser = [...list].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;

    const upTo = list.slice(0, list.lastIndexOf(lastUser) + 1);
    patchMessages(activeId, () => upTo);
    run(
      activeId,
      upTo.filter((m) => m.role !== 'assistant' || m.content)
    );
  }, [active, activeId, busy, patchMessages, run]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    const id = targetRef.current;
    if (!id) return;
    // Keep whatever arrived — a stopped answer is usually still a useful one.
    flush(id);
    patchLastReply(id, { pending: false, stopped: true });
  }, [flush, patchLastReply]);

  /* ----------------------------- conversations ---------------------------- */

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setActiveId(null);
  }, []);

  const select = useCallback(
    (id) => {
      if (id === activeId) return;
      abortRef.current?.abort();
      setActiveId(id);
    },
    [activeId]
  );

  const rename = useCallback((id, title) => {
    const clean = String(title || '').trim().slice(0, 80);
    if (!clean) return;
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title: clean } : c)));
  }, []);

  const remove = useCallback(
    (id) => {
      if (id === activeId) abortRef.current?.abort();
      setConversations((list) => list.filter((c) => c.id !== id));
      setActiveId((current) => (current === id ? null : current));
    },
    [activeId]
  );

  const groups = useMemo(() => groupByAge(conversations), [conversations]);

  return {
    groups,
    active,
    activeId,
    messages,
    busy,
    send,
    stop,
    retry,
    newChat,
    select,
    rename,
    remove,
  };
}
