import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { normalizeBoard } from '../src/design/board/schema.js';
import { AnalysisError, analyzeTranscript, createLlmCache, makeWindows } from '../src/services/content/analysis/analyze.js';
import { boardMatchesFor, normalizeCandidate, sameIdea } from '../src/services/content/analysis/candidate.js';
import { ANALYSIS_SYSTEM, buildAnalysisPrompt } from '../src/services/content/analysis/prompts.js';
import { detectRetakeSignals, enforceRetakes, flagText } from '../src/services/content/analysis/retakeSignals.js';
import { buildUtterances } from '../src/services/content/analysis/utterances.js';
import { buildBoardIndex } from '../src/services/content/boardIndex.js';
import { tallyBoard } from '../src/services/content/boardTally.js';
import { normalizeTranscript } from '../src/services/transcription/transcriptSchema.js';

/** Sentences -> a transcript: 0.4 s a word, a pause between sentences. `gaps[i]` overrides the pause after sentence i. */
function transcriptOf(sentences, { gap = 0.8, gaps = {} } = {}) {
  let t = 0;
  const segments = sentences.map((text, id) => {
    const words = text.split(/\s+/).map((w) => {
      const word = { word: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.4) * 100) / 100, probability: 0.9 };
      t += 0.4;
      return word;
    });
    t += gaps[id] ?? gap;
    return { id, start: words[0].start, end: words[words.length - 1].end, text, words };
  });
  return normalizeTranscript({ language: 'en', duration: t, segments });
}

const TALK = [
  'Welcome back to the channel everybody today.', //                                 u0
  'Most HVAC owners think, sorry.', //                                               u1  abandoned
  'Let me say that again.', //                                                       u2  restart marker
  'Most HVAC owners think they need more website traffic.', //                       u3
  'But that is usually not the problem at all for them.', //                         u4
  'The problem is what happens after somebody lands on your page.', //               u5
  'If they cannot find a phone number in five seconds they leave.', //              u6
  'So the leak is between the website and the lead every single time.', //          u7
  'Fix that first and your traffic finally pays for itself.', //                     u8
  'Anyway that is the idea and now I want to talk about something else entirely.', // u9
];

function prepare(sentences = TALK, opts) {
  const transcript = transcriptOf(sentences, opts);
  const { utterances, words } = buildUtterances(transcript);
  const signals = detectRetakeSignals(utterances, words);
  return { transcript, utterances, words, signals };
}

/* ------------------------------- utterances ------------------------------- */

test('utterances end at sentence punctuation or a pause, and glue split numbers', () => {
  const t = normalizeTranscript({
    duration: 20,
    segments: [{
      start: 0, end: 20, text: 'x',
      words: [
        { word: 'It', start: 0, end: 0.2 }, { word: 'is', start: 0.2, end: 0.4 }, { word: '8', start: 0.4, end: 0.6 }, { word: '.32', start: 0.6, end: 0.8 },
        { word: 'tonight', start: 0.8, end: 1.2 }, { word: 'Then', start: 3.0, end: 3.3 }, { word: 'quiet.', start: 3.3, end: 3.8 }, { word: 'Done.', start: 4.0, end: 4.3 },
      ],
    }],
  });
  const { utterances } = buildUtterances(t);
  assert.deepEqual(utterances.map((u) => u.text), ['It is 8.32 tonight', 'Then quiet.', 'Done.']);
  assert.equal(utterances[0].key, 'u0');
});

/* --------------------------------- signals -------------------------------- */

test('a stumble, an announcement and the clean retake are told apart', () => {
  const { utterances, signals } = prepare();
  const types = (i) => signals[i].map((s) => s.type);
  assert.deepEqual(types(1), ['abandoned', 'repeated_opening']); // trails off into "sorry" AND u3 starts the same way
  assert.deepEqual(types(2), ['restart_marker']);
  assert.deepEqual(types(3), []);
  assert.match(utterances[1].text, /sorry/);
});

test('a false start is linked to the retake that supersedes it', () => {
  const { signals } = prepare([
    'Most HVAC owners think they need',
    'Most HVAC owners think they need more website traffic and that is wrong.',
    'Nothing else to say here for now my friend.',
  ]);
  const flag = signals[0].find((s) => s.type === 'repeated_opening');
  assert.equal(flag.supersededBy, 1);
  assert.match(flagText(signals[0]), /repeated-in:u1/);
});

