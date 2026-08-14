import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../lib/cx.js';

/* -------------------------------------------------------------------------
   Inspector controls. Numbers are set in mono type and can be scrubbed by
   dragging their label — the same gesture designers expect from pro tools.
   ------------------------------------------------------------------------- */

export function Row({ children, className }) {
  return <div className={cx('grid grid-cols-2 gap-2', className)}>{children}</div>;
}

export function Field({ label, children, className, hint }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1 flex items-center justify-between">
          <span className="label">{label}</span>
          {hint && <span className="num text-2xs text-ink-3">{hint}</span>}
        </span>
      )}
      {children}
    </label>
  );
}

export function TextField({ className, ...props }) {
  return <input className={cx('field', className)} {...props} />;
}

/** `name` is the spoken label — "X" and "W" are legible but say nothing aloud. */
export function NumberField({ label, name, value, onChange, onCommit, step = 1, min, max, suffix, className }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  const scrub = useRef(null);

  useEffect(() => {
    if (document.activeElement !== scrub.current?.input) setDraft(String(round(value)));
  }, [value]);

  const commit = (raw) => {
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      setDraft(String(round(value)));
      return;
    }
    onChange(clamp(parsed, min, max));
    onCommit?.();
  };

  const onScrubDown = (e) => {
    e.preventDefault();
    const start = { x: e.clientX, value: Number(value) || 0 };
    const move = (ev) => {
      const next = clamp(start.value + Math.round((ev.clientX - start.x) * step), min, max);
      setDraft(String(round(next)));
      onChange(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onCommit?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={cx('flex h-7 items-center rounded border border-line bg-raised transition-colors focus-within:border-accent/70 focus-within:bg-surface hover:border-line-strong', className)}>
      {label && (
        <span
          onPointerDown={onScrubDown}
          title={`Drag to change ${label}`}
          className="flex h-full min-w-[1.75rem] shrink-0 cursor-ew-resize select-none items-center justify-center px-1.5 font-mono text-2xs uppercase text-ink-3 transition-colors hover:text-ink"
        >
          {label}
        </span>
      )}
      <input
        ref={(el) => {
          scrub.current = { input: el };
        }}
        value={draft}
        inputMode="decimal"
        aria-label={name || label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1) * step;
            const next = clamp((Number(value) || 0) + delta, min, max);
            setDraft(String(round(next)));
            onChange(next);
            onCommit?.();
          }
        }}
        className="w-full min-w-0 bg-transparent pr-1 font-mono text-xs tabular-nums text-ink outline-none"
      />
      {suffix && <span className="pr-2 font-mono text-2xs text-ink-3">{suffix}</span>}
    </div>
  );
}

/** Label sits in the same left column as PropRow, so colours line up with everything else. */
export function ColorField({ label, value, onChange, onCommit, className }) {
  const hex = toHex(value);
  return (
    <div className={cx('flex h-7 items-center gap-2', className)}>
      {label && <span className="label w-16 shrink-0 truncate">{label}</span>}
      <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded border border-line bg-raised px-1.5 transition-colors focus-within:border-accent/70 hover:border-line-strong">
        <span className="relative h-4 w-4 shrink-0 overflow-hidden rounded-sm border border-line-strong">
          <input
            type="color"
            value={hex}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onCommit?.()}
            aria-label={label || 'Colour'}
            className="absolute -left-1 -top-1 h-8 w-8 cursor-pointer"
          />
        </span>
        <input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.()}
          spellCheck={false}
          aria-label={`${label || 'Colour'} hex value`}
          className="w-full min-w-0 bg-transparent font-mono text-xs uppercase text-ink outline-none"
        />
      </div>
    </div>
  );
}

