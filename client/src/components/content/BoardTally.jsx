import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { formatTime } from '../../lib/time.js';

/**
 * Where the Jam board lives in the recording.
 *
 * A strip across the whole video shows which section is being talked about when; below it every
 * section lists the stretches of the video that cover it, and opens to show exactly which blocks and
 * parts (a flow step, a card, an equation term) were spoken, each with its own timestamp. Every time
 * is a link: it seeks the video. This is the hand-off to making shorts - a moment in the video that
 * already knows which board visual belongs with it.
 */

const SHADES = ['bg-ink/80', 'bg-ink/55', 'bg-ink/35'];

function TimeChip({ start, end, onSeek, strong }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSeek(start);
      }}
      className={cx(
        'rounded border px-1.5 py-0.5 font-mono text-2xs transition-colors',
        strong ? 'border-line-strong bg-raised text-ink' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink'
      )}
    >
      {formatTime(start)}
      {end - start >= 2 ? `-${formatTime(end)}` : ''}
    </button>
  );
}

function Strip({ tally, duration, onSeek }) {
  const span = Math.max(1, duration || tally.duration || 1);
  const pct = (t) => `${Math.min(100, Math.max(0, (t / span) * 100))}%`;
  return (
    <div className="mt-4">
      <div className="relative h-9 overflow-hidden rounded-md border border-line bg-surface">
        {tally.uncovered.map((u) => (
          <div
            key={`u${u.start}`}
            className="absolute inset-y-0 opacity-60"
            style={{
              left: pct(u.start),
              width: `calc(${pct(u.end)} - ${pct(u.start)})`,
              backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--c-line)) 0 1px, transparent 1px 6px)',
            }}
            title={`No board content here (${formatTime(u.start)}-${formatTime(u.end)})`}
          />
        ))}
        {tally.sections.flatMap((s) =>
          s.spans.map((sp, i) => (
            <button
              key={`${s.id}-${i}`}
              type="button"
              onClick={() => onSeek(sp.start)}
              title={`${s.headline} - ${formatTime(sp.start)}`}
              className={cx('absolute inset-y-1 rounded-sm transition-opacity hover:opacity-100', SHADES[s.order % SHADES.length], s.primary === sp ? 'opacity-100' : 'opacity-70')}
              style={{ left: pct(sp.start), width: `max(3px, calc(${pct(sp.end)} - ${pct(sp.start)}))` }}
            />
          ))
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-2xs text-ink-3">
        <span>0:00</span>
        <span>{formatTime(span / 2)}</span>
        <span>{formatTime(span)}</span>
      </div>
    </div>
  );
}

function SectionRow({ section, onSeek }) {
  const [open, setOpen] = useState(false);
  const found = section.found;
  const hitBlocks = section.blocks.filter((b) => b.found);
  const shown = section.spans.slice(0, 4);

  return (
    <li className={cx('rounded-lg border bg-surface', found ? 'border-line' : 'border-line/60')}>
      {/* The row toggles open; the timestamps beside it are their own buttons, so they cannot live inside it. */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          type="button"
          disabled={!found}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
        >
          <ChevronRight size={14} className={cx('mt-1 shrink-0 text-ink-3 transition-transform', open && 'rotate-90', !found && 'opacity-0')} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-3">{section.kicker || `Section ${section.order + 1}`}</p>
            <p className={cx('truncate text-[14px]', found ? 'text-ink' : 'text-ink-3')}>{section.headline}</p>
          </div>
        </button>
        <div className="flex max-w-[55%] flex-wrap items-center justify-end gap-1">
          {found ? (
            <>
              {shown.map((sp) => (
                <TimeChip key={sp.start} start={sp.start} end={sp.end} onSeek={onSeek} strong={sp === section.primary} />
              ))}
              {section.spans.length > shown.length && <span className="font-mono text-2xs text-ink-3">+{section.spans.length - shown.length}</span>}
            </>
          ) : (
            <span className="text-xs text-ink-3">Not spoken in this video</span>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line px-3 pb-3 pt-2.5">
          {hitBlocks.map((b) => (
            <div key={b.id}>
              <p className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-3">
                {b.type} <span className="text-ink-3/70">{b.id}</span> - {Math.round(b.coverage * 100)}% of its words spoken
              </p>
              <ul className="mt-1.5 space-y-1">
                {b.parts.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-ink-2">{p.text}</span>
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {p.hits.slice(0, 3).map((h) => (
                        <TimeChip key={h.start} start={h.start} end={h.end} onSeek={onSeek} />
                      ))}
                      {p.hits.length > 3 && <span className="font-mono text-2xs text-ink-3">+{p.hits.length - 3}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export default function BoardTally({ tally, duration, onSeek }) {
  const gaps = useMemo(() => tally.uncovered.reduce((n, u) => n + (u.end - u.start), 0), [tally]);
  const { sectionsFound, sectionsTotal, partsMatched, partsTotal } = tally.stats;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Board tally</h2>
        <p className="text-xs text-ink-3">
          {sectionsFound} of {sectionsTotal} sections and {partsMatched} of {partsTotal} board items found in the video
          {gaps > 0 && ` - ${formatTime(gaps)} of talking with nothing on the board`}
        </p>
      </div>
      <Strip tally={tally} duration={duration} onSeek={onSeek} />
      <ul className="mt-4 space-y-2">
        {tally.sections.map((s) => (
          <SectionRow key={s.id} section={s} onSeek={onSeek} />
        ))}
      </ul>
    </section>
  );
}
