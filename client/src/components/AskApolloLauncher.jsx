import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { shorten } from '../lib/format.js';
import { useCreateDesign } from '../lib/useCreateDesign.js';
import { useLocalState } from '../lib/useLocalState.js';
import { applyOperations } from '../design/operations.js';
import { createEmptyDocument } from '../design/schema.js';
import { findPreset } from '../design/presets.js';
import { useEscape } from '../ui/overlay.jsx';
import { Button, IconButton, Spinner } from '../ui/primitives.jsx';
import { ApolloMark, Spark } from '../ui/brand.jsx';
import DesignPreview from './DesignPreview.jsx';
import FormatPicker from './FormatPicker.jsx';
import ApolloConversation from './apollo/ApolloConversation.jsx';
import { useApolloChat } from './apollo/useApolloChat.js';

/**
 * Ask Apollo on the homepage — the same assistant as the editor's, in a shape
 * that suits a landing page: a greeting that arrives once, and a panel that
 * opens beside it rather than over the page.
 *
 * It talks to Apollo through the shared conversation engine, so a brief typed
 * here runs the identical pipeline the editor runs. Operations land on a
 * scratch document held locally; once there is something to look at, "Open in
 * editor" hands that exact document to a new project — nothing is regenerated,
 * and every layer arrives editable.
 */

const CANVAS_BACKGROUND = '#0A0A0B';
const TEASER_DELAY_MS = 1800;
const GREETING = 'Say hi to our assistant 👋';

const OPENERS = ['Instagram post for a coffee shop opening', 'Poster for a jazz night'];
const FOLLOW_UPS = ['Make the headline bigger', 'Try a warmer palette'];

export default function AskApolloLauncher() {
  const { create, creating } = useCreateDesign();
  // Remembered, so the greeting introduces Apollo once and then stays out of
  // the way — after that the mark alone is the way in.
  const [greeted, setGreeted] = useLocalState('apollo.assistantGreeted', false);
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);

  const [format, setFormat] = useState(() => findPreset('banner'));
  const [draft, setDraft] = useState(() =>
    createEmptyDocument({ width: format.width, height: format.height, background: CANVAS_BACKGROUND })
  );

  // A copy of the scratch document that handlers can read without waiting for a
  // render, plus the undo stack behind it.
  const current = useRef(draft);
  const history = useRef([]);

  const commit = useCallback((next) => {
    current.current = next;
    setDraft(next);
  }, []);

  const applyToDraft = useCallback(
    (operations) => {
      const previous = current.current;
      history.current.push(previous);
      commit(applyOperations(previous, operations).document);
    },
    [commit]
  );

  const chat = useApolloChat({ document: draft, onOperations: applyToDraft });
  const drawn = draft.elements.length > 0;

  useEffect(() => {
    if (greeted) return undefined;
    const timer = setTimeout(() => setTeaser(true), TEASER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [greeted]);

  const close = useCallback(() => setOpen(false), []);
  useEscape(close, open);

  const start = () => {
    setTeaser(false);
    setGreeted(true);
    setOpen(true);
  };

  const dismissTeaser = () => {
    setTeaser(false);
    setGreeted(true);
  };

  const undo = () => {
    const previous = history.current.pop();
    if (previous) commit(previous);
  };

  const chooseCanvas = ({ name = 'Custom', width, height }) => {
    setFormat({ name, width, height });
    commit(createEmptyDocument({ width, height, background: CANVAS_BACKGROUND }));
  };

  const openInEditor = () => {
    if (!drawn || creating) return;
    create({ name: shorten(chat.firstBrief, 60) || 'Apollo design', document: draft });
  };

  return (
    <>
      {/* On a phone the panel takes most of the screen, so it gets a scrim to
          sit against. On a desktop it is a card beside the page, not over it. */}
      {open && (
        <div className="scrim fixed inset-0 z-40 animate-fade-in sm:hidden" onClick={close} aria-hidden="true" />
      )}

      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2.5 sm:inset-x-auto sm:bottom-5 sm:right-5">
        {open && (
          <section
            role="dialog"
            aria-label="Ask Apollo"
            className="pointer-events-auto flex h-[min(76vh,32rem)] w-full animate-assistant-in flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop sm:w-[23rem]"
          >
            <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line pl-3 pr-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-accent">
                <Spark size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-ink">Ask Apollo</span>
                <span className="block truncate text-2xs leading-tight text-ink-3">
                  {drawn ? 'Keep going, or open it in the editor' : 'Describe it — Apollo draws it'}
                </span>
              </span>
              <IconButton onClick={close} aria-label="Close Ask Apollo">
                <X size={14} />
              </IconButton>
            </header>

            <ApolloConversation
              chat={chat}
              autoFocus
              canExplore={false}
              onUndo={undo}
              suggestions={drawn ? FOLLOW_UPS : OPENERS}
              placeholder={drawn ? 'Ask for a change…' : 'Describe the design you want…'}
              intro={
                <p className="text-[13px] leading-relaxed text-ink-2">
                  Hello. Tell me what you need — a post, a poster, a banner — and I’ll draw the first draft in
                  editable layers. Open it in the editor whenever it looks right.
                </p>
              }
              leading={
                drawn ? undefined : (
                  <FormatPicker
                    value={format}
                    side="top"
                    onSelect={chooseCanvas}
                    onCustom={(size) => chooseCanvas(size)}
                  />
                )
              }
              footer={drawn ? <ReadyBar document={draft} creating={creating} onOpen={openInEditor} /> : null}
            />
          </section>
        )}

        {!open && teaser && (
          <div className="pointer-events-auto flex animate-assistant-in items-center gap-1 rounded-full border border-line bg-surface py-1.5 pl-3 pr-1.5 shadow-pop">
            <button
              onClick={start}
              className="flex items-center gap-2 rounded-full text-[13px] text-ink transition-colors duration-150 hover:text-accent-text"
            >
              <Spark size={13} className="shrink-0 text-accent" />
              {GREETING}
            </button>
            <IconButton size="sm" onClick={dismissTeaser} aria-label="Dismiss the assistant greeting">
              <X size={12} />
            </IconButton>
          </div>
        )}

        <button
          onClick={() => (open ? close() : start())}
          aria-label={open ? 'Close Ask Apollo' : 'Ask Apollo'}
          aria-expanded={open}
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-pop transition-all duration-150 ease-out hover:border-line-strong hover:bg-raised active:scale-95"
        >
          {open ? <X size={17} /> : <ApolloMark size={20} sparkClassName="fill-accent" />}
        </button>
      </div>
    </>
  );
}

/**
 * What Apollo has drawn so far, and the one step that matters from here: taking
 * it into the editor. The document travels across as it stands, so the editor
 * opens on exactly what is in the preview.
 */
function ReadyBar({ document: doc, creating, onOpen }) {
  return (
    <div className="shrink-0 animate-fade-in border-t border-line px-2.5 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-[4.25rem] w-[6rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-workspace p-1.5">
          <DesignPreview
            document={doc}
            className="shadow-art"
            style={{ height: '100%', width: 'auto', maxWidth: '100%' }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-ink">Your draft is ready</p>
          <p className="num mt-0.5 truncate text-2xs text-ink-3">
            {doc.canvas.width} × {doc.canvas.height} · {doc.elements.length} layer
            {doc.elements.length === 1 ? '' : 's'}
          </p>
          <Button variant="primary" size="sm" className="mt-2 w-full" onClick={onOpen} disabled={creating}>
            {creating ? (
              <Spinner size={12} />
            ) : (
              <>
                Open in editor <ArrowRight size={12} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
