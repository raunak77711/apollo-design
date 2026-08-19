import { Check, Copy } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { useCopy } from '../../lib/useCopy.js';

/**
 * A fenced code block, as a piece of the interface rather than a wall of grey.
 *
 * The header carries the language and the one action that matters. Copy is
 * always in the DOM — a button that only exists on hover is a button a keyboard
 * cannot reach — but it stays quiet until the block is hovered or focused.
 *
 * While a block is still streaming (`closed` is false, the fence has no end
 * yet) the copy button is withheld: there is nothing complete to take.
 */
export default function CodeBlock({ code, lang, closed = true, className }) {
  const { copied, copy } = useCopy();
  const label = (lang || '').toLowerCase();

  return (
    <figure
      className={cx(
        'group/code my-4 overflow-hidden rounded-lg border border-line bg-raised first:mt-0 last:mb-0',
        className
      )}
    >
      <figcaption className="flex h-8 items-center gap-2 border-b border-line pl-3 pr-1.5">
        <span className="label truncate">{label || 'code'}</span>
        <span className="flex-1" />
        {closed && (
          <button
            type="button"
            onClick={() => copy(code)}
            aria-label={copied ? 'Copied' : 'Copy code'}
            className={cx(
              'flex h-6 items-center gap-1.5 rounded px-1.5 text-2xs font-medium transition-all duration-150',
              'opacity-0 focus-visible:opacity-100 group-hover/code:opacity-100',
              copied ? 'text-accent-text opacity-100' : 'text-ink-3 hover:bg-surface hover:text-ink'
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </figcaption>

      <div className="thin-scroll overflow-x-auto">
        <pre className="min-w-full px-3 py-3">
          <code className="block whitespace-pre font-mono text-[12.5px] leading-[1.65] text-ink">
            {code}
            {/* A caret only while the fence is still open, so a half-written
                snippet reads as in-progress rather than as finished and wrong. */}
            {!closed && <span className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.18em] animate-pulse bg-accent" />}
          </code>
        </pre>
      </div>
    </figure>
  );
}
