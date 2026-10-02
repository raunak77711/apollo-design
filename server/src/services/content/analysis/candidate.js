import { createHash } from 'node:crypto';
import { tokenize } from '../text.js';
import { enforceRetakes, reasonFromSignals } from './retakeSignals.js';
import { DISCARD_REASONS, KEEP_REASONS, SHORT_LIMITS } from './prompts.js';

/**
 * A model's answer -> a short candidate Apollo can trust.
 *
 * Nothing the model wrote reaches the session unchecked: utterance ids must exist, ranges must be
 * ordered and non-overlapping, scores must be numbers, and the clip must be a sensible length.
 * Times are never taken from the model: they are looked up from the transcript's word timestamps,
 * and every cut is placed in the middle of the silence between two words so no speech is clipped.
 * What cannot be repaired is dropped with a reason; the rest of the response is unaffected.
 */

export const CANDIDATE_VERSION = 1;
const PAD_START = 0.15;
const PAD_END = 0.25;
const round = (v) => Math.round(v * 100) / 100;
const clip = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const SCORE_KEYS = ['hook', 'clarity', 'value', 'audienceRelevance'];
export const composite = (s) => Math.round((s.hook * 0.35 + s.clarity * 0.25 + s.value * 0.25 + s.audienceRelevance * 0.15) * 10) / 10;

const idOf = (v) => {
  const m = /^u?(\d+)$/i.exec(String(v ?? '').trim());
  return m ? Number(m[1]) : null;
};

function parseScores(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scores = {};
  for (const key of SCORE_KEYS) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) return null;
    scores[key] = Math.min(10, Math.max(1, Math.round(n)));
  }
  return scores;
}

const RETAKE_REASONS = new Set(['restart_marker', 'abandoned_take', 'repeated_take', 'stutter', 'false_start']);

/**
 * The answer format: a SPAN of utterances the short covers, and the CUTS inside it. Everything in the
 * span that is not cut is kept, so a cut can never jump across good content. A span may begin with the
 * failed take(s) a clean retake follows: they are listed as cuts and recorded, but are not part of the clip.
 */
function planFromSpan(raw, count, signals = []) {
  const from = idOf(raw.from);
  const to = idOf(raw.to);
  if (from === null || to === null || from > to || to >= count) return { error: 'the span has an unknown utterance id' };
  const plan = new Map();
  for (let id = from; id <= to; id += 1) plan.set(id, { action: 'keep', reason: 'main' });
  for (const cut of Array.isArray(raw.cuts) ? raw.cuts : []) {
    const cf = idOf(cut?.from);
    const ct = idOf(cut?.to);
    if (cf === null || ct === null || cf > ct) return { error: 'a cut has an unknown utterance id' };
    if (cf < from || ct > to) return { error: 'a cut lies outside the span' };
    const reason = DISCARD_REASONS.includes(cut.reason) ? cut.reason : null;
    for (let id = cf; id <= ct; id += 1) plan.set(id, { action: 'discard', reason: reason || reasonFromSignals(signals[id]) });
  }
  return { plan };
}

/** Turn [from,to,action,reason] ranges into a per-utterance plan, treating any skipped id as cut. */
function planFrom(rawSegments, count, signals = []) {
  const parsed = [];
  for (const seg of Array.isArray(rawSegments) ? rawSegments : []) {
    const from = idOf(seg?.from);
    const to = idOf(seg?.to);
    const action = seg?.action === 'keep' || seg?.action === 'discard' ? seg.action : null;
    if (from === null || to === null || !action || from > to || to >= count) return { error: 'a segment has an unknown utterance id or action' };
    parsed.push({ from, to, action, reason: clip(seg.reason, 40) });
  }
  parsed.sort((a, b) => a.from - b.from);
  for (let i = 1; i < parsed.length; i += 1) if (parsed[i].from <= parsed[i - 1].to) return { error: 'segments overlap' };
  if (!parsed.some((s) => s.action === 'keep')) return { error: 'nothing is kept' };

  const plan = new Map(); // utterance id -> { action, reason }
  const firstId = parsed[0].from;
  const lastId = parsed[parsed.length - 1].to;
  let seg = 0;
  for (let id = firstId; id <= lastId; id += 1) {
    while (parsed[seg].to < id) seg += 1;
    plan.set(id, id >= parsed[seg].from ? { action: parsed[seg].action, reason: parsed[seg].reason } : { action: 'discard', reason: reasonFromSignals(signals[id]) });
  }
  return { plan };
}

