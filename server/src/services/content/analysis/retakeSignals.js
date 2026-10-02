/**
 * Retake signals: what the words and the clock say about a restart, before any model is asked.
 *
 * The creator's habit is to stumble, say so (or not), and then record the whole line again.
 * Those restarts leave fingerprints that need no language model:
 *
 *   restart_marker    "sorry", "let me say that again", "take two": an announcement, never content
 *   abandoned         a short sentence that trails off into "sorry", or stops mid-thought
 *   repeated_opening  a later sentence begins the same way, within seconds: the earlier one is a false start
 *   filler_burst      uh/um clusters
 *   long_pause        a mid-sentence silence long enough to be hesitation, not rhythm
 *
 * They are given to the model as hints (it still judges), and the two certain ones - a pure
 * restart announcement, and an earlier take whose clean replacement is also kept - are
 * enforced afterwards by `enforceRetakes`, so a clip can never ship with the announcement in it.
 */

const FILLERS = new Set(['uh', 'um', 'umm', 'uhh', 'er', 'erm', 'ah', 'hmm', 'hm', 'mm']);
const MARKER = /\b(let me (say|start|try|restart|redo|rephrase|do|go) (that|this|it)?\s?(again|over|back)?|let me restart|start over|start again|from the top|take (two|2|three|3|four|4)|scratch that|one more time|try that again|say that again|do that again|hold on)\b/i;
const MARKER_SHORT_WORDS = 14;
const OPENING_WORDS = 3;
const LOOKAHEAD_UTTERANCES = 6;
const LOOKAHEAD_SECONDS = 50;
const LONG_PAUSE = 1.2;

const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9']+/g, '');
const wordsOf = (u, words) => words.slice(u.firstWord, u.lastWord + 1);
const isFiller = (w) => FILLERS.has(norm(w.word));
const complete = (u) => /[.?!…]["')\]]*$/.test(u.text);

/** The words of an utterance with fillers and immediate word repeats ("most HVAC, uh, most HVAC") removed. */
function spoken(u, words) {
  return wordsOf(u, words).filter((w) => !isFiller(w)).map((w) => norm(w.word)).filter(Boolean);
}

export function detectRetakeSignals(utterances, words) {
  const signals = utterances.map(() => []);
  const add = (i, signal) => signals[i].push(signal);

  utterances.forEach((u, i) => {
    const toks = spoken(u, words);
    const count = wordsOf(u, words).length;

    // An announcement of a restart, as a short utterance of its own ("Sorry. Let me say that again.").
    if (MARKER.test(u.text) && count <= MARKER_SHORT_WORDS) add(i, { type: 'restart_marker' });

    // "...most HVAC owners think, sorry."
    const tail = toks.slice(-3);
    if (count <= 28 && tail.includes('sorry') && !signals[i].some((s) => s.type === 'restart_marker')) {
      add(i, { type: 'abandoned', detail: 'trails off into "sorry"' });
    }

    const fillers = wordsOf(u, words).filter(isFiller).length;
    if (fillers >= 2) add(i, { type: 'filler_burst', detail: `${fillers} fillers` });

    // Hesitation: the speaker stopped dead, mid-sentence, for a long beat (the utterance is cut at the pause, so look after it).
    const after = utterances[i + 1];
    if (after && !complete(u) && after.start - u.end >= LONG_PAUSE) {
      add(i, { type: 'long_pause', detail: `${(after.start - u.end).toFixed(1)}s of silence after an unfinished sentence` });
    }
  });

  // A later utterance that opens the same way is the retake; the earlier one is the false start.
  utterances.forEach((u, i) => {
    const mine = spoken(u, words);
    if (mine.length < 2) return;
    const head = mine.slice(0, Math.min(OPENING_WORDS, mine.length));
    for (let j = i + 1; j < Math.min(utterances.length, i + 1 + LOOKAHEAD_UTTERANCES); j += 1) {
      if (utterances[j].start - u.end > LOOKAHEAD_SECONDS) break;
      if (signals[j].some((s) => s.type === 'restart_marker')) continue;
      const theirs = spoken(utterances[j], words);
      if (theirs.length < 3 || theirs.slice(0, head.length).join(' ') !== head.join(' ')) continue;

      const clearlyBroken = !complete(u) || signals[i].some((s) => s.type === 'abandoned' || s.type === 'filler_burst') || mine.length < theirs.length - 2;
      // Two full, same-length sentences that begin alike are usually a rhetorical repeat ("She leaves. She leaves."), not a retake.
      if (clearlyBroken || head.length >= 4) {
        add(i, { type: 'repeated_opening', supersededBy: j, detail: clearlyBroken ? 'a later sentence starts the same way and finishes' : 'restated later' });
        break;
      }
    }
  });

  // A stumble that the speaker immediately announces as a restart is not a judgement call.
  utterances.forEach((u, i) => {
    const next = signals[i + 1];
    if (next?.some((x) => x.type === 'restart_marker')) {
      const abandoned = signals[i].find((x) => x.type === 'abandoned');
      if (abandoned) abandoned.certain = true;
    }
  });

  return signals;
}

/** Flags in the compact form the prompt uses. */
export function flagText(list) {
  const out = [];
  for (const s of list) {
    if (s.type === 'restart_marker') out.push('restart-marker');
    else if (s.type === 'abandoned') out.push('abandoned');
    else if (s.type === 'repeated_opening') out.push(`repeated-in:u${s.supersededBy}`);
    else if (s.type === 'filler_burst') out.push('fillers');
    else if (s.type === 'long_pause') out.push('long-pause');
  }
  return out.length ? ` ⚑${out.join(' ⚑')}` : '';
}

/**
 * The certain cuts. Given the utterance ids a clip keeps (a Set of integer ids), returns the ids that
 * must be dropped regardless of what a model decided, with the reason for each.
 */
export function enforceRetakes(keptIds, signals) {
  const drop = new Map();
  /** Is a clean replacement of this false start kept? Follows the chain: copy 1 -> copy 2 (also abandoned) -> the retake. */
  const replacementKept = (id) => {
    let current = id;
    for (let hops = 0; hops < 6; hops += 1) {
      const link = (signals[current] || []).find((s) => s.type === 'repeated_opening');
      if (!link) return false;
      if (keptIds.has(link.supersededBy)) return true;
      current = link.supersededBy;
    }
    return false;
  };
  for (const id of keptIds) {
    const list = signals[id] || [];
    if (list.some((s) => s.type === 'restart_marker')) drop.set(id, 'restart_marker');
    else if (list.some((s) => s.type === 'abandoned' && s.certain)) drop.set(id, 'abandoned_take');
    else if (replacementKept(id)) drop.set(id, 'abandoned_take');
  }
  return drop;
}

/** The reason a skipped utterance was cut, read from what the detector saw. */
export function reasonFromSignals(list = []) {
  if (list.some((s) => s.type === 'restart_marker')) return 'restart_marker';
  if (list.some((s) => s.type === 'abandoned' || s.type === 'repeated_opening')) return 'abandoned_take';
  if (list.some((s) => s.type === 'filler_burst')) return 'filler_burst';
  return 'cut';
}