test('a rhetorical repeat of a short sentence is not a retake', () => {
  const { signals } = prepare(['She leaves the page quickly.', 'She leaves the page quickly.', 'Then the next customer arrives on the site.']);
  assert.ok(!signals[0].some((s) => s.type === 'repeated_opening'));
});

test('fillers and long mid-sentence pauses are flagged; restarts are enforced', () => {
  const { signals } = prepare(['So um uh the thing is this is important.', 'Let me say that again.', 'Fine.']);
  assert.ok(signals[0].some((s) => s.type === 'filler_burst'));
  const drops = enforceRetakes(new Set([0, 1, 2]), signals);
  assert.equal(drops.get(1), 'restart_marker');
  assert.equal(drops.has(0), false);
});

/* -------------------------------- candidates ------------------------------ */

const ctxFor = (p, extra = {}) => ({ utterances: p.utterances, words: p.words, signals: p.signals, sourceHash: 'abc', model: 'stub', ...extra });
const GOOD = {
  title: 'Why more traffic will not fix your leads',
  topic: 'Lead Generation',
  reason: 'Reframes a traffic problem as a conversion problem.',
  scores: { hook: 9, clarity: 8, value: 8, audienceRelevance: 9 },
  segments: [
    { from: 'u1', to: 'u2', action: 'discard', reason: 'abandoned_take' },
    { from: 'u3', to: 'u8', action: 'keep', reason: 'clean_retake' },
  ],
};

test('a valid answer becomes a candidate with real times, cuts and a stable id', () => {
  const p = prepare();
  const { candidate: c } = normalizeCandidate(GOOD, ctxFor(p));
  assert.equal(c.title, GOOD.title);
  assert.equal(c.topic, 'lead-generation');
  assert.equal(c.status, 'pending');
  assert.match(c.id, /^c_[a-f0-9]{10}$/);
  assert.deepEqual(c.sourceSegments.map((s) => s.action), ['discard', 'keep']);

  // Times come from the words, not the model: the clip opens just before "Most" in u3 and closes just after "itself." in u8.
  const first = p.words[p.utterances[3].firstWord];
  const last = p.words[p.utterances[8].lastWord];
  const keep = c.sourceSegments[1];
  assert.ok(keep.start <= first.start && keep.start >= p.words[p.utterances[2].lastWord].end);
  assert.ok(keep.end >= last.end && keep.end <= p.words[p.utterances[9].firstWord].start);
  // The clip starts where the kept speech starts; the cut that precedes it is recorded, but is not part of the clip.
  assert.equal(c.sourceStart, keep.start);
  assert.equal(c.sourceSegments[0].action, 'discard');
  assert.ok(c.sourceSegments[0].end <= c.sourceStart + 0.001);
  // The cut sits in the middle of the silence before the clean take, so neither take is clipped.
  const between = (p.words[p.utterances[2].lastWord].end + first.start) / 2;
  assert.ok(Math.abs(keep.start - between) < 0.01);
  assert.match(c.hook, /^Most HVAC owners think they need more website traffic/);
  assert.equal(c.discarded[0].text, 'Most HVAC owners think, sorry. Let me say that again.');
  assert.equal(normalizeCandidate(GOOD, ctxFor(p)).candidate.id, c.id); // same inputs, same id
});

test('a restart announcement the model forgot to cut is cut anyway, and a clip never starts on a failed take', () => {
  const p = prepare();
  const sloppy = { ...GOOD, segments: [{ from: 'u1', to: 'u8', action: 'keep', reason: 'main' }] };
  const { candidate: c } = normalizeCandidate(sloppy, ctxFor(p));
  assert.ok(c.discarded.some((d) => d.text.includes('Let me say that again')));
  assert.ok(!c.text.includes('Let me say that again'));
});

test('a false start is cut when its clean replacement is kept', () => {
  const p = prepare([
    'Most HVAC owners think they need',
    'Most HVAC owners think they need more website traffic and that is wrong.',
    'The real problem is the path from the search to the sale every time.',
    'Fix that path and the same traffic produces much more revenue overall.',
  ]);
  const raw = { ...GOOD, segments: [{ from: 'u0', to: 'u3', action: 'keep', reason: 'main' }] };
  const { candidate: c } = normalizeCandidate(raw, ctxFor(p));
  assert.ok(c);
  assert.ok(!c.text.startsWith('Most HVAC owners think they need Most'));
  assert.equal(c.sourceSegments[0].action, 'discard');
  assert.equal(c.sourceSegments[0].reason, 'abandoned_take');
});

