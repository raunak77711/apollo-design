/**
 * The transcript Apollo stores and the rest of the Content Factory builds on.
 *
 *   { language, duration, text, segments: [{ id, start, end, text, words: [{ word, start, end, probability }] }], meta }
 *
 * Whatever the worker returns is untrusted: it is coerced into this shape and
 * rejected if nothing usable is left. Word times are made monotonic (a word never
 * starts before the previous one ended, never ends before it starts), because
 * everything downstream - retake detection, emphasis timing, captions - assumes it.
 */

export class TranscriptError extends Error {}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v) => Math.round(v * 1000) / 1000;

export function normalizeTranscript(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.segments)) {
    throw new TranscriptError('transcript has no segments');
  }

  const segments = [];
  let cursor = 0;
  for (const rs of raw.segments) {
    const text = typeof rs?.text === 'string' ? rs.text.trim() : '';
    const start = num(rs?.start);
    const end = num(rs?.end);
    if (!text || start === null || end === null) continue;

    const words = [];
    for (const rw of Array.isArray(rs.words) ? rs.words : []) {
      const word = typeof rw?.word === 'string' ? rw.word.trim() : '';
      let ws = num(rw?.start);
      let we = num(rw?.end);
      if (!word || ws === null || we === null) continue;
      ws = Math.max(ws, cursor);
      we = Math.max(we, ws);
      cursor = we;
      const probability = num(rw.probability);
      words.push({ word, start: round(ws), end: round(we), ...(probability === null ? {} : { probability: round(probability) }) });
    }
    segments.push({ id: segments.length, start: round(start), end: round(Math.max(end, start)), text, words });
  }
  if (!segments.length) throw new TranscriptError('transcript has no usable speech');

  const last = segments[segments.length - 1];
  const duration = num(raw.duration) && raw.duration > 0 ? round(raw.duration) : last.end;
  return {
    language: typeof raw.language === 'string' ? raw.language : 'en',
    duration,
    text: segments.map((s) => s.text).join(' '),
    segments,
    ...(raw.meta && typeof raw.meta === 'object' ? { meta: raw.meta } : {}),
  };
}

/** Every word of a transcript in order, each knowing its segment. The shape retake and emphasis code want. */
export function flattenWords(transcript) {
  const out = [];
  for (const seg of transcript.segments) {
    for (const w of seg.words) out.push({ ...w, segment: seg.id, index: out.length });
  }
  return out;
}
