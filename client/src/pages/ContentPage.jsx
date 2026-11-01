import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clapperboard, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { contentApi } from '../api/content.js';
import { formatBytes, formatTime } from '../lib/time.js';
import { useToast } from '../lib/toast.jsx';
import { Button, IconButton, Spinner } from '../ui/primitives.jsx';
import AppHeader from '../components/AppHeader.jsx';
import BoardLink from '../components/content/BoardLink.jsx';
import BoardTally from '../components/content/BoardTally.jsx';
import EditingSettings from '../components/content/EditingSettings.jsx';
import ReviewDrawer from '../components/content/ReviewDrawer.jsx';
import ShortsPanel from '../components/content/ShortsPanel.jsx';
import StatusList from '../components/content/StatusList.jsx';
import TranscriptPanel from '../components/content/TranscriptPanel.jsx';
import VideoUpload from '../components/content/VideoUpload.jsx';

const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Content Factory: long-form recording -> transcript -> Jam board tally -> (next) shorts. */
export default function ContentPage() {
  const { id } = useParams();
  return (
    <div className="min-h-screen bg-void text-ink">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-10 sm:px-8">{id ? <SessionView key={id} id={id} /> : <SessionList />}</main>
    </div>
  );
}

/* ------------------------------ session list ------------------------------ */