test('skipped utterances are cut, and natural pauses inside kept speech are left alone', () => {
  const p = prepare(TALK, { gaps: { 5: 2.5 } }); // a deliberate 2.5 s beat inside the clip
  const raw = { ...GOOD, segments: [{ from: 'u3', to: 'u4', action: 'keep' }, { from: 'u6', to: 'u8', action: 'keep' }] };
  const { candidate: c } = normalizeCandidate(raw, ctxFor(p));
  assert.ok(c.discarded.some((d) => d.from === 'u5' && d.reason === 'cut'));
  const big = p.words[p.utterances[6].firstWord].start - p.words[p.utterances[5].lastWord].end;
  assert.ok(big >= 2.4); // the beat exists in the source; keeping u5 would have kept it
  const kept = prepare(TALK, { gaps: { 5: 2.5 } });
  const whole = normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u8', action: 'keep' }] }, ctxFor(kept)).candidate;
  assert.equal(whole.sourceSegments.length, 1); // one continuous keep, pause included
});

test('bad answers are refused with a reason and never throw', () => {
  const p = prepare();
  const ctx = ctxFor(p);
  assert.match(normalizeCandidate(null, ctx).issue, /not an object/);
  assert.match(normalizeCandidate({ ...GOOD, title: '' }, ctx).issue, /no title/);
  assert.match(normalizeCandidate({ ...GOOD, scores: { hook: 'x' } }, ctx).issue, /scores/);
  assert.match(normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u99', action: 'keep' }] }, ctx).issue, /unknown utterance/);
  assert.match(normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u5', action: 'keep' }, { from: 'u4', to: 'u6', action: 'keep' }] }, ctx).issue, /overlap/);
  assert.match(normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u4', action: 'discard' }] }, ctx).issue, /nothing is kept/);
  assert.match(normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u3', action: 'keep' }] }, ctx).issue, /only .*s of speech/);
  assert.match(normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u4', action: 'teleport' }] }, ctx).issue, /unknown/);
});

test('a clip that is too long for a short is refused', () => {
  const long = Array.from({ length: 40 }, (_, i) => `This is utterance number ${i} and it has quite a few words in it.`);
  const p = prepare(long);
  assert.match(normalizeCandidate({ ...GOOD, segments: [{ from: 'u0', to: 'u39', action: 'keep' }] }, ctxFor(p)).issue, /too long/);
});

test('board matches list the blocks and parts the board shows during the kept speech', () => {
  const p = prepare();
  const board = normalizeBoard({
    title: 'T',
    sections: [
      { title: 'LEAK', blocks: [{ type: 'bigtype', text: 'THE LEAK' }, { type: 'flow', direction: 'down', steps: ['WEBSITE', 'LEAD'] }] },
      { title: 'ABSENT', blocks: [{ type: 'statement', text: 'Quantum dolphin pricing' }] },
    ],
  });
  const tally = tallyBoard(buildBoardIndex(board), p.transcript);
  const { candidate: c } = normalizeCandidate(GOOD, ctxFor(p, { tally }));
  assert.ok(c.boardMatches.length >= 1);
  const m = c.boardMatches[0];
  assert.equal(m.sectionId, 's1');
  assert.match(m.blockId, /^s1\.b\d$/);
  assert.ok(m.confidence > 0 && m.confidence <= 1);
  // Hits outside the kept stretch do not count.
  assert.deepEqual(boardMatchesFor(tally, [{ start: 0, end: 0.1, action: 'keep' }]), []);
});

test('two clips are the same idea when they overlap or say nearly the same words', () => {
  const a = { sourceStart: 10, sourceEnd: 50, duration: 40, text: 'the leak is between the website and the lead every time' };
  assert.equal(sameIdea(a, { sourceStart: 30, sourceEnd: 70, duration: 40, text: 'something else completely different here today' }), true);
  assert.equal(sameIdea(a, { sourceStart: 500, sourceEnd: 540, duration: 40, text: 'the leak is between the website and the lead every time' }), true);
  assert.equal(sameIdea(a, { sourceStart: 500, sourceEnd: 540, duration: 40, text: 'pricing pages should show a number not a form' }), false);
});

/* --------------------------------- prompts -------------------------------- */

test('the prompt teaches the retake rules and shows flags, the board outline and only utterance ids', () => {
  assert.match(ANALYSIS_SYSTEM, /Prefer the LATER, clean, complete take/);
  assert.match(ANALYSIS_SYSTEM, /Never write times/);
  assert.match(ANALYSIS_SYSTEM, /NO quota/);
  const p = prepare();
  const { user } = buildAnalysisPrompt({ title: 'Ep', audience: '', boardLines: ['s1 THE LEAK: leak - said around 0:20'], utterances: p.utterances, signals: p.signals, from: 0, to: p.utterances.length - 1, totalMinutes: 1, windowIndex: 0, windowCount: 1 });
  assert.match(user, /s1 THE LEAK/);
  assert.match(user, /u1 \[0:\d\d-0:\d\d \d+s\] Most HVAC owners think, sorry\. ⚑abandoned/);
  assert.match(user, /u2 .* ⚑restart-marker/);
  assert.match(user, /small business owners/);
});

/* --------------------------------- windows -------------------------------- */

test('a short transcript is one window; a long one is overlapping windows that cover everything', () => {
  const small = prepare().utterances;
  assert.equal(makeWindows(small).length, 1);
  const long = prepare(Array.from({ length: 300 }, (_, i) => `Sentence number ${i} says a handful of ordinary words about nothing in particular.`)).utterances;
  const windows = makeWindows(long, { size: 800, overlap: 100 });
  assert.ok(windows.length > 2);
  assert.equal(windows[0].from, 0);
  assert.equal(windows[windows.length - 1].to, long.length - 1);
  for (let i = 1; i < windows.length; i += 1) {
    assert.ok(windows[i].from > windows[i - 1].from, 'always moves forward');
    assert.ok(windows[i].from <= windows[i - 1].to + 1, 'no gap between windows');
  }
});

/* --------------------------------- analyze -------------------------------- */

function stub(handler, { live = true } = {}) {
  const calls = [];
  return { live, model: 'stub', calls, async completeJSON(req) { calls.push(req); return handler(req, calls.length); } };
}

test('analysis returns validated candidates, the retakes it saw and what it dropped', async () => {
  const p = prepare();
  const weak = { ...GOOD, title: 'A weak one', scores: { hook: 4, clarity: 9, value: 9, audienceRelevance: 9 }, segments: [{ from: 'u5', to: 'u8', action: 'keep' }] };
  const broken = { ...GOOD, title: 'Broken', segments: [{ from: 'u3', to: 'u99', action: 'keep' }] };
  const provider = stub(() => ({ shorts: [GOOD, weak, broken] }));
  const result = await analyzeTranscript({ transcript: p.transcript, provider, sourceHash: 'abc' });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].title, GOOD.title);
  assert.equal(result.stats.proposed, 3);
  assert.equal(result.stats.lowQuality, 1);
  assert.equal(result.stats.rejected.length, 1);
  assert.equal(result.retakes.length, 1);
  assert.ok(result.retakes[0].types.includes('abandoned') && result.retakes[0].types.includes('restart_marker'));
  assert.ok(result.retakes[0].start < result.retakes[0].end);
  assert.equal(result.candidates[0].rank, 1);
});

test('the same prompt is never sent twice: a second run is served from the cache', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-llm-'));
  const cache = createLlmCache(dir);
  const p = prepare();
  const provider = stub(() => ({ shorts: [GOOD] }));
  const first = await analyzeTranscript({ transcript: p.transcript, provider, cache });
  const second = await analyzeTranscript({ transcript: p.transcript, provider, cache });
  assert.equal(provider.calls.length, 1);
  assert.equal(first.stats.modelCalls, 1);
  assert.equal(second.stats.modelCalls, 0);
  assert.equal(second.stats.cachedWindows, 1);
  assert.deepEqual(second.candidates.map((c) => c.id), first.candidates.map((c) => c.id));
  // A different board outline changes the prompt, so it is asked again.
  const board = buildBoardIndex(normalizeBoard({ title: 'T', sections: [{ title: 'S', blocks: [{ type: 'statement', text: 'hello world today' }] }] }));
  await analyzeTranscript({ transcript: p.transcript, provider, cache, boardIndex: board });
  assert.equal(provider.calls.length, 2);
});

test('long recordings are analysed in windows, in parallel, and the same idea found twice is kept once', async () => {
  const filler = (n, tag) => Array.from({ length: n }, (_, i) => `${tag} filler sentence ${i} chatters on about weather and holidays and nothing else.`);
  const sentences = [...filler(60, 'a'), ...TALK, ...filler(120, 'b'), ...TALK, ...filler(60, 'c')];
  const p = prepare(sentences);
  const provider = stub((req) => {
    // Answer with the clip wherever the window shows the "Most HVAC owners think they need more" utterance.
    const m = [...req.user.matchAll(/^u(\d+) .*Most HVAC owners think they need more website traffic/gm)];
    return { shorts: m.map(([, id]) => ({ ...GOOD, segments: [{ from: `u${Number(id) - 2}`, to: `u${Number(id) - 2}`, action: 'discard', reason: 'abandoned_take' }, { from: `u${id}`, to: `u${Number(id) + 5}`, action: 'keep' }] })) };
  });
  const result = await analyzeTranscript({ transcript: p.transcript, provider, windowOptions: { size: 500, overlap: 80 }, concurrency: 3 });
  assert.ok(result.stats.windows >= 3);
  assert.equal(provider.calls.length, result.stats.windows);
  // Two real occurrences (the idea is said twice, far apart) become one: the later one is a duplicate of the earlier.
  assert.equal(result.candidates.length, 1);
  assert.ok(result.stats.duplicates >= 1);
});

test('one window failing is a warning; every window failing is an error', async () => {
  const p = prepare(Array.from({ length: 200 }, (_, i) => `Sentence ${i} has a handful of ordinary words in it for the test.`));
  let n = 0;
  const flaky = stub(() => { n += 1; if (n === 2 || n === 3) throw new Error('timeout'); return { shorts: [] }; });
  const partial = await analyzeTranscript({ transcript: p.transcript, provider: flaky, windowOptions: { size: 300, overlap: 40 }, concurrency: 1 });
  assert.ok(partial.warnings.length >= 1);
  assert.match(partial.warnings[0], /could not be analysed/);

  const dead = stub(() => { throw new Error('boom'); });
  await assert.rejects(() => analyzeTranscript({ transcript: p.transcript, provider: dead }), (e) => e instanceof AnalysisError && e.status === 502);
});

test('without a live model, analysis says exactly what is missing; a bad key stops at once', async () => {
  const p = prepare();
  await assert.rejects(() => analyzeTranscript({ transcript: p.transcript, provider: stub(() => ({}), { live: false }) }), (e) => e.status === 503 && /DeepSeek key/.test(e.message));
  const bad = stub(() => { throw Object.assign(new Error('no'), { status: 401 }); });
  await assert.rejects(() => analyzeTranscript({ transcript: p.transcript, provider: bad }), (e) => e.status === 401);
  assert.equal(bad.calls.length, 1); // not retried, not repeated for every window
});

test('an answer that is not a list of shorts yields none rather than an error', async () => {
  const p = prepare();
  const result = await analyzeTranscript({ transcript: p.transcript, provider: stub(() => ({ nonsense: true })) });
  assert.deepEqual(result.candidates, []);
});

/* ------------------------------ in the service ----------------------------- */

import { Readable } from 'node:stream';
import { ContentError, createContentService, mergeCandidates } from '../src/services/content/contentService.js';
import { createSessionStore } from '../src/services/content/sessionStore.js';

async function serviceWith(provider, transcript = prepare().transcript) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apollo-an-'));
  const cache = new Map();
  const transcription = {
    async status() { return { available: true }; },
    async getCached(hash) { return cache.has(hash) ? { transcript: cache.get(hash) } : null; },
    async transcribeVideo(_p, opts) { cache.set(opts.sourceHash, transcript); return { sourceHash: opts.sourceHash, cached: false, transcript }; },
  };
  const service = createContentService({
    store: createSessionStore(path.join(dir, 'sessions')), transcription, getProvider: () => provider, llmCache: createLlmCache(path.join(dir, 'llm')), log: { error() {} },
  });
  const { id } = await service.createSession({ title: 'Ep' });
  await service.attachVideo(id, { body: Readable.from([Buffer.from('video')]), fileName: 'ep.mp4' });
  // These tests are about finding shorts; the AI director has its own tests, so keep it out of the call counts.
  await service.updateSettings(id, { aiDirector: false });
  return { service, id };
}

const until = async (check, ms = 6000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

test('Process video runs transcription, tally and the analysis, and stores the candidates on the session', async () => {
  const provider = stub(() => ({ shorts: [GOOD] }));
  const { service, id } = await serviceWith(provider);
  await service.process(id);
  const s = await until(async () => { const x = await service.getSession(id); return x.analysis.status === 'complete' && x; });
  assert.equal(s.candidates.length, 1);
  assert.equal(s.counts.candidates, 1);
  assert.equal(s.counts.approved, 0);
  assert.equal(s.candidates[0].status, 'pending');
  assert.equal(s.analysis.modelCalls, 1);
  const detail = await service.getAnalysis(id);
  assert.equal(detail.retakes.length, 1);
  assert.equal(detail.stats.accepted, 1);
  // The list view does not carry every clip's transcript.
  assert.equal((await service.listSessions())[0].candidates, undefined);
});

test('re-running the analysis on unchanged input costs no model calls; force re-asks from the cache', async () => {
  const provider = stub(() => ({ shorts: [GOOD] }));
  const { service, id } = await serviceWith(provider);
  await service.process(id);
  await until(async () => (await service.getSession(id)).analysis.status === 'complete');
  await service.analyze(id);
  await until(async () => (await service.getSession(id)).analysis.status === 'complete');
  assert.equal(provider.calls.length, 1);
  await service.analyze(id, { force: true });
  await until(async () => { const x = await service.getSession(id); return x.analysis.status === 'complete' && x.analysis.cachedWindows === 1 && x; });
  assert.equal(provider.calls.length, 1); // same prompt: answered from disk
});

test('analyze explains what is missing: no transcript, or no model', async () => {
  const { service, id } = await serviceWith(stub(() => ({ shorts: [] })));
  await assert.rejects(() => service.analyze(id), (e) => e instanceof ContentError && e.status === 409);
  const none = await serviceWith(stub(() => ({}), { live: false }));
  await none.service.process(none.id);
  const done = await until(async () => { const x = await none.service.getSession(none.id); return x.transcription.status === 'complete' && x.analysis.reason && x; });
  assert.equal(done.analysis.status, 'not_started');
  assert.match(done.analysis.reason, /DeepSeek key/);
  await assert.rejects(() => none.service.analyze(none.id), (e) => e.status === 503);
});

test('a model failure is recorded as a sentence on the session and does not undo the transcript', async () => {
  const provider = stub(() => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); });
  const { service, id } = await serviceWith(provider);
  await service.process(id);
  const s = await until(async () => { const x = await service.getSession(id); return x.analysis.status === 'failed' && x; });
  assert.equal(s.transcription.status, 'complete');
  assert.match(s.analysis.error, /looking for shorts/);
  assert.ok(!/401|Unauthorized/.test(s.analysis.error)); // provider details never reach the page
});

