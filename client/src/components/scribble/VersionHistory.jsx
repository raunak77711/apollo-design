import { Check, History, PencilLine, RotateCcw, Sparkles } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { relativeTime } from '../../lib/format.js';
import { Button, EmptyState, Spinner } from '../../ui/primitives.jsx';
import DesignPreview from '../DesignPreview.jsx';

/**
 * Version history.
 *
 * Newest first, because that is what someone is looking for after pressing
 * Generate twice. Each entry shows what it actually is — the sketch for a
 * sketch, the real document for a design — rather than a label and a date,
 * since the whole reason to keep versions is to be able to *see* which one was
 * the good one.
 */

const KIND = {
  scribble: { icon: PencilLine, label: 'Sketch' },
  generated: { icon: Sparkles, label: 'Apollo' },
  edit: { icon: History, label: 'Edit' },
};

export default function VersionHistory({
  versions,
  activeId,
  loading = false,
  busyId = null,
  onOpen,
  onRestore,
  className,
}) {
  if (loading) {
    return (
      <div className={cx('flex items-center justify-center py-10 text-ink-3', className)}>
        <Spinner />
      </div>
    );
  }

  if (!versions.length) {
    return (
      <div className={className}>
        <EmptyState
          icon={History}
          title="No versions yet"
          body="Save your sketch, or generate a design — every step is kept here so nothing is ever lost."
        />
      </div>
    );
  }

  // Newest first. The server keeps them in the order they happened, which is
  // the right storage order and the wrong reading order.
  const ordered = [...versions].reverse();

  return (
    <ul className={cx('space-y-2', className)}>
      {ordered.map((version) => {
        const meta = KIND[version.kind] || KIND.edit;
        const Icon = meta.icon;
        const active = version.id === activeId;
        const busy = version.id === busyId;

        return (
          <li key={version.id}>
            <div
              className={cx(
                'group relative overflow-hidden rounded-lg border bg-surface transition-all duration-200 ease-out',
                active ? 'border-accent' : 'border-line hover:border-line-strong'
              )}
            >
              <button
                type="button"
                onClick={() => onOpen?.(version)}
                className="flex w-full items-stretch gap-3 p-2 text-left"
                aria-current={active || undefined}
              >
                {/* The thumbnail. A design renders through the same renderer
                    the editor uses, so a version card can never go stale. */}
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-workspace">
                  {version.kind === 'scribble' && version.scribble ? (
                    <img
                      src={version.scribble}
                      alt=""
                      className="h-full w-full bg-[#FCFBF8] object-contain"
                      loading="lazy"
                    />
                  ) : version.preview ? (
                    <DesignPreview document={version.preview} className="w-full" />
                  ) : (
                    <Icon size={14} className="text-ink-3" />
                  )}
                </span>

                <span className="flex min-w-0 flex-1 flex-col justify-center">
                  <span className="flex items-center gap-1.5">
                    <span className="num text-2xs text-ink-3">v{version.index}</span>
                    <span className="truncate text-[13px] font-medium text-ink">{version.label}</span>
                    {active && <Check size={12} className="shrink-0 text-accent" />}
                  </span>
                  <span className="num mt-0.5 text-2xs text-ink-3">
                    {relativeTime(version.createdAt)}
                    {version.elementCount > 0 && ` · ${version.elementCount} layers`}
                  </span>
                  {version.prompt && (
                    <span className="mt-1 truncate text-2xs italic text-ink-3">“{version.prompt}”</span>
                  )}
                </span>
              </button>

              {/* Restore stays out of the way until the row is reached for.
                  It is not destructive — the current work is snapshotted
                  first — but it still changes what is on screen. */}
              {version.preview && !active && (
                <div className="flex justify-end border-t border-line px-2 py-1.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRestore?.(version)}
                    disabled={busy}
                    aria-label={`Restore version ${version.index}`}
                  >
                    {busy ? <Spinner size={12} /> : <RotateCcw size={12} />}
                    Restore
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
