import { cx } from '../lib/cx.js';

/**
 * Apollo's marks, drawn rather than imported so they stay crisp at 16px and
 * inherit colour from context. The monogram is the "A" of the Apollo lockup;
 * the four-point spark is the light — it doubles as the Apollo AI signal.
 */

export function ApolloMark({ size = 22, className, sparkClassName }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx('shrink-0', className)}
      aria-hidden="true"
    >
      <path
        d="M2.9 20.4 10.6 4.4 18.3 20.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M19.4 2.6c.34 2.68 1.22 3.56 3.9 3.9-2.68.34-3.56 1.22-3.9 3.9-.34-2.68-1.22-3.56-3.9-3.9 2.68-.34 3.56-1.22 3.9-3.9Z"
        fill="currentColor"
        className={sparkClassName}
      />
    </svg>
  );
}

export function Spark({ size = 14, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cx('shrink-0', className)} aria-hidden="true">
      <path
        d="M12 1.6c.62 5.3 4.5 9.18 9.8 9.8-5.3.62-9.18 4.5-9.8 9.8-.62-5.3-4.5-9.18-9.8-9.8 5.3-.62 9.18-4.5 9.8-9.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Wordmark({ className, markSize = 20 }) {
  return (
    <span className={cx('flex items-center gap-2 text-ink', className)}>
      <ApolloMark size={markSize} />
      <span className="font-display text-[13px] font-medium uppercase tracking-[0.2em]">Apollo</span>
    </span>
  );
}
