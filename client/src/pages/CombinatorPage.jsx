import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, ArrowRight, Download, X, Film, Captions, Sparkles, Mail, Globe, MessageCircle, Play, Check, Package, Layers, RotateCw } from 'lucide-react';
import AppHeader from '../components/AppHeader.jsx';
import { Button, Spinner } from '../ui/primitives.jsx';
import { droppedFiles, supportedMedia, mediaExtension, planImport } from '../lib/combinator.js';
import './content-machine.css';

const sections = [
  { key: 'hooks', title: 'Hooks', label: 'HOOKS', role: 'The first impression', description: 'Stop the scroll.', color: '#6d83cf' },
  { key: 'bodies', title: 'Bodies', label: 'CONTENT', role: 'The story', description: 'Make your point.', color: '#aa80b6' },
  { key: 'ctas', title: 'CTAs', label: 'CTA', role: 'The next step', description: 'Turn attention into action.', color: '#5c9d91' },
];
const emptyGroups = { hooks: [], bodies: [], ctas: [] };
const emptyOverlay = { enabled: false, type: 'email', value: '', heading: '', fade: true, fadeSeconds: 1 };
const defaultRules = { subtitlePosition: 'auto', subtitleSize: 'medium', maxWords: 4 };
function restore() { try { return JSON.parse(localStorage.getItem('apollo-content-machine') || '{}'); } catch { return {}; } }
async function request(url, options) {
  const res = await fetch(`/api/combinator${url}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed. Try again.');
  return data;
}
const post = (url, body) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function CombinatorPage() {
  const saved = useMemo(restore, []);
  const [groups, setGroups] = useState(saved.groups || emptyGroups);
  const [limits, setLimits] = useState(saved.limits || {});
  const [format, setFormat] = useState(saved.format || 'portrait');
  const [batchSize, setBatchSize] = useState(saved.batchSize || 25);
  const [subtitles, setSubtitles] = useState(saved.subtitles ?? false);
  const [noiseCancellation, setNoiseCancellation] = useState(saved.noiseCancellation ?? false);
  const [cleanup, setCleanup] = useState(saved.cleanup ?? true);
  const [animations, setAnimations] = useState(saved.animations ?? false);
  const [faceAware, setFaceAware] = useState(saved.faceAware ?? true);
  const [fit, setFit] = useState(saved.fit || 'cover');
  const [editingRules, setEditingRules] = useState({ ...defaultRules, ...saved.editingRules });
  const [overlay, setOverlay] = useState({ ...emptyOverlay, ...saved.overlay });
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState({});
  const [job, setJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [revision, setRevision] = useState(0);
  const [jobId, setJobId] = useState(saved.jobId || '');
  const [offset, setOffset] = useState(0);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(saved.projectId || '');
  const [projectName, setProjectName] = useState(saved.projectName || 'My first branch');
  const [libraryReady, setLibraryReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const failedSaveSnapshot = useRef('');
  const active = job && !['complete', 'failed'].includes(job.status);
  const importing = Object.values(busy).some(Boolean);
  const selected = useMemo(() => Object.fromEntries(sections.map(({ key }) => [key, groups[key].slice(0, limits[key] || groups[key].length)])), [groups, limits]);
  const ids = useMemo(() => Object.fromEntries(sections.map(({ key }) => [key, selected[key].map(c => c.id)])), [selected]);
  const total = selected.hooks.length * selected.bodies.length * selected.ctas.length;
  const remaining = availability?.remaining;
  const nextCount = Math.min(Number(batchSize) || 0, remaining ?? total);
  const settings = { limits, format, batchSize, subtitles, cleanup, noiseCancellation, overlay, animations, editingRules, faceAware, fit };
  const finishingReady = (!subtitles && !animations || capabilities?.transcription.available) && (!subtitles || !cleanup || capabilities?.deepseek) && (!animations || (capabilities?.deepseek && capabilities?.animations?.available));
  const branchData = { name: projectName, groups: Object.fromEntries(sections.map(({ key }) => [key, groups[key].map(c => c.id)])), settings };
  const snapshot = JSON.stringify(branchData);
  const dirty = snapshot !== savedSnapshot;
  const branchJobs = jobs.filter(batch => !batch.projectId || batch.projectId === projectId);
  useEffect(() => { setPreviewVideo(null); }, [jobId]);

  function openProject(project) {
    setProjectId(project.id); setProjectName(project.name); setGroups(project.groups);
    const s = project.settings || {};
    setLimits(s.limits || {}); setFormat(s.format || 'portrait'); setBatchSize(s.batchSize || 25);
    setSubtitles(s.subtitles ?? false); setCleanup(s.cleanup ?? true); setNoiseCancellation(s.noiseCancellation ?? false);
    setOverlay({ ...emptyOverlay, ...s.overlay });
    setAnimations(s.animations ?? false); setEditingRules({ ...defaultRules, ...s.editingRules });
    setFaceAware(s.faceAware ?? true); setFit(s.fit || 'cover');
    setSavedSnapshot(JSON.stringify({ name: project.name, groups: Object.fromEntries(sections.map(({ key }) => [key, project.groups[key].map(c => c.id)])), settings: { limits: s.limits || {}, format: s.format || 'portrait', batchSize: s.batchSize || 25, subtitles: s.subtitles ?? false, cleanup: s.cleanup ?? true, noiseCancellation: s.noiseCancellation ?? false, overlay: { ...emptyOverlay, ...s.overlay }, animations: s.animations ?? false, editingRules: { ...defaultRules, ...s.editingRules }, faceAware: s.faceAware ?? true, fit: s.fit || 'cover' } }));
    setJob(null); setJobId(''); setOffset(0); setRevision(n => n + 1);
  }
  async function persistBranch(duplicate = false, parentId = projectId) {
    const data = duplicate ? { ...branchData, name: `${projectName.slice(0, 85)} (copy)`, parentId: parentId || null } : branchData;
    const project = projectId && !duplicate
      ? await request(`/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      : await post('/projects', data);
    setProjects(old => [project, ...old.filter(p => p.id !== project.id)]);
    setProjectId(project.id); setProjectName(project.name);
    setSavedSnapshot(JSON.stringify({ name: project.name, groups: data.groups, settings: data.settings }));
    return project;
  }
  async function libraryAction(action, project) {
    setSaving(true); setError('');
    try {
      if (action === 'save') await persistBranch();
      else if (action === 'duplicate') {
        const parent = dirty || !projectId ? await persistBranch() : { id: projectId };
        openProject(await persistBranch(true, parent.id));
      } else {
        if (dirty && (projectId || Object.values(groups).some(g => g.length))) await persistBranch();
        if (action === 'open') openProject(project);
        else {
          openProject(await post('/projects', { name: `Session ${new Date().toLocaleDateString()} · ${projects.length + 1}`, groups: emptyGroups, settings: {} }));
          setProjects(await request('/projects'));
        }
      }
    } catch (e) { failedSaveSnapshot.current = snapshot; setError(e.message); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (!libraryReady || saving || starting || importing || !dirty || failedSaveSnapshot.current === snapshot || !projectName.trim() || (!projectId && !Object.values(groups).some(g => g.length))) return;
    const timer = setTimeout(() => libraryAction('save'), 1000);
    return () => clearTimeout(timer);
  }, [snapshot, projectId, libraryReady, saving, starting, importing, dirty]);

  useEffect(() => {
    try { localStorage.setItem('apollo-content-machine', JSON.stringify({ groups, limits, format, batchSize, subtitles, cleanup, noiseCancellation, overlay, animations, editingRules, faceAware, fit, jobId, projectId, projectName })); } catch { /* Storage may be disabled or full. */ }
  }, [groups, limits, format, batchSize, subtitles, cleanup, noiseCancellation, overlay, animations, editingRules, faceAware, fit, jobId, projectId, projectName]);
  useEffect(() => {
    let live = true;
    request('/projects').then(value => {
      if (!live) return;
      setProjects(value);
      if (!saved.groups && value.length) openProject(value[0]);
      else if (saved.projectId) {
        const project = value.find(p => p.id === saved.projectId);
        if (project) setSavedSnapshot(JSON.stringify({ name: project.name, groups: Object.fromEntries(sections.map(({ key }) => [key, project.groups[key].map(c => c.id)])), settings: project.settings }));
        else setProjectId('');
      }
      setLibraryReady(true);
    }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    request('/capabilities').then(value => { if (live) setCapabilities(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    let live = true;
    request('/jobs').then(value => { if (live) setJobs(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [revision]);
  useEffect(() => {
    let live = true;
    setAvailability(null);
    if (!total || importing) return;
    const timer = setTimeout(() => post('/availability', { groups: ids }).then(value => { if (live) setAvailability(value); }).catch(e => { if (live) setError(e.message); }), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [ids, total, importing, revision]);
  useEffect(() => {
    if (!jobId) return;
    let stopped = false, timer;
    const refresh = async () => {
      try {
        const result = await request(`/jobs/${jobId}?offset=${offset}`);
        if (stopped) return;
        setJob(result);
        if (!['complete', 'failed'].includes(result.status)) timer = setTimeout(refresh, 1500);
        else setRevision(value => value + 1);
      } catch (e) { if (!stopped) { setError(e.message); timer = setTimeout(refresh, 5000); } }
    };
    refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId, offset]);

  const generate = async (refinishId = '', previewOnly = false) => {
    setStarting(true); setError('');
    try {
      const project = await persistBranch();
      const result = await post(refinishId ? `/jobs/${refinishId}/refinish` : '/jobs', { projectId: project.id, groups: ids, format, batchSize: Number(batchSize), subtitles, cleanup, noiseCancellation, overlay, animations: previewOnly || animations, editingRules, faceAware, fit, previewOnly });
      setJob(result); setOffset(0); setJobId(result.id); setRevision(value => value + 1);
    } catch (e) { setError(e.message); }
    finally { setStarting(false); }
  };
  const addClips = (key, incoming) => {
    setGroups(old => {
      const identity = c => key === 'hooks' && c.audioIdentity ? `audio:${c.audioIdentity}` : c.sha256;
      const seen = new Set(old[key].map(identity));
      return { ...old, [key]: [...old[key], ...incoming.filter(c => { const hash = identity(c); if (seen.has(hash)) return false; seen.add(hash); return true; })] };
    });
  };
  const overlayReady = !overlay.enabled || overlay.type === 'dm' || overlay.value.trim();
  return <div className="cm-page min-h-screen bg-void text-ink"><AppHeader /><main className="mx-auto max-w-[1240px] px-4 pb-20 pt-10 sm:px-8">
    <header className="cm-heading"><div><p className="cm-eyebrow"><Layers size={13} /> APOLLO / VIDEO STUDIO</p><h1 className="mt-3 font-display text-4xl font-semibold tracking-[-.05em] sm:text-5xl">Content Machine<span className="text-accent">.</span></h1><p className="mt-4 max-w-xl text-sm leading-6 text-ink-2">A few good clips. Every way to tell your story.<br />Drop your folders, choose a batch, and make something new.</p></div><div className="cm-sequence" aria-label="Video sequence"><span style={{ '--clip-color': sections[0].color }}>HOOK</span><ArrowRight size={14} /><span style={{ '--clip-color': sections[1].color }}>BODY</span><ArrowRight size={14} /><span style={{ '--clip-color': sections[2].color }}>CTA</span><p>One continuous video. Every time.</p></div></header>

    <section className="cm-panel mt-8" aria-label="Content Machine library">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="cm-panel-title"><Layers size={18} /><h2>Your library</h2></div><p className="cm-help">One branch per session or campaign. Reopen your clips and download batches whenever you need them.</p></div><Button variant="ghost" disabled={!libraryReady || saving || starting || importing} onClick={() => libraryAction('new')}><FolderPlus size={14} />New branch</Button></div>
      <div className="cm-library-list mt-5">{projects.map(project => <button key={project.id} type="button" className={`cm-library-branch ${project.id === projectId ? 'is-current' : ''}`} disabled={saving || starting || importing || project.id === projectId} onClick={() => libraryAction('open', project)}><span className="flex items-center gap-2"><Layers size={13} /><strong>{project.name}</strong></span><span>{project.groups.hooks.length} hooks · {project.groups.bodies.length} content · {project.groups.ctas.length} CTAs</span><small>{project.parentId ? 'Duplicated branch · ' : ''}{new Date(project.updatedAt).toLocaleDateString()}</small></button>)}{libraryReady && !projects.length && <p className="cm-help">Drop clips below, name your first branch, then save it to your library.</p>}</div>
      <div className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-5"><label className="cm-label min-w-0 flex-1">Branch name<input className="cm-input" maxLength={100} value={projectName} disabled={saving || starting} onChange={e => setProjectName(e.target.value)} /></label><Button disabled={!libraryReady || saving || starting || importing || !projectName.trim()} onClick={() => libraryAction('save')}>{saving ? <Spinner size={13} /> : <Check size={13} />}Save branch</Button><Button variant="ghost" disabled={!libraryReady || saving || starting || importing || !projectName.trim()} onClick={() => libraryAction('duplicate')}>Duplicate branch</Button>{projectId && !dirty && <a className="cm-download" href={`/api/combinator/projects/${projectId}/archive`}><Download size={14} />Source ZIP</a>}</div>
      <p className="cm-help" role="status">{!libraryReady ? 'Loading library…' : saving ? 'Saving branch…' : dirty ? 'Changes will save automatically. You can also save now.' : 'Saved to local disk.'} Clips and settings stay in this library between visits.</p>
    </section>
    <section aria-label="Import clips" className="mt-6 grid gap-4 md:grid-cols-3">{sections.map(section => <FolderZone key={`${projectId}-${section.key}`} {...section} clips={groups[section.key]} selectedCount={selected[section.key].length} limit={limits[section.key]} disabled={starting || saving || !libraryReady} onLimit={value => setLimits(old => ({ ...old, [section.key]: value }))} onBusy={value => setBusy(old => ({ ...old, [section.key]: value }))} onAdd={clips => addClips(section.key, clips)} onRemove={id => { setGroups(old => ({ ...old, [section.key]: old[section.key].filter(c => c.id !== id) })); setLimits(old => ({ ...old, [section.key]: null })); }} />)}</section>
    {availability?.hookAudit && <div role="alert" className="mt-5 rounded-xl border border-danger/30 bg-danger/5 p-5"><p className="text-sm font-medium">{availability.hookAudit.imported} hook files contain only {availability.hookAudit.distinct} distinct audio recording{availability.hookAudit.distinct === 1 ? '' : 's'}.</p><p className="mt-2 text-xs leading-6 text-ink-2">{availability.hookAudit.message} Add different spoken hooks to create fresh openings.</p></div>}
    <p className="mt-4 text-xs leading-6 text-ink-3">{availability ? `${availability.possible.toLocaleString()} distinct content combinations available in this source pool.` : 'Checking content identities…'} {selected.bodies.length > 0 && selected.bodies.length < Number(batchSize) ? `With ${selected.bodies.length} body clips, bodies must repeat; the batch alternates them where possible. Add more body recordings for more variety.` : ''}</p>

    <section className="cm-equation" aria-label="Combination summary"><div><p className="cm-eyebrow">YOUR COMBINATION POOL</p><div className="mt-3 flex flex-wrap items-baseline gap-3 font-mono text-xl sm:gap-5 sm:text-3xl">{availability?.hookAudit?.distinct ?? selected.hooks.length}<span>×</span>{selected.bodies.length}<span>×</span>{selected.ctas.length}<span>=</span><strong>{(availability?.possible ?? total).toLocaleString()}</strong></div><p className="mt-2 text-xs text-ink-3">Hooks × Bodies × CTAs</p></div><div className="sm:text-right"><p className="text-sm text-ink-2">Distinct combinations: <strong className="text-ink">{(availability?.possible ?? total).toLocaleString()}</strong></p><p className="mt-2 text-sm text-ink-2" role="status">{!total ? 'Add clips to all three folders to begin.' : remaining === undefined ? 'Checking previous batches…' : <><span className="cm-status-dot" />{remaining.toLocaleString()} unused combinations available</>}</p><p className="mt-2 text-xs text-ink-3">Previously generated videos are automatically excluded.</p></div></section>

    <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
      <section className="cm-panel"><div className="cm-panel-title"><Captions size={18} /><h2>Subtitles & finishing</h2></div><p className="cm-help">A consistent frame. Words that are easy to follow.</p><label className="cm-label mt-6">Video format<select value={format} onChange={e => setFormat(e.target.value)} className="cm-input"><option value="portrait">Portrait · 9:16 · 1080 × 1920</option><option value="landscape">Landscape · 16:9 · 1920 × 1080</option><option value="square">Square · 1:1 · 1080 × 1080</option></select></label>
        <label className="cm-toggle mt-5"><span><strong>Noise cancellation</strong><small>Reduce steady background hiss and fan noise in exported clips.</small></span><input type="checkbox" checked={noiseCancellation} onChange={e => setNoiseCancellation(e.target.checked)} /></label>
        <label className="cm-label mt-5">Frame fitting<select className="cm-input" value={fit} onChange={e => setFit(e.target.value)}><option value="cover">Fill frame · no added black bars</option><option value="contain">Fit whole clip · allow borders</option></select></label>
        <label className="cm-toggle mt-5"><span><strong>Face-aware framing & placement</strong><small>Use Content Factory's local face detector to frame the speaker and keep graphics clear of their face.</small></span><input type="checkbox" checked={faceAware} onChange={e => setFaceAware(e.target.checked)} /></label>
        <label className="cm-toggle mt-5"><span><strong>Burn in subtitles</strong><small>Timed speech captions + an editable SRT file.</small></span><input type="checkbox" checked={subtitles} onChange={e => setSubtitles(e.target.checked)} /></label>
        {subtitles && <fieldset className="mt-4 grid grid-cols-2 gap-3" aria-label="Subtitle editing rules"><label className="cm-label">Position<select className="cm-input" value={editingRules.subtitlePosition} onChange={e => setEditingRules(old => ({ ...old, subtitlePosition: e.target.value }))}><option value="auto">Auto · avoid face</option><option value="lower">Lower safe zone</option><option value="middle">Middle</option><option value="upper">Upper safe zone</option></select></label><label className="cm-label">Text size<select className="cm-input" value={editingRules.subtitleSize} onChange={e => setEditingRules(old => ({ ...old, subtitleSize: e.target.value }))}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><label className="cm-label">Words per caption<select className="cm-input" value={editingRules.maxWords} onChange={e => setEditingRules(old => ({ ...old, maxWords: Number(e.target.value) }))}>{[3, 4, 6].map(n => <option key={n} value={n}>{n} words</option>)}</select></label><p className="cm-help">Keep captions above app controls and away from the right-side buttons.</p></fieldset>}
        <label className="cm-toggle mt-5"><span><strong>DeepSeek animations</strong><small>Transcript-based comparisons, number graphics, key points and underlines. Rendered into your MP4 using HTML.</small></span><input type="checkbox" checked={animations} onChange={e => setAnimations(e.target.checked)} /></label>
        {animations && <div className="mt-3 rounded-xl bg-void p-4 text-[11px] leading-5 text-ink-3"><p>The Content Factory director reads the full transcript and plans visual explanations. Editing rules keep one animation on screen at a time, separate from subtitles and contact details. Speech text is sent to DeepSeek. Video rendering takes longer.</p>{!capabilities?.deepseek && <p className="mt-2 text-danger">DeepSeek needs an API key.</p>}{capabilities && !capabilities.animations?.available && <p className="mt-2 text-danger">{capabilities.animations?.reason || 'Start the HTML render worker.'}</p>}{capabilities && !capabilities.transcription.available && <p className="mt-2 text-danger">{capabilities.transcription.reason}</p>}</div>}
        {subtitles && <div className="mt-3 rounded-xl bg-void p-4"><label className="cm-toggle"><span><strong className="flex items-center gap-2"><Sparkles size={13} />DeepSeek cleanup</strong><small>Improve punctuation and casing. Keep speech timing.</small></span><input type="checkbox" checked={cleanup} onChange={e => setCleanup(e.target.checked)} /></label><p className="mt-3 text-[11px] leading-5 text-ink-3">Subtitle text is sent to DeepSeek when cleanup is enabled.</p></div>}
        <div className="mt-5 flex flex-wrap gap-2"><span className={`cm-service ${capabilities?.transcription?.available ? 'is-ready' : ''}`}><span />Speech engine {capabilities ? capabilities.transcription.available ? 'ready' : 'needs setup' : 'checking'}</span><span className={`cm-service ${capabilities?.deepseek ? 'is-ready' : ''}`}><span />DeepSeek {capabilities ? capabilities.deepseek ? 'connected' : 'needs API key' : 'checking'}</span></div>
        {subtitles && capabilities && !capabilities.transcription.available && <p className="mt-3 text-xs leading-5 text-danger">{capabilities.transcription.reason}</p>}
        {subtitles && cleanup && capabilities && !capabilities.deepseek && <p className="mt-3 text-xs leading-5 text-danger">Set DEEPSEEK_API_KEY on the server, or turn off DeepSeek cleanup.</p>}
        <p className="mt-6 border-t border-line pt-4 text-xs leading-5 text-ink-3">Original audio is preserved unless noise cancellation is enabled. Fill frame exports a full 9:16 portrait without added borders; the face detector guides the crop. Audio-only clips use a black background.</p>
      </section>
      <CtaPanel overlay={overlay} onChange={setOverlay} deepseek={capabilities?.deepseek} onError={setError} subtitles={subtitles} />
    </div>

    <section className="cm-batch mt-7" aria-label="Batch controls"><div><div className="cm-panel-title"><Package size={19} /><h2>Your next batch</h2></div><p className="cm-help">Rotate distinct spoken hooks and alternate bodies. Previously used combinations are excluded.</p><div className="mt-5 flex flex-wrap items-center gap-2">{[25, 50, 100].map(n => <button key={n} type="button" className={`cm-preset ${Number(batchSize) === n ? 'is-selected' : ''}`} onClick={() => setBatchSize(n)}>{n} videos</button>)}<label className="cm-custom">Custom<input aria-label="Videos per batch" type="number" min="1" step="1" value={batchSize} onChange={e => setBatchSize(e.target.value)} /></label></div></div><div className="cm-batch-action"><Button variant="primary" size="lg" className="!h-12 !rounded-xl !px-6" onClick={() => generate()} disabled={!total || !Number.isSafeInteger(total) || !Number.isSafeInteger(Number(batchSize)) || Number(batchSize) < 1 || remaining === 0 || starting || saving || !libraryReady || active || importing || !overlayReady || !finishingReady}>{starting ? <Spinner size={15} /> : <ArrowRight size={16} />}Extract {nextCount.toLocaleString()} fresh videos</Button><p className="mt-3 text-xs text-ink-3">One ZIP download. No repeated combinations.</p>{remaining !== undefined && Number(batchSize) > remaining && remaining > 0 && <p className="mt-2 text-xs text-ink-3">The final batch contains the {remaining} videos left.</p>}</div></section>
    {error && <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger"><p className="flex-1">{error}</p><button type="button" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
    {job && <section className="cm-panel mt-7" aria-label="Generated videos"><div className="mb-4 flex flex-wrap gap-3 text-xs text-ink-2"><span>Animations: {job.animations ? `ON · ${job.animationEvents ?? "legacy"} visual beats` : "OFF"}</span><span>{job.format === "portrait" ? "9:16 · 1080 × 1920" : job.format}</span><span>{job.fit === "cover" ? "Fill frame" : "Fit with borders"}</span><span>{job.faceAware ? `Face-aware · ${job.detectedFaces || 0} clips detected` : "Fixed placement"}</span></div>{job.freshness && <p className="mb-4 text-xs text-ink-2">{job.freshness.distinctHooks} distinct spoken hooks · {job.freshness.distinctBodies} bodies · {job.freshness.distinctCtas} CTAs in this export{job.freshness.repeatedHookVideos > 0 ? ` · ${job.freshness.repeatedHookVideos} videos reuse a spoken hook` : ""}</p>}{job.warnings?.length > 0 && <details className="mb-4 text-xs text-ink-3"><summary>Export notes ({job.warnings.length})</summary>{job.warnings.map((note, i) => <p key={i} className="mt-2">{note}</p>)}</details>}<div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4"><div><p className="text-xs text-ink-2">Re-render these same videos with different finishing settings.</p><p className="mt-1 text-[11px] text-ink-3">This keeps the same clips and order. Use Extract fresh videos above for new content.</p>{job.refinementOf && <p className="mt-1 text-[11px] text-ink-3">Improved export of batch {job.refinementOf.slice(0, 8)}</p>}</div><Button variant="ghost" disabled={starting || saving || importing || active || !job.completed || !finishingReady || !overlayReady || !libraryReady} onClick={() => generate(job.id)}><Sparkles size={14} />Re-render same videos</Button><Button variant="ghost" disabled={starting || saving || importing || active || !job.completed || !capabilities?.animations?.available || !capabilities?.deepseek} onClick={() => generate(job.id, true)}><Play size={14} />Preview AI edit</Button></div><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="cm-eyebrow">BATCH {job.id.slice(0, 8).toUpperCase()}</p><h2 className="mt-2 font-display text-2xl">{job.status === 'complete' ? job.previewOnly ? 'AI edit preview ready.' : job.refinementOf ? 'Re-rendered videos, ready.' : 'Fresh batch, ready.' : job.status === 'failed' ? 'This batch needs attention.' : 'Making your next batch.'}</h2></div>{job.completed > 0 && <a className="cm-download" href={`/api/combinator/jobs/${job.id}/archive`}><Download size={16} />Download {job.status === 'complete' ? 'batch' : 'completed'} ZIP · {job.completed}</a>}</div><div className="mt-5 flex justify-between gap-3 text-xs text-ink-2"><p role="status">{job.stage || ({ complete: 'Complete', failed: 'Stopped', preparing: 'Preparing clips', queued: 'Waiting in queue', rendering: 'Rendering videos' }[job.status])}</p><span>{job.completed.toLocaleString()} / {job.total.toLocaleString()}</span></div><progress className="cm-progress mt-3" value={job.completed} max={job.total} aria-label="Rendering progress" />{job.error && <p role="alert" className="mt-3 text-sm text-danger">{job.error}</p>}
      {previewVideo && <div className="mt-5 rounded-xl border border-line bg-void p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs text-ink-2">Video {String(previewVideo.number).padStart(3, '0')}</p><button type="button" aria-label="Close video preview" onClick={() => setPreviewVideo(null)}><X size={14} /></button></div><video key={previewVideo.url} src={previewVideo.url} controls preload="metadata" className="mx-auto max-h-[480px] max-w-full rounded-lg" /></div>}
      <ul className="mt-3 divide-y divide-line">{job.results?.map(result => <li key={result.number} className="flex items-center gap-3 py-3"><span className="cm-video-icon"><Film size={16} /></span><div className="min-w-0 flex-1"><p className="text-sm">Video {String(result.number).padStart(3, '0')}</p><p className="mt-1 truncate text-xs text-ink-3" title={result.names.join(' → ')}>{result.names.join(' → ')}</p></div><button type="button" className="cm-result-link" aria-label={`Preview video ${result.number}`} onClick={() => setPreviewVideo(result)}><Play size={14} /></button>{result.subtitleUrl && <a href={result.subtitleUrl} className="cm-result-link">SRT</a>}<a href={result.url} className="cm-result-link" aria-label={`Download video ${result.number}`}><Download size={15} /><span className="hidden sm:inline">MP4</span></a></li>)}</ul>
      {job.completed > 30 && <div className="mt-4 flex items-center justify-end gap-4"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 30))}>Previous</Button><span className="text-xs text-ink-3">Page {Math.floor(offset / 30) + 1}</span><Button variant="ghost" disabled={offset + 30 >= job.completed} onClick={() => setOffset(offset + 30)}>Next</Button></div>}
    </section>}
    {branchJobs.length > 0 && <section className="mt-9"><div className="flex items-center justify-between"><h2 className="font-display text-xl">Branch batches</h2><Button variant="ghost" onClick={() => setRevision(n => n + 1)} aria-label="Refresh batch history"><RotateCw size={14} /></Button></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{branchJobs.map(batch => <div key={batch.id} className={`cm-history ${batch.id === jobId ? 'is-current' : ''}`}><button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setJob(batch); setJobId(batch.id); setOffset(0); setAnimations(batch.animations ?? false); }}><p className="text-xs text-ink-3">{new Date(batch.createdAt).toLocaleString()}</p><p className="mt-2 text-sm font-medium">{batch.completed} of {batch.total} videos <span className="text-xs font-normal text-ink-3">· {batch.status}</span></p><p className="mt-1 font-mono text-[10px] text-ink-3">{batch.id.slice(0, 8)}{batch.refinementOf ? ' · Improved export' : !batch.projectId ? ' · Earlier batch' : ''}</p></button>{batch.completed > 0 && <a href={`/api/combinator/jobs/${batch.id}/archive`} className="cm-result-link" aria-label={`Download batch ${batch.id.slice(0, 8)}`}><Download size={16} /></a>}</div>)}</div></section>}
  </main></div>;
}

function CtaPanel({ overlay, onChange, deepseek, onError, subtitles }) {
  const [preview, setPreview] = useState(0), [suggesting, setSuggesting] = useState(false);
  const update = patch => onChange(old => ({ ...old, ...patch }));
  const Icon = { email: Mail, website: Globe, dm: MessageCircle }[overlay.type];
  const heading = overlay.heading || { email: 'EMAIL ME', website: 'VISIT THE WEBSITE', dm: 'SEND ME A DM' }[overlay.type];
  const suggest = async () => {
    setSuggesting(true);
    try { const result = await post('/suggest-cta', { type: overlay.type, value: overlay.value }); update({ heading: result.heading }); }
    catch (e) { onError(e.message); } finally { setSuggesting(false); }
  };
  return <section className="cm-panel"><div className="cm-panel-title"><Sparkles size={18} /><h2>Give your CTA a little presence.</h2></div><p className="cm-help">An optional overlay on the CTA part of every video.</p><label className="cm-toggle mt-5"><span><strong>Show contact details</strong><small>Email, website or DM. Right when it matters.</small></span><input type="checkbox" checked={overlay.enabled} onChange={e => update({ enabled: e.target.checked })} /></label>
    <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_150px]"><div className={!overlay.enabled ? 'opacity-50' : ''}><fieldset disabled={!overlay.enabled} className="space-y-4"><div className="cm-type-picker">{[{ type: 'email', Icon: Mail, label: 'Email' }, { type: 'website', Icon: Globe, label: 'Website' }, { type: 'dm', Icon: MessageCircle, label: 'DM' }].map(({ type, Icon: ItemIcon, label }) => <button type="button" aria-pressed={overlay.type === type} key={type} onClick={() => update({ type, heading: '' })} className={overlay.type === type ? 'is-selected' : ''}><ItemIcon size={13} />{label}</button>)}</div><label className="cm-label">{overlay.type === 'email' ? 'Email address' : overlay.type === 'website' ? 'Website address' : 'DM handle or keyword (optional)'}<input className="cm-input" type="text" maxLength={120} value={overlay.value} placeholder={{ email: 'hello@yourbrand.com', website: 'yourbrand.com', dm: '@yourbrand · DM “START”' }[overlay.type]} onChange={e => update({ value: e.target.value })} /></label><label className="cm-label">Heading <input className="cm-input" maxLength={60} value={overlay.heading} placeholder={heading} onChange={e => update({ heading: e.target.value })} /></label><Button variant="ghost" size="sm" disabled={!deepseek || !overlay.value.trim() || suggesting} onClick={suggest}>{suggesting ? <Spinner size={12} /> : <Sparkles size={12} />}Write heading with DeepSeek</Button><label className="cm-toggle"><span><strong>Fade in · 0% → 100%</strong><small>Starts when the CTA clip begins.</small></span><input type="checkbox" checked={overlay.fade} onChange={e => update({ fade: e.target.checked })} /></label>{overlay.fade && <label className="cm-label">Fade duration · {overlay.fadeSeconds}s<input className="mt-2 w-full accent-[rgb(var(--c-accent))]" type="range" min="0.1" max="5" step="0.1" value={overlay.fadeSeconds} onChange={e => update({ fadeSeconds: Number(e.target.value) })} /></label>}</fieldset></div>
      <div><div className="cm-preview"><div className="cm-preview-top"><span />CTA PREVIEW</div>{overlay.enabled ? <div key={`${preview}-${overlay.fade}-${overlay.fadeSeconds}-${overlay.type}`} className={`cm-preview-cta ${overlay.fade ? 'cm-fade' : ''}`} style={{ animationDuration: `${overlay.fadeSeconds}s` }}><Icon size={20} /><p>{heading}</p><strong>{overlay.value || (overlay.type === 'dm' ? '' : 'Your details here')}</strong></div> : <div className="cm-preview-empty"><Film size={24} /><span>Your CTA clip</span></div>}{subtitles && <div className="cm-preview-captions">Your words.<br />Easy to follow.</div>}<div className="cm-preview-timeline"><i /><i /><i /></div></div><button type="button" className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs text-ink-3 hover:text-ink" onClick={() => setPreview(n => n + 1)}><Play size={11} />Replay preview</button><p className="mt-2 text-center text-[10px] leading-4 text-ink-3">Illustrative preview</p></div>
    </div>
  </section>;
}

function FolderZone({ title, label, role, description, color, clips, selectedCount, limit, onLimit, onAdd, onRemove, onBusy, disabled }) {
  const input = useRef(null), fileInput = useRef(null), lock = useRef(false);
  const [drag, setDrag] = useState(false), [status, setStatus] = useState(''), [loading, setLoading] = useState(false), [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(null), [formats, setFormats] = useState([]), [onePerName, setOnePerName] = useState(true);
  const detected = [...new Set((pending || []).filter(item => supportedMedia(item.file.name)).map(item => mediaExtension(item.file.name)))].sort();
  const plan = planImport(pending || [], formats, onePerName, clips);
  const finishImport = () => {
    lock.current = false; setLoading(false); setPending(null); onBusy(false);
    if (input.current) input.current.value = '';
    if (fileInput.current) fileInput.current.value = '';
  };
  const importFiles = async source => {
    if (lock.current || disabled) return;
    lock.current = true; setLoading(true); onBusy(true); setStatus('Reading folder…'); setProgress(0);
    try {
      const files = await source;
      const extensions = [...new Set(files.filter(item => supportedMedia(item.file.name)).map(item => mediaExtension(item.file.name)))];
      const video = extensions.filter(ext => /^(mp4|mov|m4v|webm|mkv|avi)$/.test(ext));
      setFormats(video.length ? video : extensions); setPending(files); setLoading(false); setStatus('Review file types before importing.');
    } catch (e) { setStatus(`Could not read folder: ${e.message}`); finishImport(); }
  };
  const confirmImport = async () => {
    if (!pending || loading || disabled || !plan.selected.length) return;
    setLoading(true); setProgress(0);
    let imported = 0, skipped = 0;
    const failures = [];
    try {
      const identity = c => title === 'Hooks' && c.audioIdentity ? `audio:${c.audioIdentity}` : c.sha256;
      const files = plan.selected, hashes = new Set(clips.map(identity));
      for (let i = 0; i < files.length; i++) {
        const { file, path } = files[i];
        const fingerprint = `${path}:${file.size}:${file.lastModified}`;
        setProgress((i + 1) / files.length * 100);
        setStatus(`Importing ${i + 1}/${files.length}: ${file.name}`);
        const form = new FormData(); form.append('sourcePath', path); form.append('file', file);
        try {
          const clip = await request('/clips', { method: 'POST', body: form });
          if (hashes.has(identity(clip))) { skipped++; continue; }
          onAdd([{ ...clip, path, fingerprint }]); hashes.add(identity(clip)); imported++;
        } catch (e) { failures.push(`${file.name}: ${e.message}`); }
      }
      const excluded = plan.skipped.unsupported + plan.skipped.filtered + plan.skipped.duplicate;
      setStatus(`${imported} imported · ${excluded} excluded by review${skipped ? ` · ${skipped} identical files skipped` : ''}${failures.length ? ` · ${failures.length} failed: ${failures.join('; ')}` : ''}`);
    } catch (e) { setStatus(`Could not read folder: ${e.message}`); }
    finally { finishImport(); }
  };
  return <section className="cm-folder" style={{ '--clip-color': color }}><div className="flex items-start justify-between gap-2"><div><p className="cm-folder-role">{role}</p><h2 className="mt-2 font-display text-xl font-medium">{title}: <span className="font-mono">{selectedCount}</span></h2></div><span className="cm-folder-mark"><Film size={17} /></span></div><p className="mt-2 text-xs text-ink-3">{description}</p>
    <button type="button" disabled={disabled || loading || !!pending} className={`cm-drop ${drag ? 'is-dragging' : ''}`} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }} onDrop={e => { e.preventDefault(); setDrag(false); if (!loading && !disabled && !pending) importFiles(droppedFiles(e.dataTransfer)); }}>
      <span className="cm-folder-stack"><span /><span /><span>{loading ? <Spinner size={23} /> : <FolderPlus size={27} strokeWidth={1.3} />}</span></span><span className="font-mono text-[11px] leading-5 tracking-[.09em]">DRAG &amp; DROP {label} FOLDER</span><span className="text-xs text-ink-3">or click to browse · any number of clips</span>{loading && <progress className="cm-import-progress" value={progress} max={100} aria-label={`${title} import progress`} />}
    </button><input ref={input} className="hidden" type="file" webkitdirectory="" directory="" multiple onChange={e => importFiles(Array.from(e.target.files || []).map(file => ({ file, path: file.webkitRelativePath || file.name })))} aria-label={`Choose ${title} folder`} />
    <input ref={fileInput} className="hidden" type="file" multiple onChange={e => importFiles(Array.from(e.target.files || []).map(file => ({ file, path: file.name })))} aria-label={`Choose ${title} files`} />
    <button type="button" className="cm-result-link mt-3" disabled={disabled || loading || !!pending} onClick={() => fileInput.current?.click()}>Choose individual files</button>
    {pending && <div className="mt-4 rounded-xl border border-line bg-void p-4" aria-label={`Review ${title} import`}>
      <p className="text-xs font-medium">Accept file types</p><fieldset disabled={loading} className="mt-3 flex flex-wrap gap-3">{detected.map(ext => <label key={ext} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={formats.includes(ext)} onChange={e => setFormats(old => e.target.checked ? [...old, ext] : old.filter(value => value !== ext))} />{ext.toUpperCase()} ({pending.filter(item => mediaExtension(item.file.name) === ext).length})</label>)}</fieldset>
      <label className="cm-toggle mt-4"><span><strong>One clip per matching filename</strong><small>Prefer MP4, then MOV. Skip alternate formats of the same name in the same folder, including clips already imported.</small></span><input type="checkbox" checked={onePerName} disabled={loading} onChange={e => setOnePerName(e.target.checked)} /></label>
      <p className="mt-4 text-xs text-ink-2" role="status">{plan.selected.length} selected · {plan.skipped.filtered} filtered · {plan.skipped.duplicate} matching names or duplicates · {plan.skipped.unsupported} unsupported (including GIF previews)</p>
      <ul className="mt-3 max-h-32 overflow-auto text-[11px] text-ink-3">{plan.selected.map((item, i) => <li key={i} className="truncate py-1" title={item.path}>{item.path}</li>)}</ul>
      <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={loading || !plan.selected.length || disabled} onClick={confirmImport}>{loading ? <Spinner size={12} /> : <Check size={12} />}Import {plan.selected.length} clips</Button><Button variant="ghost" size="sm" disabled={loading} onClick={() => { finishImport(); setStatus('Import cancelled. No files uploaded.'); }}>Cancel</Button></div>
    </div>}
    <p role="status" className="mt-3 max-h-20 overflow-y-auto break-words text-[11px] leading-5 text-ink-3">{status || 'Nested folders included · Video & audio'}</p>
    {clips.length > 0 && <><div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-2"><span>{clips.length} imported</span><label className="flex items-center gap-2">Use<input aria-label={`Number of ${title.toLowerCase()} to use`} className="cm-count-input" type="number" min="1" max={clips.length} value={limit || clips.length} disabled={loading || disabled} onChange={e => { const n = Number(e.target.value); onLimit(Number.isInteger(n) && n >= 1 ? Math.min(clips.length, n) : null); }} /></label></div><ul className="mt-2 max-h-40 overflow-y-auto">{clips.map((clip, index) => <li key={clip.id} className={`flex items-center gap-2 border-b border-line/60 py-2 ${index >= selectedCount ? 'opacity-40' : ''}`}><Check size={11} className="shrink-0 text-ink-3" /><div className="min-w-0 flex-1"><p className="truncate text-xs" title={clip.path}>{clip.name}</p><p className="text-[10px] text-ink-3">{clip.duration.toFixed(1)}s · {clip.video ? 'Video' : 'Audio'}</p></div><button type="button" disabled={loading || disabled} onClick={() => onRemove(clip.id)} className="rounded p-2 text-ink-3 hover:text-danger" aria-label={`Remove ${clip.name}`}><X size={13} /></button></li>)}</ul></>}
  </section>;
}