test('re-analysis keeps a reviewed clip\'s status; a reviewed clip that vanished is kept as stale', () => {
  const clip = (id, status, start) => ({ id, status, sourceStart: start, title: id });
  const merged = mergeCandidates(
    [clip('a', 'approved', 10), clip('b', 'rejected', 50), clip('c', 'pending', 90), { ...clip('d', 'approved', 5), reviewedAt: 'then', note: 'great' }],
    [{ ...clip('a', 'pending', 10), title: 'a-new' }, clip('d', 'pending', 5), clip('e', 'pending', 70)]
  );
  const byId = Object.fromEntries(merged.map((c) => [c.id, c]));
  assert.equal(byId.a.status, 'approved');
  assert.equal(byId.a.title, 'a-new'); // fresh content, kept verdict
  assert.equal(byId.d.note, 'great');
  assert.equal(byId.b.stale, true); // reviewed, no longer found
  assert.equal(byId.c, undefined); // unreviewed and gone
  assert.equal(byId.e.status, 'pending');
  assert.deepEqual(merged.map((c) => c.id), ['d', 'a', 'b', 'e']); // chronological
});

test('linking a board after analysis refreshes each clip\'s board matches without asking the model again', async () => {
  const provider = stub(() => ({ shorts: [GOOD] }));
  const { service, id } = await serviceWith(provider);
  await service.process(id);
  await until(async () => (await service.getSession(id)).analysis.status === 'complete');
  assert.deepEqual((await service.getSession(id)).candidates[0].boardMatches, []);

  const board = normalizeBoard({ title: 'T', sections: [{ title: 'LEAK', blocks: [{ type: 'flow', direction: 'down', steps: ['WEBSITE', 'LEAD', 'PHONE NUMBER', 'LEAK', 'TRAFFIC', 'PAGE', 'CUSTOMER', 'REVENUE'] }] }] });
  const linked = await service.attachBoard(id, { boardId: 'b', spec: board });
  assert.ok(linked.candidates[0].boardMatches.length >= 1);
  assert.equal(linked.candidates[0].boardMatches[0].sectionId, 's1');
  assert.equal(provider.calls.length, 1);
});

