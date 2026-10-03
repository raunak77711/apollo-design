import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, Download, Film, RefreshCw, Sparkles, Subtitles, X } from 'lucide-react';
import { contentApi } from '../../api/content.js';
import { cx } from '../../lib/cx.js';
import { formatBytes, formatTime } from '../../lib/time.js';
import { useToast } from '../../lib/toast.jsx';
import { Button, Spinner } from '../../ui/primitives.jsx';
import ShortPreview from './ShortPreview.jsx';

/**
 * Review one short: watch the finished edit (the same composition the renderer draws, playing live), change it,
 * then approve or reject it and render the real file. Nothing here publishes anywhere.
 */

const EVENT_LABEL = { emphasis: 'Emphasis', number: 'Number', statement: 'Statement', camera: 'Camera', board: 'Board visual', comparison: 'Comparison', annotation: 'Annotation' };
const describe = (e) => {
  if (e.type === 'camera') return e.action.replace('_', ' ');
  if (e.type === 'board') return `${e.blockId} - ${e.animation}`;
  if (e.type === 'comparison') return `${e.left} vs ${e.right}`;
  if (e.type === 'number') return e.value;
  return e.text;
};

export default function ReviewDrawer({ session, candidate, onClose, onChanged }) {
  const toast = useToast();
  const player = useRef(null);
  const [props, setProps] = useState(null);
  const [error, setError] = useState('');
  const [zones, setZones] = useState(false);
  const [busy, setBusy] = useState('');
  const [paste, setPaste] = useState('');
  const [showHandoff, setShowHandoff] = useState(false);
  const [title, setTitle] = useState(candidate.title);

  const c = candidate;
  const id = session.id;
  const render = c.render;
  const rendering = render?.status === 'queued' || render?.status === 'rendering';

  // Everything that changes what the viewer sees changes this key, and the preview reloads.
  const key = JSON.stringify([c.director?.generatedAt, c.sourceStart, c.sourceEnd, c.edits, session.settings, session.media?.proxy?.status, session.media?.framing?.status, session.board?.hash]);
  useEffect(() => {
    let cancelled = false;
    setError('');
    contentApi.props(id, c.id).then((p) => !cancelled && setProps(p)).catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [id, c.id, key]);
  useEffect(() => setTitle(c.title), [c.title]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = useCallback(async (name, fn, success) => {
    setBusy(name);
    try {
      const out = await fn();
      onChanged(await contentApi.get(id)); // whatever changed, show the session as the server now has it
      if (success) toast.success?.(success);
      return out;
    } catch (e) {
      toast.error('That did not work', e.message);
      return null;
    } finally {
      setBusy('');
    }
  }, [onChanged, toast, id]);

  const review = (status) => act('review', () => contentApi.review(id, c.id, { status }));
  const saveTitle = () => title.trim() && title.trim() !== c.title && act('title', () => contentApi.review(id, c.id, { title }));
  const trim = (side, delta) => act('trim', () => contentApi.trim(id, c.id, side === 'start' ? { start: c.sourceStart + delta } : { end: c.sourceEnd + delta }));
  const direct = (ai) => act('direct', async () => { await contentApi.regenerate(id, c.id, ai); return contentApi.get(id); }, ai ? 'DeepSeek directed the edit' : 'Rule-based edit applied');
  const toggleEvent = (eventId) => {
    const events = c.director.events.map((e) => (e.id === eventId ? { ...e, disabled: !e.disabled } : e));
    return act('events', async () => { await contentApi.setDirector(id, c.id, { events, source: 'manual' }); return contentApi.get(id); });
  };
  const toggleCaptions = () => act('captions', () => contentApi.review(id, c.id, { captions: c.edits?.captions === false ? true : false }));
  const startRender = () => act('render', () => contentApi.render(id, c.id));
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(await contentApi.promptText(id, c.id));
      toast.success?.('Prompt copied. Paste it into Claude or ChatGPT.');
    } catch (e) {
      toast.error("Couldn't copy the prompt", e.message);
    }
  };
  const applyPasted = () => {
    let parsed;
    try {
      const text = paste.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
      parsed = JSON.parse(text);
    } catch {
      return toast.error("That isn't valid JSON", 'Paste exactly what Claude or ChatGPT returned: { "events": [ ... ] }');
    }
    return act('import', async () => { const t = await contentApi.setDirector(id, c.id, { events: parsed, source: 'external' }); setPaste(''); setShowHandoff(false); if (t.issues?.length) toast.error?.(`${t.issues.length} event(s) could not be used`, t.issues.slice(0, 2).join(' ')); return contentApi.get(id); }, 'Edit imported');
  };

  const events = c.director?.events || [];
  const dir = c.director;
  const clipSeconds = props ? Math.round(props.duration) : Math.round(c.keptDuration);
  const files = useMemo(() => (render?.status === 'done' ? { mp4: `/storage/content/sessions/${id}/${render.file}`, srt: `/storage/content/sessions/${id}/${render.caption}` } : null), [render, id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-[980px] flex-col overflow-hidden border-l border-line bg-void shadow-pop">
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <p className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Review short</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Short title" className="mt-0.5 w-full bg-transparent font-display text-xl outline-none" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-ink-2 hover:bg-raised hover:text-ink"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[320px_minmax(0,1fr)]">
          {/* ---------------------------- the edited short ---------------------------- */}
          <div>
            {props ? <ShortPreview ref={player} props={props} showSafeZones={zones} /> : error ? <p className="text-sm text-danger">{error}</p> : <div className="flex aspect-[9/16] items-center justify-center rounded-xl border border-line"><Spinner /></div>}
            <div className="mt-3 flex items-center justify-between text-xs text-ink-3">
              <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> Show app safe zones</label>
              <span className="font-mono">{clipSeconds}s - 1080x1920</span>
            </div>
            {props?.warnings?.map((w) => <p key={w} className="mt-2 text-xs text-ink-2">{w}</p>)}
            {session.media?.proxy?.status !== 'complete' && <p className="mt-2 text-xs text-ink-3">The preview plays your original video until the lighter preview copy is ready{session.media?.proxy?.status === 'processing' ? ` (${Math.round((session.media.proxy.progress || 0) * 100)}%)` : ''}. It may stutter; the rendered file will not.</p>}

            {/* ------------------------------ render ------------------------------ */}
            <div className="mt-4 rounded-xl border border-line bg-surface p-3">
              <p className="flex items-center gap-2 text-[13px] text-ink"><Film size={13} /> Final video</p>
              <p className="mt-0.5 text-xs text-ink-3">Burned-in subtitles, emphasis, zooms and board visuals. MP4 for TikTok, Shorts and Reels.</p>
              {rendering && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${Math.round((render.progress || 0) * 100)}%` }} /></div><p className="mt-1.5 flex justify-between text-xs text-ink-3"><span>{render.stage}</span><button type="button" className="hover:text-ink" onClick={() => contentApi.cancelRender(id, c.id).then(() => contentApi.get(id)).then(onChanged)}>Cancel</button></p></div>}
              {render?.status === 'failed' && <p className="mt-2 text-xs text-danger">{render.error}</p>}
              {files && (
                <div className="mt-3 space-y-2">
                  <video src={files.mp4} controls preload="metadata" className="aspect-[9/16] w-full rounded-lg bg-black" />
                  <div className="flex flex-wrap gap-2">
                    <a href={files.mp4} download className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-surface px-3 text-[13px] text-ink hover:border-line-strong"><Download size={13} /> Download MP4 ({formatBytes(render.bytes)})</a>
                    <a href={files.srt} download className="inline-flex h-8 items-center gap-1.5 rounded border border-line px-3 text-[13px] text-ink-2 hover:text-ink"><Subtitles size={13} /> .srt</a>
                  </div>
                  {render.cached && <p className="text-xs text-ink-3">Nothing changed since the last render, so it was reused.</p>}
                </div>
              )}
              <div className="mt-3">
                <Button variant="primary" onClick={startRender} disabled={rendering || busy === 'render'}>
                  {rendering ? <Spinner size={13} /> : <Film size={14} />}
                  {rendering ? 'Rendering...' : files ? 'Render again' : 'Render video'}
                </Button>
              </div>
            </div>
          </div>

          {/* ------------------------------- the controls ------------------------------ */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={c.status === 'approved' ? 'accent' : 'secondary'} onClick={() => review(c.status === 'approved' ? 'pending' : 'approved')} disabled={busy === 'review'}><Check size={14} /> {c.status === 'approved' ? 'Approved' : 'Approve'}</Button>
              <Button variant={c.status === 'rejected' ? 'danger' : 'ghost'} onClick={() => review(c.status === 'rejected' ? 'pending' : 'rejected')} disabled={busy === 'review'}><X size={14} /> {c.status === 'rejected' ? 'Rejected' : 'Reject'}</Button>
              <span className="text-xs text-ink-3">Approved shorts are the ones "Render all approved" makes.</span>
            </div>

            <section>
              <h3 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">The edit {dir && <span className="normal-case tracking-normal text-ink-3">- by {dir.source === 'deepseek' ? 'DeepSeek' : dir.source === 'baseline' ? 'rules' : dir.source === 'external' ? 'another AI' : 'you'}{dir.fellBack ? ' (AI unavailable)' : ''}</span>}</h3>
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-surface">
                {events.length === 0 && <li className="px-3 py-3 text-sm text-ink-3">Plain talking head with captions. Press "Direct with DeepSeek" for visuals.</li>}
                {events.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                    <button type="button" onClick={() => player.current?.seekTo(Math.round(e.at * props.fps))} className="w-12 shrink-0 text-left font-mono text-2xs text-ink-3 hover:text-ink">{formatTime(e.at)}</button>
                    <span className="w-24 shrink-0 font-mono text-2xs uppercase tracking-[0.1em] text-ink-3">{EVENT_LABEL[e.type]}</span>
                    <span className={cx('min-w-0 flex-1 truncate text-[13px]', e.disabled ? 'text-ink-3 line-through' : 'text-ink')}>{describe(e)}</span>
                    <button type="button" onClick={() => toggleEvent(e.id)} className="shrink-0 text-xs text-ink-3 hover:text-ink">{e.disabled ? 'Turn on' : 'Turn off'}</button>
                  </li>
                ))}
              </ul>
              {dir?.issues?.length > 0 && <p className="mt-1.5 text-xs text-ink-3">{dir.issues.length} suggestion{dir.issues.length > 1 ? 's' : ''} could not be used: {dir.issues[0]}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => direct(true)} disabled={!!busy}>{busy === 'direct' ? <Spinner size={12} /> : <Sparkles size={13} />} Direct with DeepSeek</Button>
                <Button size="sm" variant="ghost" onClick={() => direct(false)} disabled={!!busy}><RefreshCw size={13} /> Rule-based edit</Button>
                <Button size="sm" variant="ghost" onClick={toggleCaptions} disabled={!!busy}><Subtitles size={13} /> Captions {c.edits?.captions === false ? 'off' : 'on'}</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowHandoff((s) => !s)}><ClipboardCopy size={13} /> Edit with Claude / ChatGPT</Button>
              </div>
              {showHandoff && (
                <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-2">
                  <p>1. Copy the prompt and paste it into Claude or ChatGPT. It carries your transcript, the board blocks and the current edit. 2. Paste its JSON answer here. Apollo checks every event against what you actually said before using it.</p>
                  <div className="mt-2 flex gap-2"><Button size="sm" variant="secondary" onClick={copyPrompt}><ClipboardCopy size={12} /> Copy prompt</Button><a className="inline-flex h-7 items-center rounded px-2.5 text-xs text-ink-2 hover:text-ink" href={`/api/content/sessions/${id}/candidates/${c.id}/package`} target="_blank" rel="noreferrer">Open as JSON</a></div>
                  <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder='{ "events": [ ... ] }' className="mt-2 w-full rounded border border-line bg-void p-2 font-mono text-xs text-ink outline-none focus:border-line-strong" />
                  <Button size="sm" variant="primary" className="mt-2" onClick={applyPasted} disabled={!paste.trim() || !!busy}>Use this edit</Button>
                </div>
              )}
            </section>

            <section>
              <h3 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Trim</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {[['start', 'Start', c.sourceStart], ['end', 'End', c.sourceEnd]].map(([side, label, at]) => (
                  <div key={side} className="rounded-lg border border-line bg-surface p-2.5">
                    <p className="flex items-baseline justify-between text-xs text-ink-3"><span>{label}</span><span className="font-mono text-ink-2">{formatTime(at)}</span></p>
                    <div className="mt-1.5 flex gap-1.5">
                      {[-2, -0.5, 0.5, 2].map((d) => <button key={d} type="button" disabled={!!busy} onClick={() => trim(side, d)} className="flex-1 rounded border border-line py-1 font-mono text-2xs text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40">{d > 0 ? '+' : ''}{d}s</button>)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-3">Edges snap to the nearest word, and the edit moves with them.</p>
            </section>

            <section>
              <h3 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Why this short</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{c.reason}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink">"{c.hook}"</p>
              {c.discarded?.length > 0 && <p className="mt-2 text-xs text-ink-3">{c.discarded.length} take{c.discarded.length > 1 ? 's' : ''} removed (stutters, restarts, asides). Open the card to see exactly what.</p>}
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
