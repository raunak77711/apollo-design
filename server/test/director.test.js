import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBoard } from '../src/design/board/schema.js';
import { buildBoardIndex } from '../src/services/content/boardIndex.js';
import { tallyBoard } from '../src/services/content/boardTally.js';
import { baselineDirector } from '../src/services/content/director/baseline.js';
import { buildClip, clipToSource, keepSegments, sourceToClip } from '../src/services/content/director/clipTimeline.js';
import { clipBoardBlocks } from '../src/services/content/director/clipBoard.js';
import { contextFor, directCandidate, importTrack } from '../src/services/content/director/directorService.js';
import { DIRECTOR_SYSTEM, buildDirectorPrompt, transcriptLines } from '../src/services/content/director/llmDirector.js';
import { blocksIndex, findNumber, findPhrase, normalizeDirectorTrack } from '../src/services/content/director/schema.js';
import { normalizeTranscript } from '../src/services/transcription/transcriptSchema.js';

/** 0.4 s a word, 0.8 s between sentences. */
function transcriptOf(sentences) {
  let t = 0;
  const segments = sentences.map((text, id) => {
    const words = text.split(/\s+/).map((w) => {
      const word = { word: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.4) * 100) / 100, probability: 0.9 };
      t += 0.4;
      return word;
    });
    t += 0.8;
    return { id, start: words[0].start, end: words[words.length - 1].end, text, words };
  });
  return normalizeTranscript({ language: 'en', duration: t, segments });
}

const SENTENCES = [
  'Okay so this is the part I stumbled on badly.', //                                  0  (cut)
  'Most owners think they need more website traffic every single month.', //            1
  'But traffic is not the problem and it never was for them.', //                       2
  'They paid $10,000 for ads and the leak was somewhere else entirely.', //              3
  'The leak happens between the website and the lead every single time.', //            4
  'Fix that path first and the same traffic produces three times more revenue.', //     5
  'Think of your website like a salesman who works 24/7 without a day off.', //         6
];

const BOARD = normalizeBoard({
  title: 'T',
  sections: [
    { title: 'LEAK', blocks: [{ type: 'bigtype', text: 'THE LEAK' }, { type: 'flow', direction: 'down', steps: ['WEBSITE', 'LEAD', 'PHONE NUMBER', 'FORM', 'TRAFFIC', 'REVENUE', 'PAGE', 'CUSTOMER'] }] },
    { title: 'SALESMAN', blocks: [{ type: 'statement', text: 'A salesman who never sleeps' }, { type: 'cards', items: ['PRICE', 'SPEED', 'TRUST'] }] },
  ],
});

function setup() {
  const transcript = transcriptOf(SENTENCES);
  const first = transcript.segments[1].words[0].start;
  const last = transcript.segments[6].words.at(-1).end;
  const candidate = {
    id: 'c_test', title: 'Traffic is not the problem',
    sourceSegments: [
      { start: 0, end: first - 0.1, action: 'discard', reason: 'false_start' },
      { start: first - 0.1, end: last + 0.2, action: 'keep', reason: 'main' },
    ],
  };
  const snapshot = { spec: BOARD };
  const index = buildBoardIndex(BOARD);
  const tally = tallyBoard(index, transcript);
  return { transcript, candidate, snapshot, index, tally };
}

/* -------------------------------- clip timeline -------------------------------- */

test('a short with a cut in the middle closes the gap: clip time is continuous', () => {
  const transcript = transcriptOf(SENTENCES);
  const s2 = transcript.segments[2];
  const s3 = transcript.segments[3];
  const candidate = {
    sourceSegments: [
      { start: transcript.segments[1].start, end: s2.end + 0.2, action: 'keep' },
      { start: s2.end + 0.2, end: s3.start - 0.1, action: 'discard' },
      { start: s3.start - 0.1, end: s3.end + 0.2, action: 'keep' },
    ],
  };
  const clip = buildClip(candidate, transcript);
  assert.equal(clip.segments.length, 2);
  assert.equal(clip.segments[1].clipStart, clip.segments[0].clipEnd);
  assert.ok(Math.abs(clip.duration - (clip.segments[0].end - clip.segments[0].start + clip.segments[1].end - clip.segments[1].start)) < 0.01);
  // Words keep their order and have no gap where the cut was.
  assert.ok(clip.words.every((w, i) => i === 0 || w.start >= clip.words[i - 1].end - 0.001));
  assert.equal(clip.words[0].word, 'Most');
  assert.equal(sourceToClip(clip.segments, (s2.end + s3.start) / 2), null); // inside the cut
  assert.equal(clipToSource(clip.segments, 0), clip.segments[0].start);
  assert.ok(Math.abs(sourceToClip(clip.segments, s3.start) - clip.segments[1].clipStart) < 0.2);
  assert.deepEqual(keepSegments({ sourceSegments: [{ start: 1, end: 2, action: 'discard' }] }), []);
});