/* ------------------------ unpunctuated runs (real Whisper) ------------------------ */

/** Words with no punctuation and no pauses, the way Whisper sometimes returns a stretch of speech. */
function runOn(text, { pauseAt = {} } = {}) {
  let t = 0;
  const words = text.split(/\s+/).map((w, i) => {
    t += pauseAt[i] || 0;
    const word = { word: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.3) * 100) / 100, probability: 0.9 };
    t += 0.3;
    return word;
  });
  return normalizeTranscript({ duration: t, segments: [{ id: 0, start: 0, end: t, text: text, words }] });
}

test('a stutter, a "sorry", the announcement and the retake are separated even with no punctuation or pauses', () => {
  const t = runOn('and there is a massive graveyard between those two sentences because most sales uh because most sales arent sorry let me say that again because most sales arent lost at the moment somebody says no they are lost much earlier');
  const { utterances, words } = buildUtterances(t);
  const signals = detectRetakeSignals(utterances, words);
  const texts = utterances.map((u) => u.text);
  assert.ok(texts.includes('let me say that again'), `announcement on its own: ${JSON.stringify(texts)}`);
  const stumble = utterances.findIndex((u) => /arent sorry$/.test(u.text));
  assert.ok(stumble > 0, 'the stumble ends where "sorry" ends');
  assert.ok(signals[stumble].some((s) => s.type === 'abandoned'));
  const marker = utterances.findIndex((u) => u.text === 'let me say that again');
  assert.ok(signals[marker].some((s) => s.type === 'restart_marker'));
  // The false start is linked to the clean retake that follows the announcement.
  const retake = utterances.findIndex((u) => u.text.startsWith('because most sales arent lost'));
  assert.ok(signals.slice(0, marker).some((list) => list.some((s) => s.type === 'repeated_opening' && s.supersededBy === retake)));
});

