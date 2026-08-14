import { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx.js';

/** Escape-to-close, shared by every overlay. */
export function useEscape(handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') handler(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, active]);
}

/**
 * Anchored popover. `button` is a render prop so the trigger keeps its own
 * styling; the panel closes on outside click, Escape, or an explicit close().
 */
export function Popover({ button, children, align = 'start', panelClassName, className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = () => setOpen(false);

  useEscape(close, open);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={ref} className={cx('relative', className)}>
      {button({ open, toggle: () => setOpen((o) => !o), close })}
      {open && (
        <div
          className={cx(
            'absolute z-[60] mt-2 min-w-[12rem] animate-pop rounded-lg border border-line bg-surface p-1 shadow-pop',
            align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            panelClassName
          )}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: Icon, children, hint, danger, className, ...props }) {
  return (
    <button
      className={cx(
        'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] transition-colors duration-100',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink-2 hover:bg-raised hover:text-ink',
        className
      )}
      {...props}
    >
      {Icon && <Icon size={14} className="shrink-0" />}
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="font-mono text-2xs text-ink-3">{hint}</span>}
    </button>
  );
}

/** Centred dialog. Content is expected to bring its own padding. */
export function Modal({ open, onClose, children, className, labelledBy }) {
  useEscape(() => onClose?.(), open);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="scrim absolute inset-0 animate-fade-in" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[min(90vh,44rem)] w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop',
          'animate-rise',
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
