import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Volume2, VolumeX, Play, Pause, Film, Captions, Layers } from 'lucide-react';
import '../pages/content-video-feed.css';

export default function ContentVideoFeed({ jobId, completed }) {
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const scroller = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    if (scroller.current) observer.observe(scroller.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (results.length >= completed || active < results.length - 3) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/combinator/jobs/${jobId}?offset=${results.length}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load videos.');
        if (!data.results?.length) throw new Error('No videos returned. Try again.');
        setResults(old => [...old, ...data.results]);
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [jobId, completed, results.length, active, retry]);

  function move(delta) {
    const index = Math.max(0, Math.min(results.length - 1, active + delta));
    const element = scroller.current;
    element?.scrollTo({ top: index * element.clientHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function keyDown(e) {
    if (e.target.tagName !== 'INPUT' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); }
  }

  return <div className="cm-feed cm-feed-inline" role="region" aria-label="Batch video feed" onKeyDown={keyDown}>
    <header className="cm-feed-header"><div className="cm-feed-brand"><span className="cm-feed-logo"><Layers size={19} /></span><div><span className="cm-feed-eyebrow">YOUR VIDEOS</span><h2>Scroll your batch<span>.</span></h2></div></div><div className="cm-feed-header-right"><span className="cm-feed-counter" aria-live="polite">{results.length ? `${String(active + 1).padStart(2, '0')} / ${String(completed).padStart(2, '0')}` : 'Loading…'}</span></div></header>
    <div className="cm-feed-context"><span>YOUR BATCH</span><strong>See it in the scroll.</strong><p>Watch each cut the way<br />your audience will.</p><span className="cm-feed-batch-id">BATCH / {jobId.slice(0, 8).toUpperCase()}</span></div>
    <div ref={scroller} className="cm-feed-scroll" tabIndex={0} aria-label="Scroll down for the next video" onScroll={e => { const el = e.currentTarget; setActive(Math.round(el.scrollTop / el.clientHeight)); }}>
      {results.map((result, index) => <FeedVideo key={result.number} result={result} active={index === active} visible={visible} nearby={Math.abs(index - active) <= 1} muted={muted} onMute={() => setMuted(value => !value)} />)}
    </div>
    <aside className="cm-feed-actions" aria-label="Feed controls">
      <button type="button" disabled={active === 0} onClick={() => move(-1)} aria-label="Previous video"><ArrowUp /></button>
      <span>SCROLL</span>
      <button type="button" disabled={active >= results.length - 1} onClick={() => move(1)} aria-label="Next video"><ArrowDown /></button>
    </aside>
    <footer className="cm-feed-hint">{error ? <span role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></span> : loading ? 'Loading more videos…' : active === completed - 1 ? 'You’ve reached the end of this batch.' : 'Swipe up · Scroll · ↑ ↓'}</footer>
  </div>;
}

function FeedVideo({ result, active, visible, nearby, muted, onMute }) {
  const video = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const clock = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  function toggle() {
    if (!video.current) return;
    if (video.current.paused) video.current.play().catch(() => setBlocked(true));
    else video.current.pause();
  }
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let live = true;
    if (active && visible && !document.hidden) element.play().then(() => { if (live) setBlocked(false); }).catch(() => { if (live) setBlocked(true); });
    else element.pause();
    const visibility = () => { if (document.hidden) element.pause(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { live = false; element.pause(); document.removeEventListener('visibilitychange', visibility); };
  }, [active, visible, muted, nearby]);
  return <article className="cm-feed-item" aria-label={`Video ${result.number}`} aria-hidden={!active}>
    <div className="cm-feed-frame">
      {nearby && <video ref={video} src={result.url} muted={muted} loop playsInline preload={active ? 'auto' : 'metadata'} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onPause={() => setPlaying(false)} onError={() => setFailed(true)} onPlaying={() => { setBlocked(false); setPlaying(true); }} />}
      <div className="cm-feed-video-top"><span><Film size={12} /> BATCH PREVIEW</span><span className="cm-feed-cut">CUT {String(result.number).padStart(3, '0')}</span></div>
      {active && <>
        <button type="button" className={`cm-feed-play-surface ${!playing ? 'is-paused' : ''}`} onClick={toggle} aria-label={playing ? 'Pause video' : 'Play video'}>{!playing && <span><Play size={30} fill="currentColor" /></span>}</button>
        <div className="cm-feed-video-actions">
          <div><button type="button" onClick={onMute} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? <VolumeX size={22} /> : <Volume2 size={22} />}</button><span>{muted ? 'Sound off' : 'Sound on'}</span></div>
          {result.subtitleUrl && <div><a href={result.subtitleUrl} aria-label="Download subtitles"><Captions size={22} /></a><span>Subtitles</span></div>}
          <div><a href={result.url} aria-label="Download current video"><Download size={23} /></a><span>Download</span></div>
        </div>
      </>}
      <div className="cm-feed-caption"><div className="cm-feed-author"><span>A</span><strong>Apollo studio</strong><small>Your creation</small></div><h3>Video {String(result.number).padStart(3, '0')}</h3><div className="cm-feed-sources">{result.names.map((name, index) => <p key={index}><span>{['HOOK', 'BODY', 'CTA'][index] || 'CLIP'}</span>{name}</p>)}</div></div>
      {active && <div className="cm-feed-transport"><button type="button" onClick={toggle} aria-label={playing ? 'Pause video' : 'Play video'}>{playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><span>{clock(time)}</span><input type="range" aria-label="Video position" min="0" max={duration || 1} step="0.1" value={Math.min(time, duration || 1)} onChange={e => { if (video.current) video.current.currentTime = Number(e.target.value); setTime(Number(e.target.value)); }} style={{ '--progress': `${duration ? time / duration * 100 : 0}%` }} /><span>{clock(duration)}</span></div>}
      {active && (blocked || failed) && <p className="cm-feed-message" role="status">{failed ? 'This video could not be played. Try downloading it.' : 'Tap to play'}</p>}
    </div>
  </article>;
}
