import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { EMPTY_PREFERENCES, questionsFor, toPreferences } from '../../design/preferences.js';
import { Button, IconButton } from '../../ui/primitives.jsx';
import { useEscape } from '../../ui/overlay.jsx';
import { Spark } from '../../ui/brand.jsx';

/**
 * The beat between asking and drawing.
 *
 * Apollo takes a position — every question arrives with an opinion already
 * marked, and the primary action is "Create", not "Submit answers". Skipping is
 * a peer of confirming, not a way out of a form: `Esc` and "Apollo decides"
 * both start the same generation, just without constraints.
 *
 * Two or three questions, one screen, no scrolling, no progress bar. Anything
 * longer stops being a creative check and starts being an interruption.
 */
export default function PreferenceSheet({ open, prompt, onCancel, onConfirm }) {
  const questions = useMemo(() => (open ? questionsFor(prompt) : []), [open, prompt]);
  const [answers, setAnswers] = useState(EMPTY_PREFERENCES);
  const panelRef = useRef(null);

  // Each new brief is a fresh conversation — carrying the last one's answers
  // over would quietly art-direct a design the user never asked for.
  useEffect(() => {
    if (open) setAnswers({ ...EMPTY_PREFERENCES, ...suggestionsFrom(questions) });
  }, [open, questions]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEscape(() => onCancel?.(), open);

  if (!open) return null;

  const set = (id, value) => setAnswers((a) => ({ ...a, [id]: a[id] === value ? null : value }));
  const create = (withAnswers) => onConfirm(withAnswers ? toPreferences(answers, questions) : null);

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="prefs-title">
      <div className="scrim absolute inset-0 animate-fade-in" onClick={onCancel} />

      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') create(true);
        }}
        className={cx(
          'relative flex w-full max-w-[34rem] flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-pop outline-none',
          'animate-rise sm:rounded-2xl'
        )}
      >
        <header className="flex items-start gap-3 px-6 pb-1 pt-6">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent">
            <Spark size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="prefs-title" className="font-display text-[17px] font-semibold tracking-[-0.02em]">
              Before I create this…
            </h2>
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-3">“{prompt}”</p>
          </div>
          <IconButton onClick={onCancel} aria-label="Back to your brief">
            <X size={15} />
          </IconButton>
        </header>

        <div className="flex flex-col gap-5 px-6 py-5">
          {questions.map((question) => (
            <Question key={question.id} question={question} value={answers[question.id]} onChange={(v) => set(question.id, v)} />
          ))}
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-6 py-3.5">
          <button
            onClick={() => create(false)}
            className="rounded text-[13px] text-ink-3 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
          >
            Skip — Apollo decides
          </button>
          <div className="flex-1" />
          <Button variant="primary" size="lg" onClick={() => create(true)}>
            Create <ArrowRight size={14} />
          </Button>
        </footer>
      </div>
    </div>
  );
}

/** Whatever the brief already implied, marked before the user touches anything. */
function suggestionsFrom(questions) {
  return Object.fromEntries(questions.filter((q) => q.suggested).map((q) => [q.id, q.suggested]));
}

/* -------------------------------- questions ------------------------------- */

function Question({ question, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-[13px] font-medium text-ink">{question.question}</legend>
      {question.hint && <p className="-mt-1.5 mb-2.5 text-xs text-ink-3">{question.hint}</p>}

      {question.kind === 'single' && (
        <div className="flex flex-wrap gap-1.5">
          {question.options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value)}
              className={cx(
                'group flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ease-out',
                value === option.value
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-raised hover:text-ink'
              )}
            >
              <span className="text-[13px] font-medium leading-none">{option.label}</span>
              {option.hint && (
                <span className={cx('text-2xs leading-none', value === option.value ? 'text-accent-text' : 'text-ink-3')}>
                  {option.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {question.kind === 'color' && <ColorAnswer value={value || []} onChange={onChange} />}

      {question.kind === 'text' && (
        <input
          type="text"
          value={value || ''}
          maxLength={60}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
          className="field h-9 text-[13px]"
        />
      )}
    </fieldset>
  );
}

/* A short palette of grounds and accents that actually work as brand colours,
   plus the native picker for anything specific. */
const SWATCHES = ['#E4322B', '#EA580C', '#C9A227', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#EC4899', '#12293F', '#0A0A0A'];
const MAX_COLORS = 3;

function ColorAnswer({ value, onChange }) {
  const pickerRef = useRef(null);

  const toggle = (hex) =>
    onChange(value.includes(hex) ? value.filter((c) => c !== hex) : [...value, hex].slice(0, MAX_COLORS));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SWATCHES.map((hex) => {
        const index = value.indexOf(hex);
        return (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={index >= 0}
            onClick={() => toggle(hex)}
            style={{ background: hex }}
            className={cx(
              'relative h-8 w-8 rounded-md border transition-all duration-150 ease-out',
              index >= 0 ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:scale-105 hover:border-line-strong'
            )}
          >
            {/* The first colour becomes the accent, so its position is worth showing. */}
            {index >= 0 && (
              <span className="num absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-accent-ink">
                {index + 1}
              </span>
            )}
          </button>
        );
      })}

      {value.filter((c) => !SWATCHES.includes(c)).map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Remove ${hex}`}
          onClick={() => toggle(hex)}
          style={{ background: hex }}
          className="h-8 w-8 rounded-md border border-accent ring-2 ring-accent/30"
        />
      ))}

      <label
        className={cx(
          'flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-dashed border-line-strong text-ink-3',
          'transition-colors duration-150 hover:border-accent hover:text-accent',
          value.length >= MAX_COLORS && 'pointer-events-none opacity-40'
        )}
      >
        <Plus size={14} />
        <input
          ref={pickerRef}
          type="color"
          className="sr-only h-0 w-0"
          onChange={(e) => {
            const hex = e.target.value.toUpperCase();
            if (!value.includes(hex)) onChange([...value, hex].slice(0, MAX_COLORS));
          }}
        />
      </label>
    </div>
  );
}
