import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { Kbd } from '../../ui/primitives.jsx';

/** Roughly nine lines before it starts scrolling — enough for a real question. */
const MAX_HEIGHT = 208;

/**
 * The composer.
 *
 * It has to be equally comfortable for "what is Nepal?" and for a pasted stack
 * trace, which is why the field grows with what is in it and only starts
 * scrolling once it has taken a third of the screen.
 *
 * Send and Stop occupy the same square. They are the same decision at two
 * moments in time, and moving the button when generation starts would mean
 * aiming twice.
 */
const Composer = forwardRef(function Composer(
  { onSend, onStop, busy, placeholder = 'Ask Apollo AI anything…' },
  ref
) {
  const [value, setValue] = useState('');
  const areaRef = useRef(null);

  const resize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  useLayoutEffect(resize, [value, resize]);

  useImperativeHandle(ref, () => ({
    focus: () => areaRef.current?.focus(),
    /** Drop a suggested prompt in without sending it, so it can be edited first. */
    fill: (text) => {
      setValue(text);
      requestAnimationFrame(() => {
        const el = areaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    },
  }));

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    setValue('');
    onSend(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const canSend = Boolean(value.trim()) && !busy;

  return (
    <div className="px-4 pb-4 pt-2 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-[46rem]">
        <div className="rounded-xl border border-line bg-surface transition-colors duration-150 focus-within:border-line-strong">
          <label htmlFor="apollo-composer" className="sr-only">
            Message Apollo AI
          </label>
          <textarea
            id="apollo-composer"
            ref={areaRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-describedby="apollo-composer-hint"
            className={cx(
              'thin-scroll block w-full resize-none bg-transparent px-3.5 pb-1 pt-3',
              'text-[15px] leading-[1.6] text-ink outline-none placeholder:text-ink-3'
            )}
            style={{ maxHeight: MAX_HEIGHT }}
          />

          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <p id="apollo-composer-hint" className="min-w-0 flex-1 truncate pl-1.5 text-2xs text-ink-3">
              <span className="hidden items-center gap-1.5 sm:inline-flex">
                <Kbd>Enter</Kbd> to send
                <span className="text-line-strong">·</span>
                <Kbd>Shift</Kbd>
                <Kbd>Enter</Kbd> for a new line
              </span>
            </p>

            {busy ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className={cx(
                  'flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-raised text-ink-2',
                  'transition-all duration-150 hover:border-line-strong hover:text-ink active:scale-95'
                )}
              >
                <Square size={11} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                className={cx(
                  'flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 ease-out',
                  canSend
                    ? 'bg-ink text-void hover:opacity-90 active:scale-95'
                    : 'cursor-not-allowed border border-line bg-raised text-ink-3'
                )}
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default Composer;
