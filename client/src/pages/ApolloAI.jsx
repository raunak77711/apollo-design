import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, PanelLeft, PenLine } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { useLocalState } from '../lib/useLocalState.js';
import { useMediaQuery } from '../lib/useMediaQuery.js';
import { assistantStatus } from '../api/assistant.js';
import { IconButton, Tooltip } from '../ui/primitives.jsx';
import { useEscape } from '../ui/overlay.jsx';
import AppHeader from '../components/AppHeader.jsx';
import Composer from '../components/ai/Composer.jsx';
import ConversationRail from '../components/ai/ConversationRail.jsx';
import HomeState from '../components/ai/HomeState.jsx';
import { AssistantMessage, UserMessage } from '../components/ai/Message.jsx';
import { useApolloAI } from '../components/ai/useApolloAI.js';

/**
 * Apollo AI — the assistant workspace.
 *
 * The page owns its own height rather than the document's: the transcript
 * scrolls, the composer does not, and neither does the header. That is the
 * difference between a chat you can live in and a page you scroll to type on.
 *
 * Everything else here is arrangement. The conversation state lives in
 * `useApolloAI`, the answer rendering in `Message`, and the model behind it all
 * in the server's assistant service — this file knows about none of them beyond
 * their props.
 */
export default function ApolloAI() {
  const ai = useApolloAI();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [railOpen, setRailOpen] = useLocalState('apollo.ai.railOpen', true);
  const [drawer, setDrawer] = useState(false);
  const [status, setStatus] = useState(null);

  const composerRef = useRef(null);
  const scrollRef = useRef(null);
  // Whether the reader is currently at the foot of the transcript. Streaming
  // only auto-scrolls while they are — scrolling up to re-read something and
  // being yanked back down is the single worst thing a chat can do.
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const { busy, messages, activeId, send, stop, retry, newChat, select } = ai;

  useEffect(() => {
    document.title = 'Apollo AI — Apollo';
    return () => {
      document.title = 'Apollo';
    };
  }, []);

  useEffect(() => {
    let alive = true;
    assistantStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  /* -------------------------------- scroll -------------------------------- */

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    stick.current = near;
    setAtBottom(near);
  }, []);

  const toBottom = useCallback((behavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Layout effect, not effect: the jump has to happen in the same frame the new
  // text paints, or every token produces a visible twitch. Only ever for a
  // transcript — pinning the *home* screen to its foot would hide the greeting
  // above the fold on a phone, which is the one thing it exists to show.
  useLayoutEffect(() => {
    if (!stick.current || !messages.length) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    stick.current = true;
    setAtBottom(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = messages.length ? el.scrollHeight : 0;
    // Switching conversation is about the destination, not its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /* ------------------------------- shortcuts ------------------------------ */

  const startNewChat = useCallback(() => {
    newChat();
    setDrawer(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [newChat]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        startNewChat();
        return;
      }
      // Escape stops generation — but only when it is not busy closing
      // something else, which the drawer's own handler takes care of first.
      if (e.key === 'Escape' && busy && !drawer) stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, drawer, startNewChat, stop]);

  useEscape(() => setDrawer(false), drawer);

  useEffect(() => {
    if (wide) setDrawer(false);
  }, [wide]);

  /* -------------------------------- actions ------------------------------- */

  const pick = useCallback(
    (prompt) => {
      // Filled, not sent: a suggestion is a starting point, and half of them
      // ("Help me debug this error") are useless until you add your own thing.
      composerRef.current?.fill(prompt);
    },
    []
  );

  const selectConversation = useCallback(
    (id) => {
      select(id);
      setDrawer(false);
    },
    [select]
  );

  const showHome = !activeId || messages.length === 0;
  const lastAssistant = messages.reduce((last, m, i) => (m.role === 'assistant' ? i : last), -1);

  const rail = (onClose) => (
    <ConversationRail
      groups={ai.groups}
      activeId={activeId}
      onSelect={selectConversation}
      onNew={startNewChat}
      onRename={ai.rename}
      onDelete={ai.remove}
      onClose={onClose}
      className="h-full"
    />
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden supports-[height:100dvh]:h-dvh">
      <AppHeader />

      <div className="flex min-h-0 flex-1">
        {/* Desktop rail. Collapsed it takes no width at all rather than
            shrinking to a strip of icons — a list of titles is not a thing
            icons can stand in for. */}
        <aside
          className={cx(
            'hidden shrink-0 overflow-hidden border-r border-line bg-void transition-[width] duration-200 ease-out lg:block',
            railOpen ? 'w-[232px]' : 'w-0 border-r-0'
          )}
        >
          <div className="h-full w-[232px]">{rail()}</div>
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <ChatBar
            title={ai.active?.title}
            railOpen={railOpen}
            onToggleRail={() => setRailOpen((open) => !open)}
            onOpenDrawer={() => setDrawer(true)}
            onNew={startNewChat}
            canNew={Boolean(activeId)}
          />

          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="thin-scroll relative min-h-0 flex-1 overflow-y-auto"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
          >
            {showHome ? (
              <HomeState onPick={pick} offline={status ? !status.ready : false} />
            ) : (
              <div className="mx-auto w-full max-w-[46rem] space-y-7 px-4 py-8 sm:px-6 sm:py-10">
                {messages.map((message, i) =>
                  message.role === 'user' ? (
                    <UserMessage key={message.id} content={message.content} />
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      content={message.content}
                      pending={message.pending}
                      stopped={message.stopped}
                      error={message.error}
                      warning={message.warning}
                      isLast={i === lastAssistant && !busy}
                      onRetry={retry}
                    />
                  )
                )}
                {/* Room under the last answer, so the final line is never
                    pinned against the composer. */}
                <div className="h-4" />
              </div>
            )}
          </div>

          {!showHome && !atBottom && (
            <div className="pointer-events-none relative">
              <button
                type="button"
                onClick={() => toBottom()}
                aria-label="Scroll to latest"
                className={cx(
                  'pointer-events-auto absolute bottom-1 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center',
                  'animate-fade-in rounded-full border border-line bg-surface text-ink-2 shadow-pop',
                  'transition-colors duration-150 hover:text-ink'
                )}
              >
                <ArrowDown size={14} />
              </button>
            </div>
          )}

          <Composer
            ref={composerRef}
            onSend={send}
            onStop={stop}
            busy={busy}
            placeholder={showHome ? 'Ask Apollo AI anything…' : 'Reply to Apollo AI…'}
          />
        </main>
      </div>

      {/* Mobile: the history is a drawer, summoned and dismissed. */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="scrim absolute inset-0 animate-fade-in"
            onClick={() => setDrawer(false)}
            aria-label="Close conversation history"
            tabIndex={-1}
          />
          <div className="absolute inset-y-0 left-0 w-[min(19rem,84vw)] animate-slide-in-left border-r border-line bg-void shadow-pop">
            {rail(() => setDrawer(false))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The strip above the transcript. Deliberately thin: it exists to name the
 * conversation and to get out of it, and anything else on it would compete
 * with the answer below.
 */
function ChatBar({ title, railOpen, onToggleRail, onOpenDrawer, onNew, canNew }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2 sm:px-3">
      <Tooltip label={railOpen ? 'Hide chats' : 'Show chats'} side="bottom" className="hidden lg:inline-flex">
        <IconButton size="lg" onClick={onToggleRail} aria-label={railOpen ? 'Hide chats' : 'Show chats'}>
          <PanelLeft size={15} />
        </IconButton>
      </Tooltip>

      <IconButton size="lg" onClick={onOpenDrawer} aria-label="Conversation history" className="lg:hidden">
        <PanelLeft size={15} />
      </IconButton>

      {/* Exactly one h1 per view: in a conversation it is the conversation, and
          on the home screen it is Apollo AI's own heading below. */}
      {title ? (
        <h1 className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium text-ink-2">{title}</h1>
      ) : (
        <p className="min-w-0 flex-1 truncate px-1.5 text-[13px] font-medium text-ink-2">New chat</p>
      )}

      <Tooltip label="New chat" hint="⌘K" side="bottom">
        <IconButton size="lg" onClick={onNew} aria-label="New chat" disabled={!canNew}>
          <PenLine size={15} />
        </IconButton>
      </Tooltip>
    </div>
  );
}