test('a phrase said twice in a row is split into a false start and its retake', () => {
  const t = runOn('lets use one person her name is sarah its her name is sarah its eight thirty two on a tuesday night and her air conditioner stops working');
  const { utterances, words } = buildUtterances(t);
  const signals = detectRetakeSignals(utterances, words);
  const first = utterances.findIndex((u) => u.text === 'her name is sarah its');
  assert.ok(first >= 0, JSON.stringify(utterances.map((u) => u.text)));
  assert.ok(signals[first].some((s) => s.type === 'repeated_opening'));
});

test('a very long run with no break at all is cut at its biggest pause so it stays editable', () => {
  const text = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
  const { utterances } = buildUtterances(runOn(text, { pauseAt: { 40: 0.25, 80: 0.2 } }));
  assert.ok(utterances.length >= 2);
  assert.ok(Math.max(...utterances.map((u) => u.lastWord - u.firstWord + 1)) <= 60);
});

test('restart announcements are enforced even when they arrive inside a long unpunctuated stretch', () => {
  const sentences = TALK.map((s) => s.replace(/[.,]/g, '').toLowerCase());
  const t = runOn(sentences.join(' '));
  const { utterances, words } = buildUtterances(t);
  const signals = detectRetakeSignals(utterances, words);
  const marker = utterances.findIndex((u) => /let me say that again/.test(u.text));
  assert.ok(marker >= 0);
  assert.ok(enforceRetakes(new Set(utterances.map((u) => u.id)), signals).has(marker));
});