/* ---------------------------------- grounding ---------------------------------- */

test('phrases are found by their real words, stems and all, nearest to the hint', () => {
  const { transcript, candidate } = setup();
  const { words } = buildClip(candidate, transcript);
  const hit = findPhrase(words, 'TRAFFIC');
  assert.equal(words[hit.from].word, 'traffic');
  const second = findPhrase(words, 'traffic', words.at(-5).start);
  assert.ok(second.start > hit.start); // the later mention when the hint points there
  assert.equal(findPhrase(words, 'leaks').from, findPhrase(words, 'leak').from); // stem match
  assert.equal(findPhrase(words, 'unicorns'), null);
  assert.equal(findPhrase(words, ''), null);
});

test('a figure is matched by its digits however it is written', () => {
  const { transcript, candidate } = setup();
  const { words } = buildClip(candidate, transcript);
  assert.equal(words[findNumber(words, '$10,000').from].word, '$10,000');
  assert.equal(words[findNumber(words, '10000').from].word, '$10,000');
  assert.equal(words[findNumber(words, '24/7').from].word, '24/7');
  assert.equal(findNumber(words, '$99'), null);
});

/* ------------------------------ normalizing a track ----------------------------- */

function ctxOf() {
  const { transcript, candidate, snapshot, tally, index } = setup();
  const { ctx, clip } = contextFor({ candidate, transcript, snapshot, tally });
  return { ctx, clip, index };
}

test('every event type in the vocabulary is accepted, and phrases are re-timed to the real words', () => {
  const { ctx, clip } = ctxOf();
  const blockId = [...ctx.blocks.keys()].find((id) => ctx.blocks.get(id).type === 'flow');
  const { events, issues } = normalizeDirectorTrack({
    events: [
      { type: 'emphasis', at: 0.01, text: 'traffic', strength: 3 }, //            the author's time is wrong: it is ignored
      { type: 'number', at: 99, value: '$10,000', label: 'on ads' },
      { type: 'statement', at: 22, text: 'TRAFFIC ≠ PROBLEM', style: 'inverse' },
      { type: 'camera', at: 5, action: 'punch_in', amount: 9 },
      { type: 'camera', at: 8.5, action: 'return' },
      { type: 'board', at: 25, blockId, animation: 'progressive', duration: 6 },
      { type: 'annotation', at: 0, kind: 'circle', text: 'leak' },
    ],
  }, ctx);
  assert.deepEqual(issues, issues.filter((i) => /outside|dropped/.test(i)));
  const by = (t) => events.find((e) => e.type === t);
  const traffic = clip.words.find((w) => /traffic/i.test(w.word));
  assert.equal(by('emphasis').at, traffic.start); // grounded
  assert.equal(by('emphasis').strength, 3);
  assert.equal(by('statement').style, 'inverse');
  assert.equal(by('camera').amount, 1.25); // clamped: never a face-tight crop
  assert.equal(by('board').blockId, blockId);
  assert.equal(by('annotation').kind, 'circle');
  assert.ok(events.every((e, i) => e.id === `e${i + 1}`));
  assert.ok(events.every((e, i) => i === 0 || e.at >= events[i - 1].at));
});

test('invented or unusable events are dropped with a reason and never throw', () => {
  const { ctx } = ctxOf();
  const { events, issues } = normalizeDirectorTrack([
    { type: 'emphasis', text: 'unicorns' },
    { type: 'emphasis', text: 'traffic is not the problem and it' }, //  four words: too long
    { type: 'number', value: 'lots' },
    { type: 'number', value: '$777' },
    { type: 'board', at: 3, blockId: 's9.b9' },
    { type: 'dance', at: 2 },
    { type: 'camera', at: 2, action: 'spin' },
    { type: 'statement', at: 3 },
    { type: 'comparison', at: 3, left: 'A' },
    'garbage',
    null,
    { type: 'statement', at: 9999, text: 'too late' },
  ], ctx);
  assert.deepEqual(events, []);
  assert.ok(issues.length >= 10);
  assert.ok(issues.some((i) => /unicorns/.test(i)));
  assert.ok(issues.some((i) => /unknown event type/.test(i)));
  assert.deepEqual(normalizeDirectorTrack(null, ctx).events, []);
});

