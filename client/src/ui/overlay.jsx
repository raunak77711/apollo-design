import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * `side` flips it above the trigger, for controls that sit at the bottom of a
 * panel with nowhere below them to open into.
 */
export function Popover({ button, children, align = 'start', side = 'bottom', panelClassName, className }) {
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
            'absolute z-[60] min-w-[12rem] animate-pop rounded-lg border border-line bg-surface p-1 shadow-pop',
            side === 'top' ? 'bottom-full mb-2' : 'mt-2',
            align === 'end' ? 'right-0' : 'left-0',
            side === 'top'
              ? align === 'end'
                ? 'origin-bottom-right'
                : 'origin-bottom-left'
              : align === 'end'
                ? 'origin-top-right'
                : 'origin-top-left',
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
        'disabled:pointer-events-none disabled:opacity-40',
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

export function MenuDivider() {
  return <span className="my-1 block h-px bg-line" />;
}

/**
 * Right-click menu, portalled to the body so it is never clipped by a scrolling
 * panel and always flips away from the viewport edges.
 */
export function ContextMenu({ x, y, onClose, children, className }) {
  const ref = useRef(null);
  const [place, setPlace] = useState({ left: x, top: y, ready: false });

  useEscape(onClose, true);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { width, height } = node.getBoundingClientRect();
    setPlace({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      ready: true,
    });
  }, [x, y]);

  useEffect(() => {
    const dismiss = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: place.left, top: place.top, visibility: place.ready ? 'visible' : 'hidden' }}
      className={cx(
        'fixed z-[90] w-52 animate-pop rounded-lg border border-line bg-surface p-1 shadow-pop',
        className
      )}
    >
      {children}
    </div>,
    document.body
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
