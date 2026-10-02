import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '../../ui/primitives.jsx';

const MIN = 40;
const MAX = 120000;

/**
 * The brief box. Paste the story of the video — chapters, flows, the lines you
 * want on screen. Anything in it about tools, toolbars or file formats is
 * ignored by the outline pass, so a brief written for a different tool still works.
 */
export default function NewBoardForm({ ready, busy, onGenerate }) {
  const [brief, setBrief] = useState('');
  const length = brief.trim().length;
  const tooShort = length < MIN;
  const tooLong = brief.length > MAX;

  return (
    <form
      className="mt-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!tooShort && !tooLong && ready && !busy) onGenerate(brief);
      }}
    >
      <label htmlFor="brief" className="text-[13px] font-medium text-ink">Your video, in your own words</label>
      <textarea
        id="brief"
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        disabled={busy}
        rows={10}
        placeholder={'Paste the outline of your video: the chapters, the flows you want to show (A ↓ B ↓ C), the lines you will say on screen, and how the story should build.'}
        className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-3 text-[14px] leading-relaxed text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="lg" disabled={!ready || busy || tooShort || tooLong}>
          <Sparkles size={15} />
          Generate board
        </Button>
        <span className={`font-mono text-2xs ${tooLong ? 'text-danger' : 'text-ink-3'}`}>
          {length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')}
        </span>
        {!ready && (
          <span className="text-xs text-ink-3">Generating needs a DeepSeek key on the server. The example board works without one.</span>
        )}
        {ready && tooShort && length > 0 && <span className="text-xs text-ink-3">Write at least {MIN} characters.</span>}
      </div>
    </form>
  );
}
