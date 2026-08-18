import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Plus, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { EMPTY_PREFERENCES, questionsFor, toPreferences } from '../../design/preferences.js';
import { Button, IconButton } from '../../ui/primitives.jsx';
import { useEscape } from '../../ui/overlay.jsx';
import { Spark } from '../../ui/brand.jsx';
import { Specimen, hasSpecimens } from './specimens.jsx';

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
 *
 * The options are drawn rather than described (see `specimens.jsx`). This is
 * the one screen standing between a brief and a design, and asking someone to
 * turn "Bold poster" into a mental picture before they can choose is slower and
 * less honest than showing them the picture — a design tool should answer a
 * question about looks by looking like something.
 *
 * It portals to the body, and has to. Its host is the homepage composer, which
 * sits inside a `lift` entrance animation; a filling animation of `transform`
 * leaves the element a containing block for fixed descendants for good, so
 * rendering in place would size `inset-0` to the composer instead of the
 * viewport — a scrim over a strip of hero, and the page painting over the
 * panel.
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

  // The sheet covers the page; the page should stop moving underneath it.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEscape(() => onCancel?.(), open);

  if (!open) return null;

  const suggested = suggestionsFrom(questions);
  const set = (id, value) => setAnswers((a) => ({ ...a, [id]: a[id] === value ? null : value }));
  const create = (withAnswers) => onConfirm(withAnswers ? toPreferences(answers, questions) : null);

  return createPortal(
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prefs-title"
    >
      <div className="scrim absolute inset-0 animate-fade-in" onClick={onCancel} />

      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') create(true);
        }}
        className={cx(
          'relative flex max-h-[92svh] w-full max-w-[40rem] flex-col overflow-hidden rounded-t-2xl',
          'border border-line bg-surface shadow-pop outline-none',
          'animate-rise sm:max-h-[calc(100svh_-_3rem)] sm:rounded-2xl'
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-6 py-4">
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

        {/* Two or three questions fit without scrolling on any normal window.
            The overflow is here for the short ones — a laptop at 720px, a
            phone in landscape — where a cut-off Create button would be the
            worst possible failure. */}
        <div className="thin-scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-6 py-5">
          {questions.map((question, i) => (
            <Question
              key={question.id}
              index={i}
              question={question}
              value={answers[question.id]}
              suggested={suggested[question.id]}
              onChange={(v) => set(question.id, v)}
            />
          ))}
        </div>

        <footer className="flex shrink-0 items-center gap-3 border-t border-line px-6 py-3.5">
          <button
            onClick={() => create(false)}
            className="rounded text-[13px] text-ink-3 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
          >
            Skip — Apollo decides
          </button>
          <div className="flex-1" />
          <Button variant="accent" size="lg" onClick={() => create(true)}>
            Create <ArrowRight size={14} />
          </Button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

/** Whatever the brief already implied, marked before the user touches anything. */
function suggestionsFrom(questions) {
  return Object.fromEntries(questions.filter((q) => q.suggested).map((q) => [q.id, q.suggested]));
}

/* -------------------------------- questions ------------------------------- */

function Question({ question, value, suggested, onChange, index }) {
  const drawable = question.kind === 'single' && hasSpecimens(question.id);
  const live = question.kind === 'color' && value?.length > 0;

  return (
    <fieldset className="animate-rise" style={{ animationDelay: `${index * 70}ms` }}>
      <legend className="text-[14px] font-medium leading-snug text-ink">{question.question}</legend>
      {question.hint && !live && <p className="mt-1 text-xs leading-relaxed text-ink-3">{question.hint}</p>}

      {/* The colours Apollo read out of the brief. This question is about how a
          design should sit around them, which is hard to answer without seeing
          which colours it means. */}
      {question.seeds?.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          {question.seeds.map((hex) => (
            <span key={hex} className="flex items-center gap-1.5 rounded border border-line bg-raised py-0.5 pl-1 pr-2">
              <span className="h-3.5 w-3.5 rounded-sm border border-line" style={{ background: hex }} />
              <span className="num text-2xs text-ink-2">{hex}</span>
            </span>
          ))}
        </div>
      )}

      {question.kind === 'single' && (
        <div
          className={cx(
            'mt-3 grid gap-2',
            question.options.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'
          )}
        >
          {question.options.map((option) =>
            drawable ? (
              <OptionCard
                key={option.value}
                option={option}
                question={question}
                selected={value === option.value}
                suggested={suggested === option.value}
                onClick={() => onChange(option.value)}
              />
            ) : (
              <OptionChip
                key={option.value}
                option={option}
                selected={value === option.value}
                onClick={() => onChange(option.value)}
              />
            )
          )}
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
          className={cx(
            'mt-3 h-10 w-full rounded-lg border border-line bg-raised px-3 text-[13px] text-ink outline-none',
            'transition-colors duration-150 placeholder:text-ink-3',
            'hover:border-line-strong focus:border-accent/70 focus:bg-surface'
          )}
        />
      )}
    </fieldset>
  );
}

/**
 * One option, as the design it stands for.
 *
 * The specimen carries the answer and the label only confirms it, so the plate
 * gets the space and the words get a line. Selection is the accent — a ring and
 * a tick, the same marks the editor uses for a selected layer.
 */
function OptionCard({ option, question, selected, suggested, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'group relative overflow-hidden rounded-lg border bg-surface text-left transition-all duration-150 ease-out',
        selected
          ? 'border-accent ring-2 ring-accent/25'
          : 'border-line hover:border-line-strong hover:shadow-pop'
      )}
    >
      <span className="relative block aspect-[16/9] overflow-hidden bg-workspace">
        <span className="block h-full w-full transition-transform duration-300 ease-out group-hover:scale-[1.05]">
          <Specimen question={question.id} value={option.value} seed={question.seeds?.[0]} />
        </span>
        {selected && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Check size={10} strokeWidth={3.2} />
          </span>
        )}
      </span>

      <span className={cx('block border-t px-2.5 py-1.5', selected ? 'border-accent/30 bg-accent/[0.07]' : 'border-line')}>
        <span className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-tight text-ink">{option.label}</span>
          {suggested && (
            <>
              <Spark size={9} className="shrink-0 text-accent" />
              <span className="sr-only">— Apollo's read of your brief</span>
            </>
          )}
        </span>
        {option.hint && <span className="mt-0.5 block truncate text-2xs leading-tight text-ink-3">{option.hint}</span>}
      </span>
    </button>
  );
}