test('camera: a punch is always undone, moves are spaced, and a return needs something to return from', () => {
  const { ctx, clip } = ctxOf();
  const { events, issues } = normalizeDirectorTrack([
    { type: 'camera', at: 1, action: 'return' }, //     nothing to return from
    { type: 'camera', at: 3, action: 'punch_in' },
    { type: 'camera', at: 3.5, action: 'punch_out' }, // too soon
    { type: 'camera', at: 6, action: 'punch_in' }, //   still zoomed: refused
  ], ctx);
  const cams = events.filter((e) => e.type === 'camera');
  assert.deepEqual(cams.map((c) => c.action), ['punch_in', 'return']); // the missing return is supplied
  assert.ok(cams[1].at <= clip.duration);
  assert.ok(issues.length >= 3);
  // punch_out (wider, for the hands) is its own state and also returns.
  const wide = normalizeDirectorTrack([{ type: 'camera', at: 3, action: 'punch_out' }, { type: 'camera', at: 7, action: 'return' }], ctx).events;
  assert.deepEqual(wide.map((c) => c.action), ['punch_out', 'return']);
});

test('one board visual at a time: overlaps are trimmed, and statements cannot hide behind a card', () => {
  const { ctx } = ctxOf();
  const flow = [...ctx.blocks.keys()].find((id) => ctx.blocks.get(id).type === 'flow');
  const stmt = [...ctx.blocks.keys()].find((id) => ctx.blocks.get(id).type === 'cards');
  const { events, issues } = normalizeDirectorTrack([
    { type: 'board', at: 4, blockId: flow, duration: 10 },
    { type: 'board', at: 9, blockId: stmt, duration: 5 },
    { type: 'statement', at: 6, text: 'HIDDEN' },
    { type: 'emphasis', at: 6, text: 'leak', strength: 2 }, //  fine: emphasis also drives caption highlighting
  ], ctx);
  const boards = events.filter((e) => e.type === 'board');
  assert.equal(boards.length, 2);
  assert.ok(boards[0].at + boards[0].duration <= boards[1].at - 0.29);
  assert.ok(!events.some((e) => e.type === 'statement'));
  assert.ok(issues.some((i) => /board visual is on screen/.test(i)));
  assert.ok(events.some((e) => e.type === 'emphasis'));
});

test('events that share the top of the screen never overlap, and the track is capped to what a short can carry', () => {
  const { ctx, clip } = ctxOf();
  const many = clip.words.filter((w) => w.word.length > 4).map((w) => ({ type: 'emphasis', text: w.word, strength: 1 }));
  const { events } = normalizeDirectorTrack(many, ctx);
  const zone = events.filter((e) => e.type === 'emphasis');
  for (let i = 1; i < zone.length; i += 1) assert.ok(zone[i - 1].at + zone[i - 1].duration <= zone[i].at, 'no overlap');
  assert.ok(events.length <= Math.max(4, Math.round(clip.duration / 3.5)));
});

test('a disabled flag survives, and the board index tells each block its default animation', () => {
  const { ctx } = ctxOf();
  const { events } = normalizeDirectorTrack([{ type: 'emphasis', text: 'traffic', disabled: true }], ctx);
  assert.equal(events[0].disabled, true);
  const index = blocksIndex(buildBoardIndex(BOARD));
  const flow = [...index.values()].find((b) => b.type === 'flow');
  assert.equal(flow.defaultAnimation, 'progressive');
  assert.ok(flow.parts.has('steps.0'));
});

/* ----------------------------------- baseline ----------------------------------- */

test('the baseline director sets figures, board lines and diagrams, spaces emphasis out, and passes validation clean', () => {
  const { transcript, candidate, snapshot, tally } = setup();
  const { clip, blocks, ctx } = contextFor({ candidate, transcript, snapshot, tally });
  const raw = baselineDirector({ clip, blocks });
  const types = new Set(raw.map((e) => e.type));
  assert.ok(types.has('number'), 'the $10,000 is set as a figure');
  assert.equal(raw.find((e) => e.type === 'number').value, '$10,000');
  assert.ok(raw.filter((e) => e.type === 'emphasis').length <= 4);
  const { events, issues } = normalizeDirectorTrack(raw, ctx);
  assert.deepEqual(issues, []);
  assert.ok(events.length >= 2);
  // Deliberate: nowhere near an event per sentence.
  assert.ok(events.filter((e) => e.type !== 'camera').length <= 8);
});

test('clip board blocks put the tally in clip time and drop what was said inside a cut', () => {
  const { transcript, candidate, tally } = setup();
  const clip = buildClip(candidate, transcript);
  const blocks = clipBoardBlocks(tally, clip.segments);
  assert.ok(blocks.length >= 1);
  assert.ok(blocks.every((b) => b.first >= 0 && b.last <= clip.duration + 0.5));
  assert.ok(blocks.every((b, i) => i === 0 || b.first >= blocks[i - 1].first));
});

/* ---------------------------------- the service ---------------------------------- */

function stub(handler, live = true) {
  const calls = [];
  return { live, model: 'stub', calls, async completeJSON(req) { calls.push(req); return handler(req); } };
}

