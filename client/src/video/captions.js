import { CAPTIONS } from './theme.js';

/**
 * Captions from the word timestamps: readable phrases, never a wall of text, never karaoke.
 *
 * A cue is a few words shown together. It breaks at the end of a sentence, at a pause, or when it has
 * enough words, and it never leaves a lone word hanging at the end. Which words stand out is decided by
 * the Director Track (emphasis events); this only groups and times.
 */

const SENTENCE = /[.?!…]["')\]]*$/;
const CLAUSE = /[,;:]["')\]]*$/;

export function groupCaptions(words, { maxWords = 4, maxSeconds = CAPTIONS.maxSeconds, breakGap = CAPTIONS.breakGap } = {}) {
  const cues = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    cues.push({ start: current[0].start, end: current[current.length - 1].end, words: current });
    current = [];
  };

  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    // Carries wordIndex/originalWord through (unused by playback, read by the caption editor) alongside the fields playback needs.
    current.push({ ...w, text: w.word, start: w.start, end: w.end, index: w.index ?? i });
    const next = words[i + 1];
    if (!next) break;
    const gap = next.start - w.end;
    const span = next.end - current[0].start;
    const full = current.length >= maxWords;
    const sentenceEnd = SENTENCE.test(w.word) && current.length >= 2;
    const clauseEnd = CLAUSE.test(w.word) && current.length >= maxWords - 1;
    if (full || sentenceEnd || clauseEnd || gap >= breakGap || span > maxSeconds) flush();
  }
  flush();

  // No orphans: a single word at the end of a sentence joins the cue before it when there is room.
  for (let i = cues.length - 1; i > 0; i -= 1) {
    const c = cues[i];
    const prev = cues[i - 1];
    if (c.words.length === 1 && prev.words.length < maxWords + 1 && c.start - prev.end < breakGap) {
      prev.words.push(...c.words);
      prev.end = c.end;
      cues.splice(i, 1);
    }
  }
  return cues;
}

/** The cue to show at clip time t (or null): it appears a beat early and lingers briefly, but never overlaps the next. */
export function cueAt(cues, t, { lead = CAPTIONS.lead, hold = CAPTIONS.hold } = {}) {
  for (let i = 0; i < cues.length; i += 1) {
    const c = cues[i];
    const next = cues[i + 1];
    const from = c.start - lead;
    const to = Math.min(c.end + hold, next ? next.start - lead : Infinity);
    if (t >= from && t < to) return { cue: c, index: i };
  }
  return null;
}

/** The word being spoken at t within a cue (the last one already started), or -1 before the first. */
export function activeWord(cue, t) {
  let at = -1;
  for (let i = 0; i < cue.words.length; i += 1) if (t >= cue.words[i].start - 0.02) at = i;
  return at;
}

/** SRT subtitles for a platform that wants a caption file. Times in clip seconds. */
export function toSrt(cues) {
  const stamp = (s) => {
    const ms = Math.round(s * 1000);
    const pad = (n, l = 2) => String(n).padStart(l, '0');
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`;
  };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.words.map((w) => w.text).join(' ')}\n`).join('\n');
}