/* --------------------------- chains of false starts --------------------------- */

test('a chain of false starts (copy 1 -> copy 2 -> the retake) is cut back to the clean take', () => {
  const t = runOn('then the technician uh then the technician shows sorry let me say that again then the technician shows up and asks again about the problem');
  const { utterances, words } = buildUtterances(t);
  const signals = detectRetakeSignals(utterances, words);
  const retake = utterances.findIndex((u) => u.text.startsWith('then the technician shows up'));
  assert.ok(retake > 0);
  // The model, careless, keeps everything.
  const kept = new Set(utterances.map((u) => u.id));
  const drops = enforceRetakes(kept, signals);
  const survivors = [...kept].filter((id) => !drops.has(id));
  assert.deepEqual(survivors, [retake]);
});

test('a stumble followed at once by an announcement is certainly abandoned, and skipped lines say why', () => {
  const p = prepare();
  assert.equal(p.signals[1].find((s) => s.type === 'abandoned').certain, true);
  const raw = { ...GOOD, segments: [{ from: 'u3', to: 'u4', action: 'keep' }, { from: 'u6', to: 'u8', action: 'keep' }] };
  const { candidate } = normalizeCandidate(raw, ctxFor(p));
  assert.equal(candidate.sourceSegments.find((s) => s.action === 'discard').reason, 'cut'); // u5 had no signal: an honest "cut"
  const marker = normalizeCandidate({ ...GOOD, segments: [{ from: 'u3', to: 'u3', action: 'keep' }, { from: 'u5', to: 'u8', action: 'keep' }] }, ctxFor(p));
  assert.ok(marker.candidate);
});

