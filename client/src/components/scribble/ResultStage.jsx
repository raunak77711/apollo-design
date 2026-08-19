import { useEffect, useState } from 'react';
import { Download, Layers, PencilLine, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { Button, Spinner, Tooltip } from '../../ui/primitives.jsx';
import { Spark } from '../../ui/brand.jsx';
import DesignPreview from '../DesignPreview.jsx';

/**
 * The finished design, and the proof that it came from the drawing.
 *
 * The one thing this screen has to do is make the leap legible: someone drew
 * four rough shapes and got back a poster, and they should be able to see
 * *why* it is that poster. So the sketch stays on screen next to the result,
 * and holding "Compare" ghosts it back over the design — where the moon was
 * drawn, the photograph's moon is; where the words were scrawled, the headline
 * sits. That is the moment the feature either lands or doesn't.
 */
export default function ResultStage({
  document: doc,
  scribble,
  message,
  saved,
  busy = null, // 'saving' | 'exporting' | 'generating' | null
  onRegenerate,
  onEdit,
  onSave,
  onExport,
  onBack,
}) {
  const [compare, setCompare] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // A beat before the design fades up, so the change of screen reads as a
  // curtain rising rather than a swap. Purely presentational; everything is
  // interactive immediately either way.
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 40);
    return () => clearTimeout(timer);
  }, [doc]);

  const portrait = doc?.canvas ? doc.canvas.height > doc.canvas.width : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------- stage ------------------------------ */}

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        <div
          className={cx(
            'relative max-h-full transition-all duration-500 ease-out',
            revealed ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
            portrait ? 'h-full' : 'w-full max-w-3xl'
          )}
          style={portrait ? { aspectRatio: `${doc.canvas.width} / ${doc.canvas.height}` } : undefined}
        >
          <DesignPreview
            document={doc}
            className="h-full w-full rounded-[3px] shadow-art"
          />

          {/* The sketch, ghosted back over its own result. */}
          {scribble && (
            <div
              aria-hidden={!compare}
              className={cx(
                'pointer-events-none absolute inset-0 rounded-[3px] transition-opacity duration-300 ease-out',
                compare ? 'opacity-100' : 'opacity-0'
              )}
            >
              <div className="absolute inset-0 rounded-[3px] bg-white/70" />
              <img src={scribble} alt="" className="absolute inset-0 h-full w-full object-fill" />
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------ what it is -------------------------- */}

      {message && (
        <div className="shrink-0 border-t border-line px-4 py-3 sm:px-8">
          <div className="mx-auto flex max-w-3xl items-start gap-2.5">
            <Spark size={13} className="mt-[3px] shrink-0 text-accent" />
            <p className="text-xs leading-relaxed text-ink-2">{message}</p>
          </div>
        </div>
      )}

      {/* ------------------------------- actions ---------------------------- */}

      <div className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          {/* Press and hold to lay the sketch back over its own result. It
              deliberately does nothing on release: this used to double as
              "back to sketch", which meant letting go of a comparison threw
              you off the screen you were comparing on. Going back is the
              Sketch button, where going back belongs. */}
          {scribble && (
            <button
              type="button"
              onPointerDown={() => setCompare(true)}
              onPointerUp={() => setCompare(false)}
              onPointerCancel={() => setCompare(false)}
              onPointerLeave={() => setCompare(false)}
              onFocus={() => setCompare(true)}
              onBlur={() => setCompare(false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setCompare(true);
              }}
              onKeyUp={() => setCompare(false)}
              aria-pressed={compare}
              className={cx(
                'group flex items-center gap-2 rounded-lg border bg-void py-1 pl-1 pr-2.5 transition-colors duration-150',
                compare ? 'border-accent' : 'border-line hover:border-line-strong'
              )}
              aria-label="Hold to compare your sketch with the design"
            >
              <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-[#FCFBF8]">
                <img src={scribble} alt="" className="h-full w-full object-contain" />
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-[11px] font-medium leading-tight text-ink">Your sketch</span>
                <span className="block text-2xs leading-tight text-ink-3">
                  {compare ? 'Release to hide' : 'Hold to compare'}
                </span>
              </span>
              <Layers size={13} className="text-ink-3" />
            </button>
          )}

          <div className="flex-1" />

          <Tooltip label="Draw again">
            <Button variant="ghost" onClick={onBack} aria-label="Back to sketch">
              <PencilLine size={14} />
              <span className="hidden sm:inline">Sketch</span>
            </Button>
          </Tooltip>

          <Button variant="secondary" onClick={onExport} disabled={busy === 'exporting'}>
            {busy === 'exporting' ? <Spinner size={13} /> : <Download size={14} />}
            <span className="hidden sm:inline">Export</span>
          </Button>

          <Button variant="secondary" onClick={onSave} disabled={saved || busy === 'saving'}>
            {busy === 'saving' ? <Spinner size={13} /> : <Save size={14} />}
            <span className="hidden sm:inline">{saved ? 'Saved' : 'Save version'}</span>
          </Button>

          <Button variant="secondary" onClick={onRegenerate} disabled={busy === 'generating'}>
            {busy === 'generating' ? <Spinner size={13} /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline">Try again</span>
          </Button>

          {/* Editing is the real destination: the design is ordinary editable
              layers, and the editor is where Apollo already does that well. */}
          <Button variant="primary" onClick={onEdit}>
            <SlidersHorizontal size={14} />
            Edit design
          </Button>
        </div>
      </div>
    </div>
  );
}
