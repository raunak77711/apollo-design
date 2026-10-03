import { stem } from '../text.js';

/**
 * The Director Track: an edit decision list for ONE short, in clip time (0 = its first kept word).
 *
 * It says WHAT happens and WHEN, from a small closed vocabulary. It never carries code, CSS, coordinates
 * or animation curves: those belong to the deterministic engine, so improving the engine improves every
 * video made before and after. Whoever wrote the track (the baseline director, DeepSeek, Claude or ChatGPT
 * through an export, a person) it passes through here, and what cannot be made valid is dropped with a
 * reason, never guessed at.
 *
 *   emphasis    { text, strength 1-3 }               a spoken word or two that carries the point
 *   number      { value, label? }                    a figure said aloud: $10,000, 24/7, 40%
 *   statement   { text, style }                      a short claim set as type: TRAFFIC ≠ PROBLEM
 *   camera      { action, amount? }                  punch_in (tighter) | punch_out (wider, shows the hands) | return
 *   board       { sectionId, blockId, animation, part?, duration }   a Jam board block, animated
 *   comparison  { left, right, duration }            two ideas side by side
 *   annotation  { kind, text }                       underline / circle / arrow on a spoken word
 *
 * Emphasis, number and annotation are GROUNDED: the phrase must really be in the transcript, and the event
 * is placed at the word's real timestamp, whatever time the author wrote.
 */

export const DIRECTOR_VERSION = 1;
export const EVENT_TYPES = ['emphasis', 'number', 'statement', 'camera', 'board', 'comparison', 'annotation'];
export const CAMERA_ACTIONS = ['punch_in', 'punch_out', 'return'];
export const BOARD_ANIMATIONS = ['reveal', 'progressive', 'focus', 'compare', 'highlight'];
export const STATEMENT_STYLES = ['loud', 'quiet', 'inverse'];
export const ANNOTATION_KINDS = ['underline', 'circle', 'arrow'];
export const SOURCES = ['baseline', 'deepseek', 'external', 'manual'];

export const LIMITS = {
  statementChars: 48,
  numberChars: 18,
  labelChars: 28,
  emphasisWords: 3,
  zoomMin: 1.05,
  zoomMax: 1.25,
  cameraGap: 2.0, //  seconds between camera moves
  boardMin: 2,
  boardMax: 12,
};

/** How long each kind of event is on screen unless it says otherwise (seconds). */
export const DEFAULT_DURATION = { emphasis: 1.0, number: 2.2, statement: 2.4, comparison: 5, annotation: 1.6, board: 5 };

const round = (v) => Math.round(v * 100) / 100;
const clip = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* --------------------------------- grounding --------------------------------- */

