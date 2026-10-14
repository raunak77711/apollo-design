import { useState } from 'react';
import { groupCaptions } from '../../video/captions.js';
import { cx } from '../../lib/cx.js';

/**
 * The burned-in captions, grouped the same way the renderer groups them, with each word editable in place.
 * Fixing a misheard word keeps its timing exactly as transcribed - only the text changes - and the fix
 * applies to this short only (the shared transcript other shorts read from is never touched).
 */
export default function CaptionEditor({ words, onCommit, disabled }) {
  const [editing, setEditing] = useState(null); // the word's stable transcript index, or null
  const [value, setValue] = useState('');

  if (!words?.length) return <p className="text-xs text-ink-3">No captions yet.</p>;
  const cues = groupCaptions(words);

  const start = (w) => { setEditing(w.wordIndex); setValue(w.word); };
  const commit = async (w) => {
    setEditing(null);
    const original = w.originalWord ?? w.word;
    const typed = value.replace(/\s+/g, ' ').trim();
    if (typed === w.word) return; // unchanged
    await onCommit(w.wordIndex, typed === original ? '' : typed); // '' clears back to the original
  };

  return (
    <div className="space-y-1 rounded-lg border border-line bg-surface p-3 text-[13px] leading-loose">
      {cues.map((cue, i) => (
        <p key={i} className="flex flex-wrap items-baseline gap-x-1">
          {cue.words.map((w) => (editing === w.wordIndex ? (
            <input
              key={w.wordIndex}
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => commit(w)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { setEditing(null); }
              }}
              style={{ width: `${Math.max(2, value.length + 1)}ch` }}
              className="rounded border border-line-strong bg-void px-1 text-ink outline-none"
            />
          ) : (
            <button
              key={w.wordIndex}
              type="button"
              disabled={disabled}
              onClick={() => start(w)}
              title={w.originalWord ? `You corrected this from "${w.originalWord}". Click to edit, or retype the original to revert.` : 'Click to fix this word'}
              className={cx('rounded px-0.5 hover:bg-raised', w.originalWord ? 'text-accent-text underline decoration-dotted decoration-1' : 'text-ink')}
            >
              {w.text}
            </button>
          )))}
        </p>
      ))}
    </div>
  );
}
