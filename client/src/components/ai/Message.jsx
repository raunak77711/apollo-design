import { memo, useCallback } from 'react';
import { Check, Copy, RotateCw, TriangleAlert } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { Markdown } from '../../lib/markdown.jsx';
import { useCopy } from '../../lib/useCopy.js';
import { Spark } from '../../ui/brand.jsx';
import CodeBlock from './CodeBlock.jsx';

/**
 * One turn.
 *
 * The hierarchy is carried by shape rather than by decoration: what you said
 * is a contained block on the right, what Apollo said is simply content —
 * page-width prose in the reading size, with a small mark in the gutter as the
 * only chrome. Two boxes facing each other would make an answer look like a
 * remark; an answer is the thing you came for, so it gets to be the page.
 */

/* --------------------------------- user ---------------------------------- */

export const UserMessage = memo(function UserMessage({ content }) {
  return (
    <div className="flex animate-fade-in justify-end">
      <div className="max-w-[85%] rounded-xl rounded-br-sm border border-line bg-raised px-3.5 py-2.5 sm:max-w-[75%]">
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.6] text-ink">{content}</p>
      </div>
    </div>
  );
});

/* ------------------------------- assistant -------------------------------- */

function renderCode(block, key) {
  return <CodeBlock key={key} code={block.text} lang={block.lang} closed={block.closed} />;
}

export const AssistantMessage = memo(function AssistantMessage({
  content,
  pending,
  stopped,
  error,
  warning,
  isLast,
  onRetry,
}) {
  const { copied, copy } = useCopy();
  const onCopy = useCallback(() => copy(content), [content, copy]);

  const empty = !content;
  const showActions = !pending && !empty;

  return (
    <div className="group/msg animate-fade-in">
      <div className="flex gap-2.5 sm:gap-3.5">
        <Spark
          size={13}
          className={cx(
            'mt-[7px] shrink-0 transition-colors duration-300',
            pending ? 'animate-pulse text-accent' : error ? 'text-danger' : 'text-accent'
          )}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          {empty && pending ? (
            <Thinking />
          ) : (
            <Markdown text={content} renderCode={renderCode} />
          )}

          {stopped && (
            <p className="mt-2 font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">Stopped</p>
          )}

          {(error || warning) && (
            <div
              role="alert"
              className={cx(
                'mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
                error ? 'border-danger/25 bg-danger/[0.06]' : 'border-line bg-raised'
              )}
            >
              <TriangleAlert size={14} className={cx('mt-px shrink-0', error ? 'text-danger' : 'text-ink-3')} />
              <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">{error || warning}</p>
              {error && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink"
                >
                  <RotateCw size={12} /> Retry
                </button>
              )}
            </div>
          )}

          {showActions && (
            <div
              className={cx(
                'mt-2 flex items-center gap-0.5 transition-opacity duration-150',
                isLast ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/msg:opacity-100'
              )}
            >
              <Action onClick={onCopy} icon={copied ? Check : Copy} tone={copied ? 'accent' : undefined}>
                {copied ? 'Copied' : 'Copy'}
              </Action>
              {isLast && onRetry && !error && (
                <Action onClick={onRetry} icon={RotateCw}>
                  Retry
                </Action>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function Action({ icon: Icon, children, tone, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-6 items-center gap-1.5 rounded px-1.5 text-2xs font-medium transition-colors duration-150',
        tone === 'accent' ? 'text-accent-text' : 'text-ink-3 hover:bg-raised hover:text-ink'
      )}
      {...props}
    >
      <Icon size={12} />
      {children}
    </button>
  );
}

/**
 * The wait before the first token — three marks breathing in sequence.
 * Deliberately not a skeleton: nothing is known about the shape of the answer
 * yet, and drawing fake paragraphs would be a guess dressed as progress.
 */
function Thinking() {
  return (
    <div className="flex h-6 items-center gap-1" role="status" aria-label="Apollo AI is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-ink-3"
          style={{ animation: `apollo-think 1.1s ${i * 0.16}s ease-in-out infinite` }}
        />
      ))}
    </div>
  );
}
