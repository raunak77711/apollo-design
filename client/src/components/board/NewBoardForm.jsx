import { useState } from 'react';
import { ChevronRight, Sparkles, TriangleAlert } from 'lucide-react';
import { distributionApi } from '../../api/distribution.js';
import { useToast } from '../../lib/toast.jsx';
import { Button, Spinner } from '../../ui/primitives.jsx';

const MIN = 40;
const MAX = 120000;

/**
 * A draft brief from a topic, before there is anything to paste in. DeepSeek has no web
 * access here — this is reasoning from what the model already knew at training time, not a
 * research pass — so every draft is labelled unverified and carries the server's own caveat
 * verbatim, never softened client-side.
 */
function ResearchDraft({ onDrafted }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const draft = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const brief = await distributionApi.draftBrief(topic.trim(), notes.trim());
      const text = [
        `${brief.title}`, '', `Audience: ${brief.audience}`, `Angle: ${brief.angle}`, '',
        ...brief.outline.map((b, i) => `${i + 1}. ${b}`),
      ].join('\n');
      onDrafted(text);
      toast.success('Draft brief written in below', 'Unverified — check every fact before you record it.');
      setOpen(false);
    } catch (e) {
      toast.error("Couldn't draft a brief", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-ink-2 hover:text-ink">
        <ChevronRight size={13} className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
        Not sure where to start? Draft a brief from a topic
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-line px-3.5 py-3">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. why local service businesses lose leads" className="w-full rounded-md border border-line bg-void px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-line-strong" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes — anything you already know you want covered" className="w-full rounded-md border border-line bg-void px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-line-strong" />
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="secondary" onClick={draft} disabled={busy || !topic.trim()}>
              {busy ? <Spinner size={13} /> : <Sparkles size={13} />}
              Draft brief
            </Button>
            <span className="flex items-center gap-1.5 text-2xs text-ink-3">
              <TriangleAlert size={11} /> No web access — unverified, from the model's own knowledge only
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

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
      <ResearchDraft onDrafted={setBrief} />
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
