import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import Composer from './Composer.jsx';
import MoonStage from './MoonStage.jsx';

/**
 * The homepage's opening: the moon, and the one thing to do here.
 *
 * The composition is asymmetric on purpose. The moon holds the right of the
 * frame and the type holds a column on the left, so the headline never crosses
 * the lit face and the moon never has to be dimmed to keep the words readable.
 * The composer runs into the moon's lower limb and, being an opaque plane with
 * its own shadow, reads as sitting in front of it — which is the difference
 * between a render the interface is standing in and a picture behind it.
 */

/**
 * What Apollo does after you press Generate: its real pipeline, in the order it
 * runs, under the names the generation screen uses while it runs them (see
 * `components/generation/stages.js`). Five nouns rather than five promises.
 */
const PIPELINE = ['direction', 'photography', 'composition', 'critique', 'editable layers'];

export default function Hero({ onCreate, creating }) {
  // Whether there is a brief in progress. The moon leans in and lifts its key
  // light while there is — the page's one piece of feedback that Apollo is
  // paying attention before it has been asked for anything.
  const [working, setWorking] = useState(false);

  return (
    <section className="relative isolate">
      <MoonStage focus={working ? 1 : 0} />

      <div className="relative mx-auto flex min-h-[min(94svh,56rem)] w-full max-w-[1180px] flex-col px-5 pb-10 pt-24 sm:px-8 sm:pt-28">
        <div className="flex flex-1 flex-col justify-center">
          <p className="sky-label animate-lift">AI creates — you control</p>

          <h1
            className="animate-lift mt-5 max-w-[15ch] font-display text-[clamp(2.6rem,7.2vw,5.25rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-[var(--sky-ink)]"
            style={{ animationDelay: '90ms' }}
          >
            Describe it.
            <br />
            Apollo draws it.
          </h1>

          <p
            className="animate-lift mt-6 max-w-[42ch] text-[15px] leading-relaxed text-[var(--sky-ink-2)] sm:text-base"
            style={{ animationDelay: '180ms' }}
          >
            Every layer stays editable — type, images, shapes, colour. Nothing is baked into a picture.
          </p>

          <div className="animate-lift" style={{ animationDelay: '270ms' }}>
            <Composer onCreate={onCreate} creating={creating} onFocusChange={setWorking} />
          </div>
        </div>

        <Horizon />
      </div>
    </section>
  );
}

/**
 * The horizon: the hero's bottom edge, and a straight answer to the question
 * the composer raises — what actually happens when you press the button. A
 * sequence is the one thing that earns being numbered or arrowed, because the
 * order is information the reader needs.
 */
function Horizon() {
  return (
    <div
      className="animate-lift mt-16 border-t pt-4"
      style={{ borderColor: 'var(--sky-line-soft)', animationDelay: '380ms' }}
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-baseline sm:gap-6">
        <p className="sky-label shrink-0">When you press Generate</p>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {PIPELINE.map((step, i) => (
            <li key={step} className="flex items-center gap-2 text-[13px] text-[var(--sky-ink-2)]">
              {i > 0 && <ChevronRight size={11} className="shrink-0 opacity-40" aria-hidden="true" />}
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
