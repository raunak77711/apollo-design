import { ArrowUpRight } from 'lucide-react';
import { ApolloMark } from '../../ui/brand.jsx';

/**
 * What Apollo AI looks like before you have said anything.
 *
 * The screen has one job: make it obvious you can ask this anything. So the
 * copy is three lines, and everything under it is a real question you could
 * press — six of them, in a hairline list rather than a wall of cards, because
 * a card grid reads as a menu of features and this is meant to read as an
 * invitation.
 */

const SUGGESTIONS = [
  { kind: 'Learn', prompt: "Explain JavaScript promises like I'm a beginner" },
  { kind: 'Code', prompt: 'Help me understand this React component' },
  { kind: 'Solve', prompt: 'Help me debug this error' },
  { kind: 'Create', prompt: 'Give me three ideas for a modern restaurant poster' },
  { kind: 'Ask', prompt: 'What is Nepal?' },
  { kind: 'Write', prompt: 'Help me write a short, polite follow-up email' },
];

export default function HomeState({ onPick, offline }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col px-4 py-10 sm:px-0 sm:py-16">
      {/* `my-auto` on the child rather than `justify-center` on the parent: a
          centred flex child that outgrows its container overflows past the top
          of the scroll area, where it can never be scrolled back to. Auto
          margins collapse to zero instead, so a short phone simply scrolls. */}
      <div className="my-auto w-full">
        <header className="animate-rise">
          <ApolloMark size={30} className="text-ink" sparkClassName="fill-accent" />

          <h1 className="mt-5 font-display text-[30px] font-semibold tracking-[-0.035em] text-ink sm:text-[38px]">
            Apollo AI
          </h1>
          <p className="mt-1.5 text-[17px] leading-snug text-ink-2 sm:text-[19px]">
            Your creative and intelligent assistant.
          </p>
          <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-3">
            Ask about anything — code, ideas, research, writing, design, or the world. Apollo AI
            explains, drafts, debugs and thinks things through with you.
          </p>
        </header>

        {offline && (
          <p className="mt-6 animate-fade-in rounded-lg border border-line bg-raised px-3 py-2.5 text-[13px] leading-relaxed text-ink-3">
            Apollo AI isn&apos;t connected to a language model on this server yet. The workspace
            works — answers won&apos;t.
          </p>
        )}

        <section className="mt-9 animate-rise sm:mt-11" style={{ animationDelay: '60ms' }}>
          <h2 className="label">Try asking</h2>
          <ul className="mt-3 grid grid-cols-1 gap-x-8 border-t border-line sm:grid-cols-2">
            {SUGGESTIONS.map(({ kind, prompt }) => (
              <li key={prompt} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => onPick(prompt)}
                  className="group flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="w-[3.75rem] shrink-0 font-mono text-2xs uppercase tracking-[0.14em] text-ink-3 transition-colors duration-150 group-hover:text-accent-text">
                    {kind}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink-2 transition-colors duration-150 group-hover:text-ink">
                    {prompt}
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 -translate-x-1 text-ink-3 opacity-0 transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