const norm = (w) => String(w ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const same = (a, b) => a === b || (a.length > 3 && b.length > 3 && stem(a) === stem(b));

/**
 * Where is this phrase in the clip's words? Returns { from, to, start, end } (word indices and clip seconds),
 * or null. When it appears more than once, the occurrence nearest `near` seconds wins.
 */
export function findPhrase(words, phrase, near = null) {
  const target = String(phrase ?? '').split(/\s+/).map(norm).filter(Boolean);
  if (!target.length) return null;
  const toks = words.map((w) => norm(w.word));
  const hits = [];
  for (let i = 0; i + target.length <= toks.length; i += 1) {
    if (target.every((t, k) => toks[i + k] && same(toks[i + k], t))) hits.push(i);
  }
  if (!hits.length) return null;
  const best = near === null ? hits[0] : hits.reduce((a, b) => (Math.abs(words[b].start - near) < Math.abs(words[a].start - near) ? b : a));
  const to = best + target.length - 1;
  return { from: best, to, start: words[best].start, end: words[to].end };
}

/** A figure said aloud: matched by its digits, so "$10,000", "10,000" and "10000" all find the same word. */
export function findNumber(words, value, near = null) {
  const direct = findPhrase(words, value, near);
  if (direct) return direct;
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const hits = [];
  for (let i = 0; i < words.length; i += 1) {
    let acc = '';
    for (let k = 0; k < 4 && i + k < words.length; k += 1) {
      acc += String(words[i + k].word).replace(/\D/g, '');
      if (acc === digits) {
        hits.push({ from: i, to: i + k });
        break;
      }
      if (acc.length >= digits.length) break;
    }
  }
  if (!hits.length) return null;
  const best = near === null ? hits[0] : hits.reduce((a, b) => (Math.abs(words[b.from].start - near) < Math.abs(words[a.from].start - near) ? b : a));
  return { ...best, start: words[best.from].start, end: words[best.to].end };
}

/* -------------------------------- per-event rules ------------------------------- */

function normalizeEvent(raw, ctx) {
  if (!raw || typeof raw !== 'object') return { issue: 'an event is not an object' };
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';
  if (!EVENT_TYPES.includes(type)) return { issue: `unknown event type "${raw.type}"` };
  const at = num(raw.at ?? raw.time ?? raw.t);
  const near = at;
  const duration = num(raw.duration);
  const base = (extra) => ({ type, ...(raw.disabled === true ? { disabled: true } : {}), ...extra });

  switch (type) {
    case 'emphasis': {
      const text = clip(raw.text, 60);
      const hit = findPhrase(ctx.words, text, near);
      if (!hit) return { issue: `emphasis "${text}" was not said in this short` };
      if (hit.to - hit.from + 1 > LIMITS.emphasisWords) return { issue: `emphasis "${text}" is longer than ${LIMITS.emphasisWords} words` };
      return { event: base({ at: hit.start, until: hit.end, text: ctx.words.slice(hit.from, hit.to + 1).map((w) => w.word).join(' ').replace(/[.,!?;:]+$/, ''), strength: clamp(Math.round(num(raw.strength) ?? 2), 1, 3), words: [hit.from, hit.to] }) };
    }
    case 'number': {
      const value = clip(raw.value ?? raw.text, LIMITS.numberChars);
      if (!/\d/.test(value)) return { issue: `number "${value}" has no digits` };
      const hit = findNumber(ctx.words, value, near);
      if (!hit) return { issue: `number "${value}" was not said in this short` };
      const label = clip(raw.label, LIMITS.labelChars);
      return { event: base({ at: hit.start, value, ...(label ? { label } : {}), duration: clamp(duration ?? DEFAULT_DURATION.number, 1, 5), words: [hit.from, hit.to] }) };
    }
    case 'statement': {
      const text = clip(raw.text, LIMITS.statementChars);
      if (!text) return { issue: 'a statement has no text' };
      if (at === null) return { issue: `statement "${text}" has no time` };
      const style = STATEMENT_STYLES.includes(raw.style) ? raw.style : 'loud';
      return { event: base({ at: round(at), text, style, duration: clamp(duration ?? DEFAULT_DURATION.statement, 1, 5) }) };
    }
    case 'camera': {
      const action = CAMERA_ACTIONS.includes(raw.action) ? raw.action : null;
      if (!action) return { issue: `unknown camera action "${raw.action}"` };
      if (at === null) return { issue: 'a camera move has no time' };
      const amount = action === 'punch_in' ? clamp(num(raw.amount) ?? 1.12, LIMITS.zoomMin, LIMITS.zoomMax) : undefined;
      return { event: base({ at: round(at), action, ...(amount ? { amount: round(amount) } : {}) }) };
    }
    case 'board': {
      const block = ctx.blocks?.get(raw.blockId);
      if (!block) return { issue: `board block "${raw.blockId}" is not on the linked board` };
      if (at === null) return { issue: `board block ${raw.blockId} has no time` };
      // A block that is only a line of text (a title, a statement) is not a diagram: a white card with one line in it
      // wastes the screen. It is set as type over the speaker instead.
      if (TEXT_BLOCKS.has(block.type)) {
        const text = clip(block.mainText, LIMITS.statementChars);
        if (!text) return { issue: `board block ${raw.blockId} has no short text to show` };
        return { event: base({ type: 'statement', at: round(at), text, style: block.type === 'quote' ? 'quiet' : 'loud', duration: clamp(duration ?? DEFAULT_DURATION.statement, 1.5, 4) }) };
      }
      const animation = BOARD_ANIMATIONS.includes(raw.animation) ? raw.animation : block.defaultAnimation || 'reveal';
      const part = typeof raw.part === 'string' && block.parts.has(raw.part) ? raw.part : undefined;
      return { event: base({ at: round(at), sectionId: block.sectionId, blockId: raw.blockId, animation, ...(part ? { part } : {}), duration: clamp(duration ?? DEFAULT_DURATION.board, LIMITS.boardMin, LIMITS.boardMax) }) };
    }
    case 'comparison': {
      const left = clip(raw.left?.label ?? raw.left, LIMITS.labelChars);
      const right = clip(raw.right?.label ?? raw.right, LIMITS.labelChars);
      if (!left || !right) return { issue: 'a comparison needs a left and a right' };
      if (at === null) return { issue: 'a comparison has no time' };
      return { event: base({ at: round(at), left, right, duration: clamp(duration ?? DEFAULT_DURATION.comparison, 2, 10) }) };
    }
    case 'annotation': {
      const kind = ANNOTATION_KINDS.includes(raw.kind) ? raw.kind : 'underline';
      const hit = findPhrase(ctx.words, clip(raw.text, 40), near);
      if (!hit) return { issue: `annotation target "${clip(raw.text, 40)}" was not said in this short` };
      return { event: base({ at: hit.start, kind, text: ctx.words.slice(hit.from, hit.to + 1).map((w) => w.word).join(' ').replace(/[.,!?;:]+$/, ''), duration: clamp(duration ?? DEFAULT_DURATION.annotation, 0.8, 4), words: [hit.from, hit.to] }) };
    }
    default:
      return { issue: 'unsupported event' };
  }
}

/* ---------------------------------- the track ----------------------------------- */

const TEXT_BLOCKS = new Set(['title', 'statement', 'bigtype', 'quote']);
const PRIORITY = { board: 100, comparison: 85, number: 90, statement: 80, camera: 60, emphasis: 30, annotation: 15 };
const priorityOf = (e) => (PRIORITY[e.type] || 0) + (e.type === 'emphasis' ? (e.strength || 1) * 10 : 0);
const CARD = new Set(['board', 'comparison']);
const ZONE = new Set(['emphasis', 'number', 'statement']);

const endOf = (e) => e.at + (e.duration ?? DEFAULT_DURATION[e.type] ?? 1);

/**
 * Raw events (an array or { events }) -> { events, issues }.
 * ctx = { words, duration, blocks?: Map(blockId -> { sectionId, type, parts: Set, defaultAnimation }) }
 */
export function normalizeDirectorTrack(raw, ctx) {
  const issues = [];
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : [];
  const duration = ctx.duration;
  let events = [];

  for (const r of list) {
    const { event, issue } = normalizeEvent(r, ctx);
    if (issue) {
      issues.push(issue);
      continue;
    }
    if (event.at < 0 || event.at > duration - 0.3) {
      issues.push(`${event.type} at ${event.at}s is outside the short`);
      continue;
    }
    events.push(event);
  }
  events.sort((a, b) => a.at - b.at || priorityOf(b) - priorityOf(a));

  // One board/comparison card on screen at a time: each ends where the next begins.
  const cards = events.filter((e) => CARD.has(e.type));
  for (let i = 0; i < cards.length; i += 1) {
    const e = cards[i];
    const next = cards[i + 1];
    e.duration = round(Math.min(e.duration, duration - e.at));
    if (next && e.at + e.duration > next.at - 0.3) e.duration = round(next.at - 0.3 - e.at);
    if (e.duration < 1.5) {
      issues.push(`${e.type} at ${e.at}s was dropped: it would be on screen for under 1.5s`);
      events = events.filter((x) => x !== e);
    }
  }
  const windows = events.filter((e) => CARD.has(e.type)).map((e) => [e.at, endOf(e)]);
  const behindCard = (e) => windows.some(([a, b]) => e.at >= a && e.at < b);

  // Statements and numbers are set in the space the board card uses: they cannot show while a card does.
  events = events.filter((e) => {
    if ((e.type === 'statement' || e.type === 'number') && behindCard(e)) {
      issues.push(`${e.type} at ${e.at}s was dropped: a board visual is on screen`);
      return false;
    }
    return true;
  });

  // Type that shares one place on screen must not overlap: trim the earlier, or drop the weaker.
  const zone = events.filter((e) => ZONE.has(e.type));
  for (let i = 0; i < zone.length - 1; i += 1) {
    const a = zone[i];
    const b = zone[i + 1];
    if (!events.includes(a) || !events.includes(b)) continue;
    const dur = a.duration ?? DEFAULT_DURATION[a.type];
    if (a.at + dur > b.at - 0.05) {
      const room = b.at - 0.1 - a.at;
      if (room >= 0.6) {
        a.duration = round(room);
      } else {
        const loser = priorityOf(a) >= priorityOf(b) ? b : a;
        events = events.filter((e) => e !== loser);
        issues.push(`${loser.type} at ${loser.at}s was dropped: it overlapped a stronger one`);
        zone.splice(zone.indexOf(loser), 1);
        i = Math.max(-1, i - 1);
      }
    }
  }
  for (const e of events) if (e.type === 'emphasis' && e.duration === undefined) e.duration = DEFAULT_DURATION.emphasis;

  // Deliberate punctuation, not a slideshow: cap how much happens.
  const cap = clamp(Math.round(duration / 3.5), 4, 18);
  while (events.filter((e) => e.type !== 'camera').length > cap) {
    const pool = events.filter((e) => e.type !== 'camera');
    const weakest = pool.reduce((a, b) => (priorityOf(b) < priorityOf(a) ? b : a));
    events = events.filter((e) => e !== weakest);
    issues.push(`${weakest.type} at ${weakest.at}s was dropped: too many events for a ${Math.round(duration)}s short`);
  }

  // Camera: a punch must be undone, moves are spaced apart, and a "return" needs something to return from.
  const camera = events.filter((e) => e.type === 'camera').sort((a, b) => a.at - b.at);
  const keepCam = new Set();
  let state = 'base';
  let lastAt = -Infinity;
  for (const e of camera) {
    if (e.at - lastAt < LIMITS.cameraGap) {
      issues.push(`camera ${e.action} at ${e.at}s was dropped: too soon after the last move`);
      continue;
    }
    if (e.action === 'return') {
      if (state === 'base') {
        issues.push(`camera return at ${e.at}s was dropped: nothing to return from`);
        continue;
      }
      state = 'base';
    } else {
      if (state !== 'base') {
        issues.push(`camera ${e.action} at ${e.at}s was dropped: return to the normal framing first`);
        continue;
      }
      state = e.action === 'punch_in' ? 'in' : 'out';
    }
    keepCam.add(e);
    lastAt = e.at;
  }
  events = events.filter((e) => e.type !== 'camera' || keepCam.has(e));
  if (state !== 'base') events.push({ type: 'camera', action: 'return', at: round(Math.min(duration - 0.2, lastAt + 3.5)) });

  events.sort((a, b) => a.at - b.at || priorityOf(b) - priorityOf(a));
  events.forEach((e, i) => { e.id = `e${i + 1}`; });
  return { events, issues };
}

/** Everything the engine and the validators need to know about the blocks of a board snapshot. */
export function blocksIndex(boardIndex) {
  const map = new Map();
  const ANIMATION = {
    flow: 'progressive', list: 'progressive', cards: 'progressive', timeline: 'progressive', funnel: 'progressive', hub: 'progressive', loop: 'progressive',
    track: 'progressive', meter: 'progressive', matrix: 'progressive', equation: 'progressive', bucket: 'progressive', eliminate: 'progressive',
    compare: 'compare', zones: 'compare', panels: 'compare',
  };
  for (const section of boardIndex?.sections || []) {
    for (const block of section.blocks) {
      const main = block.parts.find((p) => p.role === 'statement' || p.role === 'heading' || p.role === 'quote');
      map.set(block.id, { sectionId: section.id, type: block.type, parts: new Set(block.parts.map((p) => p.path)), defaultAnimation: ANIMATION[block.type] || 'reveal', mainText: main?.text || '' });
    }
  }
  return map;
}
