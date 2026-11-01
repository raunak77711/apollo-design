import { useState } from 'react';
import { Check, Hand, Sparkles, TriangleAlert } from 'lucide-react';
import { contentApi } from '../../api/content.js';
import { cx } from '../../lib/cx.js';
import { useToast } from '../../lib/toast.jsx';
import { Button, Spinner } from '../../ui/primitives.jsx';
import { PLATFORMS } from '../../video/platforms.js';

/**
 * How shorts from this recording are edited and framed.
 *
 *   AI director   DeepSeek decides what appears when (emphasis, numbers, board visuals, camera moves). Off, a
 *                 rule-based director does it with no model and no cost. Either way every edit can be changed by hand.
 *   Window        the shape cut out of the horizontal frame. Wide on purpose: hand movement stays in view.
 */

const WINDOWS = [
  ['1:1', 'Tight', 'Square. Face and shoulders; hands near the face only.'],
  ['4:5', 'Portrait', 'Narrow. Mostly the face.'],
  ['4:3', 'Wide', 'Recommended. Three quarters of the frame: face and hands.'],
  ['3:2', 'Wider', 'Most of the frame, a little cropped.'],
  ['16:9', 'Full', 'The whole frame, nothing cropped.'],
];

function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40', checked ? 'border-ink bg-ink' : 'border-line-strong bg-raised')}
    >
      <span className={cx('absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all', checked ? 'left-[22px] bg-void' : 'left-0.5 bg-ink-3')} />
    </button>
  );
}

function Row({ title, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function EditingSettings({ session, onChanged, aiReady }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = session.settings;
  const media = session.media;
  const hasShorts = (session.candidates || []).length > 0;

  const save = async (patch) => {
    try {
      onChanged(await contentApi.settings(session.id, patch));
    } catch (e) {
      toast.error("Couldn't save that setting", e.message);
    }
  };

  const toggleAi = async (on) => {
    await save({ aiDirector: on });
    if (hasShorts && window.confirm(`${on ? 'Let DeepSeek direct' : 'Use the rule-based director for'} the shorts you already have?\n\nEdits you made by hand are never replaced.`)) {
      setBusy(true);
      try {
        const r = await contentApi.regenerateAll(session.id, on);
        onChanged(r.session);
        toast.success?.(`${r.regenerated} short${r.regenerated === 1 ? '' : 's'} re-directed`);
      } catch (e) {
        toast.error("Couldn't re-direct the shorts", e.message);
      } finally {
        setBusy(false);
      }
    }
  };

  const retryMedia = async () => {
    try {
      onChanged(await contentApi.prepareMedia(session.id));
    } catch (e) {
      toast.error("Couldn't prepare the video", e.message);
    }
  };

  const head = media.framing?.head;
  const mediaLine = (() => {
    const f = media.framing?.status;
    const p = media.proxy?.status;
    if (!session.source) return 'Upload a video first.';
    if (f === 'failed' || p === 'failed') return media.framing?.error || media.proxy?.error;
    const parts = [];
    parts.push(f === 'complete' ? (head ? `Head found at ${Math.round((head.x + head.w / 2) * 100)}% across (${media.framing.keyframes.filter((k) => k.face).length} of ${media.framing.keyframes.length} frames checked)` : 'No face found: the window is centred') : f === 'processing' ? 'Finding your head position...' : 'Head position: not checked yet');
    parts.push(p === 'complete' ? 'Preview copy ready' : p === 'processing' ? `Preview copy ${Math.round((media.proxy.progress || 0) * 100)}%` : 'Preview copy: not built yet');
    return parts.join(' - ');
  })();
  const mediaFailed = media.framing?.status === 'failed' || media.proxy?.status === 'failed';

  return (
    <section>
      <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Editing</h2>
      <div className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface px-4">
        <Row
          title={
            <span className="flex items-center gap-2">
              <Sparkles size={13} /> AI director (DeepSeek)
            </span>
          }
          hint={s.aiDirector ? 'DeepSeek decides what appears when: emphasis, numbers, board visuals and camera moves. A few cents per recording.' : 'A rule-based director sets the edit: free and instant, and a fine starting point to adjust by hand.'}
        >
          <div className="flex items-center gap-2">
            {busy && <Spinner size={13} />}
            <Switch checked={s.aiDirector} onChange={toggleAi} disabled={busy} label="AI director" />
          </div>
        </Row>
        {s.aiDirector && !aiReady && (
          <p className="flex items-start gap-2 py-3 text-xs leading-relaxed text-ink-2">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" /> No DeepSeek key is set, so edits use the rule-based director until one is added (DEEPSEEK_API_KEY).
          </p>
        )}

        <div className="py-3">
          <p className="flex items-center gap-2 text-[13px] text-ink">
            <Hand size={13} /> Window cut from your video
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">A horizontal video becomes vertical by cutting a window out of it. Wide enough keeps your hand movement in view.</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {WINDOWS.map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                title={hint}
                onClick={() => save({ framing: { aspect: id } })}
                className={cx('rounded-md border px-2.5 py-1.5 text-xs transition-colors', s.framing.aspect === id ? 'border-ink bg-ink text-void' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')}
              >
                {label} <span className="font-mono text-2xs opacity-70">{id}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">{WINDOWS.find(([id]) => id === s.framing.aspect)?.[2]} When a board visual is up, the speaker steps down to the full frame.</p>
        </div>

        <Row title="Platform safe zones" hint="Keeps captions and visuals clear of each app's own buttons. One render works everywhere.">
          <select value={s.platform} onChange={(e) => save({ platform: e.target.value })} className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-line-strong">
            {Object.entries(PLATFORMS).map(([id, p]) => (
              <option key={id} value={id}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>

        <Row title="Captions" hint="Short phrases timed to your words. Off, the shorts have no captions.">
          <div className="flex items-center gap-3">
            {s.captions.enabled && (
              <label className="flex items-center gap-1.5 text-xs text-ink-3">
                words
                <select value={s.captions.maxWords} onChange={(e) => save({ captions: { maxWords: Number(e.target.value) } })} className="h-7 rounded border border-line bg-surface px-1 text-xs text-ink outline-none">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
            <Switch checked={s.captions.enabled} onChange={(on) => save({ captions: { enabled: on } })} label="Captions" />
          </div>
        </Row>

        <Row title="Background" hint="What fills the screen around the speaker.">
          <div className="flex gap-1.5">
            {[['blur', 'Blurred video'], ['solid', 'Solid']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => save({ background: id })} className={cx('rounded-md border px-2.5 py-1.5 text-xs', s.background === id ? 'border-ink bg-ink text-void' : 'border-line text-ink-2 hover:text-ink')}>
                {label}
              </button>
            ))}
          </div>
        </Row>

        <div className="flex items-start justify-between gap-4 py-3">
          <p className={cx('flex items-start gap-2 text-xs leading-relaxed', mediaFailed ? 'text-danger' : 'text-ink-3')}>
            {!mediaFailed && media.framing?.status === 'complete' && media.proxy?.status === 'complete' && <Check size={13} className="mt-0.5 shrink-0 text-accent-text" />}
            {mediaLine}
          </p>
          {(mediaFailed || (session.source && media.framing?.status === 'not_started')) && (
            <Button size="sm" variant="secondary" onClick={retryMedia}>
              Prepare video
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
