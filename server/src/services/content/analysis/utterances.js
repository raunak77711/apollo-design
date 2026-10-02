import { flattenWords } from '../../transcription/transcriptSchema.js';

/**
 * A transcript as a list of utterances: roughly one spoken sentence each.
 *
 * Whisper's own segments are too coarse for editing (a stutter, the restart and the
 * clean retake can all sit in one 30-second segment), so the transcript is re-cut at
 * the places a speaker would put a full stop. Each utterance knows its words, so an
 * edit decided at utterance level resolves to exact word timestamps.
 *
 * Whisper sometimes drops punctuation for a stretch and the creator may not pause, so
 * "...because most sales aren't sorry let me say that again because most sales aren't lost..."
 * can arrive as one long run. Cutting only at punctuation and silence would leave the
 * restart buried inside it, where neither the detector nor the editor could reach it. So
 * utterances also break at the places a restart HAPPENS:
 *
 *   - around an announcement ("sorry", "let me say that again", "take two")
 *   - before a phrase that is immediately said again ("her name is Sarah it's | her name is Sarah it's ...")
 *   - at the biggest pause of any very long run with no other break
 */

const PAUSE_BREAK = 0.7; //      seconds of silence that end an utterance on their own
const SOFT_PAUSE = 0.3; //       a gentler pause is enough once an utterance has run long
const LONG_UTTERANCE = 40; //    words
const RUNAWAY = 55; //           words with no break at all: split at the largest pause
const SENTENCE_END = /[.?!…]["')\]]*$/;
const FILLERS = new Set(['uh', 'um', 'umm', 'uhh', 'er', 'erm', 'ah', 'hmm', 'hm', 'mm']);

const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9']+/g, '');

const ANNOUNCEMENTS = [
  'let me say that again', 'let me say it again', 'let me start over', 'let me start again', 'let me restart', 'let me try that again',
  'let me do that again', 'let me redo that', 'let me rephrase', 'start over', 'start again', 'from the top', 'take two', 'scratch that', 'one more time',
].map((p) => p.split(' '));

/** Word indices where a NEW utterance must start because a restart happens there. */
function restartBreaks(words) {
  const starts = new Set();
  const tokens = words.map((w) => norm(w.word));

  // Announcements: the phrase is an utterance of its own, and so is the stumble that ends in "sorry".
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === 'sorry') starts.add(i + 1);
    for (const phrase of ANNOUNCEMENTS) {
      if (phrase.every((p, k) => tokens[i + k] === p)) {
        starts.add(i);
        starts.add(i + phrase.length);
      }
    }
  }

  // A phrase of 3-8 words immediately said again (fillers ignored): the first copy is a false start.
  const real = tokens.map((t, i) => ({ t, i })).filter((x) => x.t && !FILLERS.has(x.t));
  for (let a = 0; a < real.length; a += 1) {
    for (let n = 8; n >= 3; n -= 1) {
      if (a + 2 * n > real.length) continue;
      let same = true;
      for (let k = 0; k < n && same; k += 1) same = real[a + k].t === real[a + n + k].t;
      if (!same) continue;
      starts.add(real[a].i);
      starts.add(real[a + n].i);
      a += n - 1; // skip past this repeat
      break;
    }
  }
  starts.delete(0);
  return starts;
}

export function buildUtterances(transcript) {
  const words = flattenWords(transcript);
  const restarts = restartBreaks(words);
  const utterances = [];
  let first = 0;

  const close = (last) => {
    const slice = words.slice(first, last + 1);
    if (!slice.length) return;
    utterances.push({
      id: utterances.length,
      key: `u${utterances.length}`,
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      firstWord: first,
      lastWord: last,
      // A token that starts with punctuation (".32" after "8") is glued to the word before it.
      text: slice.reduce((acc, w) => (/^[.,:;%]/.test(w.word) && acc ? acc + w.word : `${acc} ${w.word}`.trim()), ''),
    });
    first = last + 1;
  };

  for (let i = 0; i < words.length; i += 1) {
    const next = words[i + 1];
    if (!next) {
      close(i);
      break;
    }
    const gap = next.start - words[i].end;
    const length = i - first + 1;
    // "8" ".32": a token that starts with punctuation belongs to the word before it.
    if (/^[.,:;]/.test(next.word)) continue;

    if (SENTENCE_END.test(words[i].word) || gap >= PAUSE_BREAK || restarts.has(i + 1) || (length >= LONG_UTTERANCE && gap >= SOFT_PAUSE)) {
      close(i);
      continue;
    }
    // A run with no punctuation, no restart and no real pause: cut at its largest pause so it stays editable.
    if (length >= RUNAWAY) {
      let best = i;
      let bestGap = -1;
      for (let k = Math.max(first, i - 20); k <= i; k += 1) {
        const g = (words[k + 1]?.start ?? words[k].end) - words[k].end;
        if (g > bestGap) {
          bestGap = g;
          best = k;
        }
      }
      close(best);
      i = best; // resume after the cut
    }
  }
  return { utterances, words };
}

export const clockOf = (seconds) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};
