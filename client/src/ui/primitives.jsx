import { forwardRef } from 'react';
import { cx } from '../lib/cx.js';

/* ------------------------------- Button ------------------------------- */

const VARIANTS = {
  primary: 'bg-ink text-void hover:opacity-90 active:opacity-80',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-raised',
  ghost: 'text-ink-2 hover:text-ink hover:bg-raised',
  accent: 'bg-accent text-accent-ink hover:opacity-90 active:opacity-80',
  quiet: 'text-ink-2 hover:text-ink',
  danger: 'text-danger hover:bg-danger/10',
};

const SIZES = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded',
  md: 'h-8 px-3 text-[13px] gap-1.5 rounded',
  lg: 'h-10 px-4 text-sm gap-2 rounded-lg',
};

export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-medium transition-all duration-150 ease-out',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

const ICON_SIZES = { sm: 'h-6 w-6 rounded', md: 'h-7 w-7 rounded', lg: 'h-8 w-8 rounded-md' };

export const IconButton = forwardRef(function IconButton(
  { size = 'md', variant = 'ghost', active, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cx(
        'inline-flex shrink-0 items-center justify-center transition-all duration-150 ease-out',
        'disabled:pointer-events-none disabled:opacity-30',
        active ? 'bg-raised text-ink' : VARIANTS[variant],
        ICON_SIZES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/* ------------------------------ Tooltip ------------------------------- */

const TIP_SIDES = {
  top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  left: 'right-full mr-2 top-1/2 -translate-y-1/2',
  right: 'left-full ml-2 top-1/2 -translate-y-1/2',
};

export function Tooltip({ label, hint, side = 'bottom', className, children }) {
  if (!label) return children;
  return (
    <span className={cx('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cx(
          'pointer-events-none absolute z-[70] flex items-center gap-1.5 whitespace-nowrap rounded border border-line bg-surface px-2 py-1',
          'text-[11px] font-medium text-ink opacity-0 shadow-pop transition-opacity duration-150',
          'delay-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          TIP_SIDES[side]
        )}
      >
        {label}
        {hint && <span className="font-mono text-2xs text-ink-3">{hint}</span>}
      </span>
    </span>
  );
}

/* ------------------------------- Bits --------------------------------- */

export function Kbd({ children, className }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-raised px-1',
        'font-mono text-2xs text-ink-3',
        className
      )}
    >
      {children}
    </kbd>
  );
}

export function Spinner({ size = 14, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx('animate-spin', className)}
      style={{ animationDuration: '700ms' }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.18" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Chip({ active, className, children, ...props }) {
  const Tag = props.onClick ? 'button' : 'span';
  return (
    <Tag
      className={cx(
        'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 text-xs transition-colors duration-150',
        active
          ? 'border-ink bg-ink text-void'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Section heading with the trailing hairline rule used across the app. */
export function SectionRule({ children, action, className }) {
  return (
    <div className={cx('flex items-center gap-3', className)}>
      <span className="label">{children}</span>
      <span className="h-px flex-1 bg-line" />
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-3">
          <Icon size={16} />
        </div>
      )}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-[28ch] text-xs leading-relaxed text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
