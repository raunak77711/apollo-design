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

export function NumberField({ label, value, onChange, onCommit, step = 1, min, max, suffix, className }) {
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
    <div className={cx('flex h-8 items-center rounded border border-line bg-raised transition-colors focus-within:border-accent/70 focus-within:bg-surface hover:border-line-strong', className)}>
      {label && (
        <span
          onPointerDown={onScrubDown}
          title={`Drag to change ${label}`}
          className="flex h-full w-7 shrink-0 cursor-ew-resize select-none items-center justify-center font-mono text-2xs uppercase text-ink-3 transition-colors hover:text-ink"
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

export function ColorField({ label, value, onChange, onCommit, className }) {
  const hex = toHex(value);
  return (
    <Field label={label} className={className}>
      <div className="flex h-8 items-center gap-2 rounded border border-line bg-raised px-1.5 transition-colors focus-within:border-accent/70 hover:border-line-strong">
        <span className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-sm border border-line-strong">
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
          className="w-full min-w-0 bg-transparent font-mono text-xs uppercase text-ink outline-none"
        />
      </div>
    </Field>
  );
}

export function SelectField({ label, value, options, onChange, className }) {
  return (
    <Field label={label} className={className}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field appearance-none pr-7 capitalize"
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

/** Icon or text segmented control — one visible active state, no borders. */
export function Segmented({ value, options, onChange, className, size = 'md' }) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-0.5 rounded border border-line bg-raised p-0.5',
        size === 'sm' ? 'h-7' : 'h-8',
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
              'flex h-full flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors duration-150',
              active ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink'
            )}
          >
            {Icon && <Icon size={14} />}
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