/** The words-only fallback, for any question with nothing to draw. */
function OptionChip({ option, selected, onClick }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ease-out',
        selected
          ? 'border-accent bg-accent/10 text-ink'
          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-raised hover:text-ink'
      )}
    >
      <span className="text-[13px] font-medium leading-none">{option.label}</span>
      {option.hint && (
        <span className={cx('text-2xs leading-none', selected ? 'text-accent-text' : 'text-ink-3')}>{option.hint}</span>
      )}
    </button>
  );
}

/* --------------------------------- colours -------------------------------- */

/* A short palette of grounds and accents that actually work as brand colours,
   plus the native picker for anything specific. */
const SWATCHES = ['#E4322B', '#EA580C', '#C9A227', '#16A34A', '#0D9488', '#2563EB', '#7C3AED', '#EC4899', '#12293F', '#0A0A0A'];
const MAX_COLORS = 3;

function ColorAnswer({ value, onChange }) {
  const toggle = (hex) =>
    onChange(value.includes(hex) ? value.filter((c) => c !== hex) : [...value, hex].slice(0, MAX_COLORS));

  const extras = value.filter((c) => !SWATCHES.includes(c));
  const full = value.length >= MAX_COLORS;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        {[...SWATCHES, ...extras].map((hex) => {
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
                'relative h-9 w-9 rounded-lg border transition-all duration-150 ease-out',
                index >= 0
                  ? 'border-accent ring-2 ring-accent/30'
                  : 'border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop'
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

        <label
          className={cx(
            'flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong text-ink-3',
            'transition-colors duration-150 hover:border-accent hover:text-accent',
            full && 'pointer-events-none opacity-40'
          )}
        >
          <Plus size={14} />
          <span className="sr-only">Pick another colour</span>
          <input
            type="color"
            className="sr-only h-0 w-0"
            onChange={(e) => {
              const hex = e.target.value.toUpperCase();
              if (!value.includes(hex)) onChange([...value, hex].slice(0, MAX_COLORS));
            }}
          />
        </label>
      </div>

      {/* Once there is a pick, the static hint is replaced by what Apollo will
          actually do with it — the answer talking back. */}
      {value.length > 0 && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-line" style={{ background: value[0] }} />
          <span className="num text-ink-2">{value[0]}</span>
          <span>leads — Apollo builds the palette around it.</span>
          {full && <span className="text-ink-3">That’s all three.</span>}
        </p>
      )}
    </div>
  );
}
