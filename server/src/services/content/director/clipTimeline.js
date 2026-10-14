import { flattenWords } from '../../transcription/transcriptSchema.js';

/**
 * A short as the viewer experiences it: the kept stretches of the recording played back to back.
 *
 * Source time is where something was said in the recording; CLIP time starts at 0 at the first kept
 * word and has the cuts closed up. The Director Track, the captions and the renderer all work in clip
 * time, so an edit never needs to know where a cut was.
 *
 *   segments  [{ start, end, clipStart, clipEnd }]   kept stretches, source times and clip times
 *   words     [{ word, start, end, index }]          the spoken words, in clip time
 */

const round = (v) => Math.round(v * 1000) / 1000;
const EPS = 0.05;

export function keepSegments(candidate) {
  let clip = 0;
  return (candidate.sourceSegments || [])
    .filter((s) => s.action === 'keep')
    .map((s) => {
      const out = { start: s.start, end: s.end, clipStart: round(clip), clipEnd: round(clip + (s.end - s.start)) };
      clip += s.end - s.start;
      return out;
    });
}

/** Source seconds -> clip seconds, or null if that moment was cut. */
export function sourceToClip(segments, t) {
  for (const s of segments) if (t >= s.start - EPS && t <= s.end + EPS) return round(s.clipStart + Math.min(Math.max(t - s.start, 0), s.end - s.start));
  return null;
}

/** Clip seconds -> source seconds. */
export function clipToSource(segments, t) {
  for (const s of segments) if (t >= s.clipStart - EPS && t <= s.clipEnd + EPS) return round(s.start + Math.min(Math.max(t - s.clipStart, 0), s.end - s.start));
  const last = segments[segments.length - 1];
  return last ? last.end : 0;
}

/**
 * `candidate.edits.captionOverrides` corrects a misheard word's text without touching its timing:
 * `{ [transcriptWordIndex]: correctedText }`, keyed by the word's stable position in the session's
 * whole transcript (from `flattenWords`) rather than its position in this clip, so the correction
 * survives a trim even though which words are kept - and therefore their clip-local positions - can change.
 */
export function buildClip(candidate, transcript) {
  const segments = keepSegments(candidate);
  const duration = segments.length ? segments[segments.length - 1].clipEnd : 0;
  const overrides = candidate.edits?.captionOverrides || {};
  const words = [];
  for (const w of flattenWords(transcript)) {
    const seg = segments.find((s) => w.start >= s.start - EPS && w.end <= s.end + EPS);
    if (!seg) continue;
    const start = round(seg.clipStart + Math.max(0, w.start - seg.start));
    const end = round(Math.min(seg.clipEnd, seg.clipStart + (w.end - seg.start)));
    const override = overrides[w.index];
    words.push({
      word: override || w.word,
      wordIndex: w.index,
      ...(override ? { originalWord: w.word } : {}),
      start,
      end: Math.max(end, start),
      index: words.length,
    });
  }
  return { segments, duration: round(duration), words, text: words.map((w) => w.word).join(' ') };
}