/**
 * ctx = { utterances, words, signals, sourceHash, tally?, model }
 * Returns { candidate } or { issue }.
 */
export function normalizeCandidate(raw, ctx) {
  const { utterances, words, signals } = ctx;
  if (!raw || typeof raw !== 'object') return { issue: 'not an object' };

  const title = clip(raw.title, 80);
  if (!title) return { issue: 'no title' };
  const scores = parseScores(raw.scores);
  if (!scores) return { issue: `"${title}": scores are missing or not numbers` };

  const planned = Array.isArray(raw.segments) ? planFrom(raw.segments, utterances.length, signals) : planFromSpan(raw, utterances.length, signals);
  if (planned.error) return { issue: `"${title}": ${planned.error}` };
  const plan = planned.plan;

  // The certain cuts: restart announcements, and a false start whose clean retake is also kept.
  const kept = new Set([...plan].filter(([, v]) => v.action === 'keep').map(([id]) => id));
  for (const [id, reason] of enforceRetakes(kept, signals)) plan.set(id, { action: 'discard', reason });
  for (const [id, step] of plan) {
    if (step.action === 'discard' && (step.reason === 'cut' || !step.reason)) plan.set(id, { ...step, reason: reasonFromSignals(signals[id]) });
  }

  // The clip itself starts and ends on kept speech; cuts before the first or after the last kept
  // utterance stay in the record (a reviewer should see what was thrown away) but are not part of the clip.
  const ids = [...plan.keys()].sort((a, b) => a - b);
  const minId = ids[0];
  const maxId = ids[ids.length - 1];
  const keepIds0 = ids.filter((id) => plan.get(id).action === 'keep');
  if (!keepIds0.length) return { issue: `"${title}": nothing left to keep after removing restarts` };

  // Group consecutive utterances with the same action into segments.
  const groups = [];
  for (let id = minId; id <= maxId; id += 1) {
    const step = plan.get(id) || { action: 'discard', reason: 'cut' };
    const last = groups[groups.length - 1];
    if (last && last.action === step.action && last.to === id - 1 && (step.action === 'keep' || last.reason === step.reason)) last.to = id;
    else groups.push({ from: id, to: id, action: step.action, reason: step.reason });
  }

  // Real times. Each cut sits in the middle of the silence between the two utterances it separates.
  const startOf = (id) => words[utterances[id].firstWord].start;
  const endOf = (id) => words[utterances[id].lastWord].end;
  const firstKeep = groups.findIndex((g) => g.action === 'keep');
  const lastKeep = groups.length - 1 - [...groups].reverse().findIndex((g) => g.action === 'keep');

  const mid = (a, b) => (a + b) / 2;
  const segments = groups.map((g, i) => {
    let start;
    if (i === 0) {
      const prevEnd = g.from > 0 ? endOf(g.from - 1) : null;
      start = g.action === 'keep'
        ? (prevEnd === null ? Math.max(0, startOf(g.from) - PAD_START) : Math.max(startOf(g.from) - PAD_START, mid(prevEnd, startOf(g.from))))
        : startOf(g.from);
    } else {
      start = mid(endOf(groups[i - 1].to), startOf(g.from));
    }
    let end;
    if (i === groups.length - 1) {
      const nextStart = g.to < utterances.length - 1 ? startOf(g.to + 1) : null;
      end = g.action === 'keep'
        ? (nextStart === null ? endOf(g.to) + PAD_END : Math.min(endOf(g.to) + PAD_END, mid(endOf(g.to), nextStart)))
        : endOf(g.to);
    } else {
      end = mid(endOf(g.to), startOf(groups[i + 1].from));
    }
    const allowed = g.action === 'keep' ? KEEP_REASONS : DISCARD_REASONS;
    if (g.action === 'keep' && i > 0 && groups[i - 1].action === 'discard' && RETAKE_REASONS.has(groups[i - 1].reason) && (!g.reason || g.reason === 'main')) g.reason = 'clean_retake';
    return {
      start: round(start),
      end: round(end),
      action: g.action,
      reason: allowed.includes(g.reason) ? g.reason : g.action === 'keep' ? 'main' : 'cut',
      from: `u${g.from}`,
      to: `u${g.to}`,
      text: utterances.slice(g.from, g.to + 1).map((u) => u.text).join(' '),
    };
  });

  const keptSeconds = round(segments.filter((s) => s.action === 'keep').reduce((n, s) => n + (s.end - s.start), 0));
  if (keptSeconds < SHORT_LIMITS.minSeconds) return { issue: `"${title}": only ${keptSeconds}s of speech is kept` };
  if (keptSeconds > SHORT_LIMITS.maxSeconds) return { issue: `"${title}": ${keptSeconds}s is too long for a short` };

  const keptIds = groups.filter((g) => g.action === 'keep').flatMap((g) => Array.from({ length: g.to - g.from + 1 }, (_, k) => g.from + k));
  const text = keptIds.map((id) => utterances[id].text).join(' ');
  if (tokenize(text).length < 8) return { issue: `"${title}": too little is said` };

  const sourceStart = segments[firstKeep].start;
  const sourceEnd = segments[lastKeep].end;
  const key = `${ctx.sourceHash || ''}:${sourceStart.toFixed(1)}:${sourceEnd.toFixed(1)}`;

  return {
    candidate: {
      id: `c_${createHash('sha1').update(key).digest('hex').slice(0, 10)}`,
      title,
      topic: clip(raw.topic, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general',
      reason: clip(raw.reason, 320),
      hook: utterances[keptIds[0]].text.slice(0, 160),
      sourceStart,
      sourceEnd,
      duration: round(sourceEnd - sourceStart),
      keptDuration: keptSeconds,
      scores,
      score: composite(scores),
      sourceSegments: segments,
      text,
      discarded: groups.filter((g) => g.action === 'discard').map((g) => ({ from: `u${g.from}`, to: `u${g.to}`, reason: g.reason, text: utterances.slice(g.from, g.to + 1).map((u) => u.text).join(' ') })),
      boardMatches: boardMatchesFor(ctx.tally, segments),
      emphasis: [],
      directorTrack: [],
      status: 'pending',
      model: ctx.model || '',
      version: CANDIDATE_VERSION,
    },
  };
}

/** Tally hits inside the kept stretches of a clip, grouped by block: what the board has to show here. */
export function boardMatchesFor(tally, segments) {
  if (!tally?.sections) return [];
  const keep = segments.filter((s) => s.action === 'keep');
  const inside = (h) => keep.some((s) => h.start >= s.start && h.end <= s.end);
  const out = [];
  for (const section of tally.sections) {
    for (const block of section.blocks) {
      const parts = [];
      let confidence = 0;
      let at = Infinity;
      for (const part of block.parts) {
        const hits = part.hits.filter(inside);
        if (!hits.length) continue;
        parts.push(part.path);
        confidence = Math.max(confidence, ...hits.map((h) => h.score));
        at = Math.min(at, ...hits.map((h) => h.start));
      }
      if (parts.length) out.push({ sectionId: section.id, blockId: block.id, type: block.type, parts, confidence: round(Math.min(1, confidence)), at: round(at) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Similar enough to be the same idea said twice: overlapping in time, or nearly the same words. */
export function sameIdea(a, b) {
  const overlap = Math.min(a.sourceEnd, b.sourceEnd) - Math.max(a.sourceStart, b.sourceStart);
  if (overlap > 0.4 * Math.min(a.duration, b.duration)) return true;
  const ta = new Set(tokenize(a.text));
  const tb = new Set(tokenize(b.text));
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size) >= 0.8;
}