/* ------------------------------ span + cuts format ------------------------------ */

const SPAN = {
  title: 'Why more traffic will not fix your leads',
  topic: 'lead-generation',
  reason: 'Reframes a traffic problem as a conversion problem.',
  scores: { hook: 9, clarity: 8, value: 8, audienceRelevance: 9 },
  from: 'u1',
  to: 'u8',
  cuts: [{ from: 'u1', to: 'u2', reason: 'abandoned_take' }],
};

test('the span-and-cuts answer becomes the same candidate as the segment form', () => {
  const p = prepare();
  const a = normalizeCandidate(SPAN, ctxFor(p)).candidate;
  const b = normalizeCandidate(GOOD, ctxFor(p)).candidate;
  assert.deepEqual(a.sourceSegments.map((s) => [s.action, s.reason]), [['discard', 'abandoned_take'], ['keep', 'clean_retake']]);
  assert.equal(a.sourceStart, b.sourceStart);
  assert.equal(a.sourceEnd, b.sourceEnd);
  assert.equal(a.id, b.id);
});

test('a span with no cuts keeps everything in it; an aside cut in the middle splits the clip in two', () => {
  const p = prepare();
  const whole = normalizeCandidate({ ...SPAN, from: 'u3', cuts: [] }, ctxFor(p)).candidate;
  assert.deepEqual(whole.sourceSegments.map((s) => s.action), ['keep']);
  const cut = normalizeCandidate({ ...SPAN, from: 'u3', cuts: [{ from: 'u5', to: 'u5', reason: 'aside' }] }, ctxFor(p)).candidate;
  assert.deepEqual(cut.sourceSegments.map((s) => [s.action, s.reason]), [['keep', 'main'], ['discard', 'aside'], ['keep', 'main']]);
});

test('a cut cannot reach outside its span, and cannot be used to leap across the video', () => {
  const p = prepare();
  assert.match(normalizeCandidate({ ...SPAN, from: 'u3', cuts: [{ from: 'u1', to: 'u2' }] }, ctxFor(p)).issue, /outside the span/);
  assert.match(normalizeCandidate({ ...SPAN, cuts: [{ from: 'u2', to: 'u99' }] }, ctxFor(p)).issue, /outside the span/);
  assert.match(normalizeCandidate({ ...SPAN, from: 'u8', to: 'u3' }, ctxFor(p)).issue, /unknown utterance id/);
  // A giant "cut" that leaves only two seconds is refused by the length rule, not silently accepted.
  assert.match(normalizeCandidate({ ...SPAN, from: 'u0', to: 'u3', cuts: [{ from: 'u0', to: 'u2' }] }, ctxFor(p)).issue, /only .*s of speech/);
});

test('an unknown cut reason is replaced by what the detector saw', () => {
  const p = prepare();
  const c = normalizeCandidate({ ...SPAN, cuts: [{ from: 'u1', to: 'u2', reason: 'because' }] }, ctxFor(p)).candidate;
  assert.ok(['abandoned_take', 'restart_marker'].includes(c.sourceSegments[0].reason));
});

test('the prompt asks for a span and cuts, not for segments', () => {
  assert.match(ANALYSIS_SYSTEM, /SPAN of consecutive utterances/);
  assert.match(ANALYSIS_SYSTEM, /Never use a cut to skip over good content/);
  assert.doesNotMatch(ANALYSIS_SYSTEM, /"segments"/);
});