export function SelectField({ label, name, value, options, onChange, className }) {
  return (
    <Field label={label} className={className}>
      <div className="relative">
        <select
          value={value}
          aria-label={name || label}
          onChange={(e) => onChange(e.target.value)}
          className="field appearance-none pr-7"
        >
          {options.map((o) =>
            typeof o === 'string' ? (
              <option key={o} value={o}>
                {o}
              </option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            )
          )}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-3" />
      </div>
    </Field>
  );
}

export function SliderField({ label, value, onChange, onCommit, min = 0, max = 100, step = 1, display, className }) {
  return (
    <div className={cx('py-0.5', className)}>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="num text-2xs text-ink-2">{display ?? round(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={() => onCommit?.()}
      />
    </div>
  );
}

/**
 * Inspector row: a fixed micro-label column with the control beside it. Every
 * property reads down one edge, which is what makes a dense panel scannable.
 */
export function PropRow({ label, children, className, align = 'center' }) {
  const top = align === 'start';
  return (
    <div className={cx('flex min-h-[1.75rem] gap-2', top ? 'items-start' : 'items-center', className)}>
      <span className={cx('label w-16 shrink-0 truncate', top && 'pt-1.5')}>{label}</span>
      <div className={cx('flex min-w-0 flex-1 gap-1.5', top ? 'items-start' : 'items-center')}>{children}</div>
    </div>
  );
}

/** Label, track and readout on one line — the Appearance panel's workhorse. */
export function SliderRow({ label, value, display, onChange, onCommit, min = 0, max = 100, step = 1, disabled }) {
  return (
    <div className={cx('flex h-7 items-center gap-2', disabled && 'pointer-events-none opacity-40')}>
      <span className="label w-16 shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        className="min-w-0 flex-1"
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={() => onCommit?.()}
        onKeyUp={() => onCommit?.()}
      />
      <span className="num w-10 shrink-0 text-right text-2xs text-ink-2">{display ?? round(value)}</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-[16px] w-[28px] shrink-0 rounded-full border transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'border-line-strong bg-raised hover:border-ink-3'
      )}
    >
      <span
        className={cx(
          'absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all duration-150 ease-out',
          checked ? 'left-[13px] bg-accent-ink' : 'left-[2px] bg-ink-3'
        )}
      />
    </button>
  );
}

/** Square icon toggle used for italic/underline/flip and other on-off styling. */
export function IconToggle({ icon: Icon, label, active, onClick, disabled, className }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={Boolean(active)}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'border-accent/60 bg-accent/15 text-accent-text'
          : 'border-line bg-raised text-ink-3 hover:border-line-strong hover:text-ink',
        className
      )}
    >
      <Icon size={13} />
    </button>
  );
}

/** Full-width action with an icon — group, distribute, replace image, and so on. */
export function ActionButton({ icon: Icon, label, onClick, disabled, danger, title, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className={cx(
        'flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded border border-line bg-raised px-2 text-xs',
        'transition-colors duration-150 hover:border-line-strong disabled:pointer-events-none disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink-2 hover:text-ink',
        className
      )}
    >
      {Icon && <Icon size={12} className="shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** Icon or text segmented control — one visible active state, no borders. */
export function Segmented({ value, options, onChange, className, size = 'md' }) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-0.5 rounded border border-line bg-raised p-0.5',
        size === 'sm' ? 'h-6' : 'h-7',
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title || o.label}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex h-full flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-2xs font-medium transition-colors duration-150',
              active ? 'bg-elevated text-ink shadow-[0_1px_2px_rgb(0_0_0/0.18)]' : 'text-ink-3 hover:text-ink'
            )}
          >
            {Icon && <Icon size={13} />}
            {o.label && <span className={cx(Icon && 'sr-only sm:not-sr-only')}>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- helpers ------------------------------- */

const clamp = (n, min, max) => {
  let v = n;
  if (typeof min === 'number') v = Math.max(min, v);
  if (typeof max === 'number') v = Math.min(max, v);
  return v;
};

const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

export function toHex(v = '#000000') {
  if (typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
    return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
  }
  return '#000000';
}