test('with the AI director off, the rule-based edit is used and no model is called', async () => {
  const s = setup();
  const provider = stub(() => ({ events: [] }));
  const track = await directCandidate({ ...s, provider, ai: false });
  assert.equal(track.source, 'baseline');
  assert.equal(provider.calls.length, 0);
  assert.ok(track.events.length > 0);
});

test('with the AI director on, DeepSeek\'s events are validated and grounded before they are kept', async () => {
  const s = setup();
  const provider = stub(() => ({ events: [
    { type: 'emphasis', at: 0, text: 'leak', strength: 3 },
    { type: 'number', at: 0, value: '$10,000' },
    { type: 'emphasis', text: 'hallucinated' },
  ] }));
  const track = await directCandidate({ ...s, provider, ai: true });
  assert.equal(track.source, 'deepseek');
  assert.equal(track.model, 'stub');
  assert.equal(track.events.length, 2);
  assert.ok(track.issues.some((i) => /hallucinated/.test(i)));
  const prompt = provider.calls[0];
  assert.match(prompt.system, /NOT a karaoke caption video/);
  assert.match(prompt.user, /SHORT: Traffic is not the problem/);
  assert.match(prompt.user, /\[0\.\d-/);
});

test('when the AI answer is unusable or the call fails, the baseline takes over and says so', async () => {
  const s = setup();
  const nonsense = await directCandidate({ ...s, provider: stub(() => ({ events: [{ type: 'dance' }] })), ai: true });
  assert.equal(nonsense.source, 'baseline');
  assert.equal(nonsense.fellBack, true);
  assert.ok(nonsense.events.length > 0);
  const down = await directCandidate({ ...s, provider: stub(() => { throw new Error('timeout'); }), ai: true });
  assert.equal(down.source, 'baseline');
  assert.match(down.issues[0], /rule-based/);
  const none = await directCandidate({ ...s, provider: stub(() => ({}), false), ai: true });
  assert.equal(none.source, 'baseline');
});

test('the same prompt is answered from the cache the second time', async () => {
  const s = setup();
  const store = new Map();
  const cache = { get: async (k) => store.get(k) || null, put: async (k, v) => { store.set(k, v); } };
  const provider = stub(() => ({ events: [{ type: 'emphasis', text: 'leak', strength: 2 }] }));
  const a = await directCandidate({ ...s, provider, ai: true, cache });
  const b = await directCandidate({ ...s, provider, ai: true, cache });
  assert.equal(provider.calls.length, 1);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
});

test('a track edited elsewhere (Claude, ChatGPT, by hand) is re-validated on import', () => {
  const s = setup();
  const track = importTrack({ ...s, raw: { events: [{ type: 'emphasis', text: 'leak', strength: 3 }, { type: 'emphasis', text: 'unicorn' }, { type: 'camera', action: 'punch_in', at: 4 }] } });
  assert.equal(track.source, 'external');
  assert.equal(track.events.filter((e) => e.type === 'emphasis').length, 1);
  assert.equal(track.events.filter((e) => e.type === 'camera').length, 2); // the missing return is added
  assert.ok(track.issues.some((i) => /unicorn/.test(i)));
});

test('the director prompt shows clip-time lines and only blocks that were actually matched', () => {
  const { transcript, candidate, snapshot, tally } = setup();
  const { clip, blocks } = contextFor({ candidate, transcript, snapshot, tally });
  const lines = transcriptLines(clip.words);
  assert.ok(lines.length >= 4);
  assert.match(lines[0], /^\[0\.\d-/);
  const { user } = buildDirectorPrompt({ title: 't', duration: clip.duration, words: clip.words, blocks });
  for (const b of blocks) assert.match(user, new RegExp(b.blockId.replace('.', '\\.')));
  assert.match(DIRECTOR_SYSTEM, /punch_out = wider so the creator's hand movement shows/);
  assert.doesNotMatch(DIRECTOR_SYSTEM, /#[0-9a-f]{3,6}|px\b/i); // no styling vocabulary at all
});

test('a board block that is only a line of text is set as a statement, not shown in a card', () => {
  const { ctx } = ctxOf();
  const text = [...ctx.blocks.keys()].find((id) => ctx.blocks.get(id).type === 'bigtype');
  const { events } = normalizeDirectorTrack([{ type: 'board', at: 4, blockId: text, animation: 'reveal', duration: 8 }], ctx);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'statement');
  assert.equal(events[0].text, 'THE LEAK');
  assert.equal(events[0].style, 'loud');
  assert.ok(events[0].duration <= 4, 'a headline does not stay up for eight seconds');
  assert.equal(events.some((e) => e.type === 'board'), false);
});
