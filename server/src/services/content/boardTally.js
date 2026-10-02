import { flattenWords } from '../transcription/transcriptSchema.js';
import { sectionHeadline } from './boardIndex.js';
import { normalizeToken, tokenize } from './text.js';

/**
 * Tally a Jam board against a transcript: for every section, block and part of the
 * board, WHERE in the recording is it spoken about?
 *
 * Deterministic and free (no model): the board's own words are matched against the
 * transcript's word timestamps. Rare words count for more than common ones, both
 * across the board (a word on one card is a locator; a word on every card is not) and
 * across the recording (a word said two hundred times is the topic, not a pointer).
 * The result is the bridge Content Factory uses to pick board visuals for a short:
 * "when she says THE LEAK, that is section s4, block s4.b2".
 */

export const TALLY_VERSION = 1;

const COVERAGE_MIN = 0.6; //   how much of a part's meaning must be said inside one window
const SCORE_MIN = 0.25; //     coverage x specificity: below this it is a coincidence
const SPECIFICITY_FULL = 20; // idf mass at which a part counts as fully specific
const FOUND_SINGLE = 0.4; //   one clear, specific mention is enough to say a section was spoken
const SPAN_GAP = 20; //        seconds between hits that still belong to one stretch of talk
const UNCOVERED_MIN = 45; //   seconds of speech with no board content worth reporting
const round = (v) => Math.round(v * 100) / 100;

function windowFor(tokenCount) {
  return Math.min(40, Math.max(8, tokenCount * 3 + 6));
}

export function tallyBoard(index, transcript) {
  const words = flattenWords(transcript);
  const tokens = words.map((w) => normalizeToken(w.word));
  const totalWords = Math.max(1, words.length);

  // Where each token is said, and how often.
  const postings = new Map();
  tokens.forEach((t, i) => {
    if (!t) return;
    if (!postings.has(t)) postings.set(t, []);
    postings.get(t).push(i);
  });

  // Board side: every part is a "document" for the board-wide idf.
  const parts = [];
  for (const section of index.sections) {
    for (const block of section.blocks) {
      for (const part of block.parts) {
        const toks = [...new Set(tokenize(part.text))];
        if (toks.length) parts.push({ section, block, part, toks });
      }
    }
  }
  const df = new Map();
  for (const p of parts) for (const t of p.toks) df.set(t, (df.get(t) || 0) + 1);
  const partCount = Math.max(1, parts.length);

  const weightOf = (t) => {
    const boardIdf = Math.log(1 + partCount / (df.get(t) || 1));
    const spokenIdf = Math.log(1 + totalWords / (1 + (postings.get(t)?.length || 0)));
    return boardIdf * spokenIdf;
  };

  /** Occurrences of one part: non-overlapping windows that say enough of it. */
  function occurrencesOf({ toks }) {
    const weights = new Map(toks.map((t) => [t, weightOf(t)]));
    const mass = [...weights.values()].reduce((a, b) => a + b, 0);
    if (mass <= 0) return [];
    const specificity = Math.min(1, mass / SPECIFICITY_FULL);
    const span = windowFor(toks.length);

    const hits = [];
    for (const t of toks) for (const pos of postings.get(t) || []) hits.push({ pos, t });
    hits.sort((a, b) => a.pos - b.pos);

    const found = [];
    let lo = 0;
    for (let hi = 0; hi < hits.length; hi += 1) {
      while (hits[hi].pos - hits[lo].pos > span) lo += 1;
      const seen = new Map();
      // The latest occurrence of each token wins, so a window that ends in the second take of a line sits on that take.
      for (let k = lo; k <= hi; k += 1) seen.set(hits[k].t, hits[k].pos);
      const covered = [...seen.keys()].reduce((s, t) => s + weights.get(t), 0) / mass;
      if (covered < COVERAGE_MIN) continue;
      const score = covered * specificity;
      if (score < SCORE_MIN) continue;
      const positions = [...seen.values()];
      found.push({ from: Math.min(...positions), to: Math.max(...positions), score });
    }

    // Keep the best window of each overlapping run; separate takes of the same line are separate occurrences.
    found.sort((a, b) => b.score - a.score || a.from - b.from);
    const kept = [];
    for (const f of found) {
      if (kept.every((k) => f.to < k.from || f.from > k.to)) kept.push(f);
    }
    return kept
      .sort((a, b) => a.from - b.from)
      .map((f) => ({ start: words[f.from].start, end: words[f.to].end, score: round(f.score) }));
  }

  const cluster = (hits) => {
    const sorted = [...hits].sort((a, b) => a.start - b.start);
    const spans = [];
    for (const h of sorted) {
      const last = spans[spans.length - 1];
      if (last && h.start - last.end <= SPAN_GAP) {
        last.end = Math.max(last.end, h.end);
        last.hits += 1;
        last.strength += h.score;
      } else {
        spans.push({ start: h.start, end: h.end, hits: 1, strength: h.score });
      }
    }
    return spans.map((s) => ({ ...s, start: round(s.start), end: round(s.end), strength: round(s.strength) }));
  };

  // Tally per part, then roll up to blocks and sections.
  const partHits = new Map();
  for (const p of parts) {
    const occ = occurrencesOf(p);
    if (occ.length) partHits.set(p.part.id, occ);
  }

  const sections = index.sections.map((section) => {
    const sectionHits = [];
    const blocks = section.blocks.map((block) => {
      const matched = [];
      const hits = [];
      for (const part of block.parts) {
        const occ = partHits.get(part.id);
        if (!occ) continue;
        matched.push({ id: part.id, path: part.path, text: part.text, role: part.role, hits: occ });
        hits.push(...occ);
      }
      sectionHits.push(...hits);
      const spans = cluster(hits);
      return {
        id: block.id,
        type: block.type,
        found: matched.length > 0,
        coverage: block.parts.length ? round(matched.length / block.parts.length) : 0,
        spans,
        parts: matched,
      };
    });

    const spans = cluster(sectionHits);
    const strength = spans.reduce((s, x) => s + x.strength, 0);
    const primary = spans.length ? [...spans].sort((a, b) => b.strength - a.strength)[0] : null;
    return {
      id: section.id,
      order: section.order,
      title: section.title,
      kicker: section.kicker,
      headline: sectionHeadline(section),
      found: strength >= 0.6 || spans.some((sp) => sp.strength >= FOUND_SINGLE),
      strength: round(strength),
      primary,
      spans,
      blocks,
    };
  });

  // Stretches of talk the board has nothing to say about (good places for plain talking-head).
  const covered = [];
  for (const s of sections) for (const sp of s.spans) covered.push([sp.start - 10, sp.end + 10]);
  covered.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const c of covered) {
    const last = merged[merged.length - 1];
    if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
    else merged.push([...c]);
  }
  const speechStart = words[0]?.start ?? 0;
  const speechEnd = words[words.length - 1]?.end ?? 0;
  const uncovered = [];
  let cursor = speechStart;
  for (const [a, b] of [...merged, [speechEnd, speechEnd]]) {
    if (a - cursor >= UNCOVERED_MIN) uncovered.push({ start: round(cursor), end: round(a) });
    cursor = Math.max(cursor, b);
  }

  const totalParts = index.sections.reduce((n, s) => n + s.blocks.reduce((m, b) => m + b.parts.length, 0), 0);
  return {
    version: TALLY_VERSION,
    boardHash: index.hash,
    duration: transcript.duration,
    sections,
    uncovered,
    stats: {
      sectionsTotal: sections.length,
      sectionsFound: sections.filter((s) => s.found).length,
      partsTotal: totalParts,
      partsMatched: partHits.size,
    },
  };
}