function SessionList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [sessions, setSessions] = useState(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => contentApi.list().then(setSessions).catch((e) => { setSessions([]); toast.error("Couldn't load your recordings", e.message); }), [toast]);
  useEffect(() => { refresh(); }, [refresh]);

  const create = async () => {
    setCreating(true);
    try {
      const s = await contentApi.create('');
      navigate(`/content/${s.id}`);
    } catch (e) {
      toast.error("Couldn't start a session", e.message);
      setCreating(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.title}" and its uploaded video? The transcript cache is kept.`)) return;
    try {
      await contentApi.remove(s.id);
      refresh();
    } catch (e) {
      toast.error("Couldn't delete it", e.message);
    }
  };

  return (
    <>
      <h1 className="font-display text-3xl tracking-tight">Content Factory</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-2">
        Turn one long recording into a stack of short videos. Upload it, link the Jam board you talked over, and Apollo lines the two up.
      </p>
      <div className="mt-6">
        <Button variant="primary" size="lg" onClick={create} disabled={creating}>
          {creating ? <Spinner size={14} /> : <Plus size={15} />}
          New recording
        </Button>
      </div>

      {sessions === null && <div className="mt-12"><Spinner /></div>}
      {sessions?.length > 0 && (
        <section className="mt-12">
          <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Your recordings</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <li key={s.id} className="group relative rounded-xl border border-line bg-surface transition-colors hover:border-line-strong">
                <button type="button" onClick={() => navigate(`/content/${s.id}`)} className="block w-full p-4 text-left">
                  <p className="truncate font-display text-lg text-ink">{s.title}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {s.source ? `${formatBytes(s.source.bytes)}${s.transcription.duration ? ` - ${formatTime(s.transcription.duration)}` : ''}` : 'No video yet'} - {when(s.updatedAt)}
                  </p>
                  <p className="mt-2 text-xs text-ink-2">
                    {s.transcription.status === 'complete' ? 'Transcribed' : s.transcription.status === 'processing' ? 'Processing...' : s.transcription.status === 'failed' ? 'Needs attention' : 'Not processed'}
                    {s.board ? ` - ${s.board.title}` : ''}
                  </p>
                </button>
                <IconButton aria-label="Delete recording" onClick={() => remove(s)} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100">
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sessions?.length === 0 && (
        <p className="mt-12 flex items-center gap-2 text-sm text-ink-3">
          <Clapperboard size={15} /> No recordings yet.
        </p>
      )}
    </>
  );
}

/* ------------------------------- one session ------------------------------ */

function SessionView({ id }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [session, setSession] = useState(null);
  const [missing, setMissing] = useState(false);
  const [whisper, setWhisper] = useState(null);
  const [tally, setTally] = useState(null);
  const [title, setTitle] = useState('');
  const playerRef = useRef(null);
  const [reviewing, setReviewing] = useState(null);
  const [aiReady, setAiReady] = useState(true);

  // Load once, then poll while the server is working in the background.
  useEffect(() => {
    let stop = false;
    const load = () => contentApi.get(id).then((s) => { if (!stop) setSession((prev) => (prev && prev.updatedAt > s.updatedAt ? prev : s)); }).catch(() => !stop && setMissing(true));
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 1500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    contentApi.status().then((s) => { setWhisper(s.transcription); setAiReady(s.aiLive !== false); }).catch(() => setWhisper({ available: false }));
  }, []);

  useEffect(() => { if (session) setTitle(session.title); }, [session?.id, session?.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // The tally is refetched whenever the server says it was recomputed.
  const tallyStamp = session?.tally.status === 'complete' ? session.tally.computedAt : null;
  useEffect(() => {
    if (!tallyStamp) { setTally(null); return undefined; }
    let cancelled = false;
    contentApi.tally(id).then((t) => !cancelled && setTally(t)).catch(() => !cancelled && setTally(null));
    return () => { cancelled = true; };
  }, [id, tallyStamp]);

  const seek = (t) => playerRef.current?.seek(t);

  const run = async (force) => {
    try {
      setSession(await contentApi.process(id, force));
    } catch (e) {
      toast.error("Couldn't start processing", e.message);
    }
  };

  const analyze = async (force) => {
    try {
      setSession(await contentApi.analyze(id, force));
    } catch (e) {
      toast.error("Couldn't look for shorts", e.message);
    }
  };

  const quick = async (c, status) => {
    try {
      await contentApi.review(id, c.id, { status });
      setSession(await contentApi.get(id));
    } catch (e) {
      toast.error("Couldn't update that short", e.message);
    }
  };

  const renderApproved = async () => {
    try {
      const r = await contentApi.renderApproved(id);
      setSession(r.session);
      toast.success?.(`${r.queued} short${r.queued === 1 ? '' : 's'} queued for rendering`);
    } catch (e) {
      toast.error("Couldn't start rendering", e.message);
    }
  };

  const saveTitle = async () => {
    const next = title.trim();
    if (!next || next === session.title) { setTitle(session.title); return; }
    try {
      setSession(await contentApi.rename(id, next));
    } catch (e) {
      toast.error("Couldn't rename it", e.message);
      setTitle(session.title);
    }
  };

  if (missing) {
    return (
      <>
        <button type="button" onClick={() => navigate('/content')} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft size={14} /> All recordings</button>
        <p className="mt-6 text-ink-2">That recording doesn't exist any more.</p>
      </>
    );
  }
  if (!session) return <Spinner />;

  const t = session.transcription;
  const processing = t.status === 'processing';
  const done = t.status === 'complete';
  const needsWorker = whisper && !whisper.available && !done;

  return (
    <>
      <button type="button" onClick={() => navigate('/content')} className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft size={14} /> All recordings
      </button>

      <p className="mt-6 font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Content Factory</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Recording title"
        className="mt-1 w-full bg-transparent font-display text-3xl tracking-tight outline-none placeholder:text-ink-3"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <VideoUpload ref={playerRef} session={session} onUploaded={setSession} />

        <div className="rounded-xl border border-line bg-surface p-4">
          <BoardLink session={session} onLinked={setSession} disabled={processing} />

          <div className="mt-5 border-t border-line pt-1">
            <StatusList session={session} />
          </div>

          {needsWorker && session.source && (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-2">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                Transcription isn't running on this computer. Start it with <code className="font-mono text-ink">npm run whisper:worker --prefix server</code>, then press Process video.
              </span>
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" disabled={!session.source || processing || done} onClick={() => run(false)}>
              {processing ? <Spinner size={14} /> : null}
              {processing ? `Processing ${Math.round((t.progress || 0) * 100)}%` : done ? 'Processed' : 'Process video'}
            </Button>
            {done && (
              <button
                type="button"
                onClick={() => window.confirm('Transcribe this video again? This replaces the saved transcript.') && run(true)}
                className="text-xs text-ink-3 underline-offset-2 hover:text-ink-2 hover:underline"
              >
                Retranscribe
              </button>
            )}
            {t.status === 'failed' && <Button variant="secondary" onClick={() => run(false)}>Try again</Button>}
          </div>
        </div>
      </div>

      {done && (session.analysis.status !== 'not_started' || session.analysis.reason || session.candidates?.length > 0) && (
        <div className="mt-12">
          <ShortsPanel session={session} onSeek={seek} onAnalyze={analyze} onReview={setReviewing} onQuick={quick} onRenderApproved={renderApproved} />
        </div>
      )}

      {session.source && (
        <div className="mt-12">
          <EditingSettings session={session} onChanged={setSession} aiReady={aiReady} />
        </div>
      )}

      {reviewing && session.candidates.find((c) => c.id === reviewing) && (
        <ReviewDrawer session={session} candidate={session.candidates.find((c) => c.id === reviewing)} onClose={() => setReviewing(null)} onChanged={setSession} />
      )}

      {tally && (
        <div className="mt-12">
          <BoardTally tally={tally} duration={t.duration} onSeek={seek} />
        </div>
      )}
      {done && !session.board && (
        <p className="mt-10 text-sm text-ink-3">Link a Jam board above to see where each of its sections is spoken in this video.</p>
      )}

      <div className="mt-10">
        <TranscriptPanel sessionId={id} ready={done} onSeek={seek} />
      </div>
    </>
  );
}
