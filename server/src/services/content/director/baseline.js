import { tokenize } from '../text.js';
import { bestCluster } from './clipBoard.js';
import { DEFAULT_DURATION } from './schema.js';

/**
 * The baseline director: a tasteful edit from rules alone, with no model.
 *
 * It is what you get with the AI-director toggle off, what the AI falls back to when its answer is
 * unusable, and a sensible starting point to edit by hand. It follows the same philosophy as the
 * rest of the product: visuals appear where they add meaning.
 *
 *   - a figure said aloud  -> a number callout
 *   - a board headline said -> that line set as a statement
 *   - a board diagram talked through -> that block, animated while it is explained
 *   - the distinctive words of what is said -> emphasis
 *   - one tighter camera move on the strongest moment, then back
 */

const TEXT_BLOCKS = new Set(['title', 'statement', 'bigtype', 'quote']);
const ANIMATION = {
  flow: 'progressive', list: 'progressive', cards: 'progressive', timeline: 'progressive', funnel: 'progressive', hub: 'progressive', loop: 'progressive',
  track: 'progressive', meter: 'progressive', matrix: 'progressive', equation: 'progressive', bucket: 'progressive', eliminate: 'progressive',
  compare: 'compare', zones: 'compare', panels: 'compare',
};
const round = (v) => Math.round(v * 100) / 100;

/** A number worth setting as type: a money amount, a percentage, a multiplier, or a figure of two digits or more. */
function numberEvents(words) {
  const found = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i].word;
    if (!/\d/.test(w)) continue;
    let value = w.replace(/[.,;:!?]+$/, '');
    const next = words[i + 1]?.word || '';
    const prev = words[i - 1]?.word || '';
    if (/^\.\d+/.test(next)) value += next.replace(/[.,;:!?]+$/, ''); // "8" ".32"
    if (/^(percent|%)/i.test(next) && !value.endsWith('%')) value += '%';
    if (/^(dollars?|bucks)$/i.test(next) && !value.startsWith('$')) value = `$${value}`;
    if (/^\$$/.test(prev) && !value.startsWith('$')) value = `$${value}`;
    const digits = value.replace(/\D/g, '');
    const strong = /[$%]|\d\/\d|x$/i.test(value);
    if (!strong && digits.length < 2) continue;
    found.push({ value, at: words[i].start, strong });
  }
  return found.sort((a, b) => Number(b.strong) - Number(a.strong) || a.at - b.at).slice(0, 2).sort((a, b) => a.at - b.at);
}

/** Distinctive words: long, said once, and part of what the board is showing. */
function emphasisWords(words, boardWords) {
  const counts = new Map();
  for (const w of words) {
    const k = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const picks = [];
  for (const w of words) {
    const k = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (k.length < 6 || counts.get(k) !== 1 || /\d/.test(k)) continue;
    const onBoard = tokenize(k).some((t) => boardWords.has(t));
    if (onBoard) picks.push({ text: w.word.replace(/[.,;:!?]+$/, ''), at: w.start, strength: 2 });
  }
  // Spread them out: emphasis is punctuation.
  const spaced = [];
  for (const p of picks) if (spaced.every((s) => Math.abs(s.at - p.at) >= 3.5)) spaced.push(p);
  return spaced.slice(0, 4);
}

export function baselineDirector({ clip, blocks = [] }) {
  const events = [];
  const boardWords = new Set(blocks.flatMap((b) => b.parts.flatMap((p) => tokenize(p.text))));

  // Board diagrams first: they take over the top of the screen, so everything else works around them.
  const windows = [];
  const diagrams = blocks
    .filter((b) => !TEXT_BLOCKS.has(b.type))
    .map((b) => ({ b, c: bestCluster(b) }))
    .filter(({ c }) => c && (c.parts >= 2 || c.strength >= 1.2))
    .sort((x, y) => y.c.parts - x.c.parts || y.c.strength - x.c.strength);
  for (const { b, c } of diagrams) {
    if (windows.length >= 2) break;
    const at = Math.max(0.6, c.first - 0.4);
    const duration = Math.min(10, Math.max(3.5, c.last + 2 - at));
    if (at + 2 > clip.duration) continue;
    if (windows.some((w) => at < w.end + 0.5 && at + duration > w.at - 0.5)) continue;
    windows.push({ at, end: at + duration });
    events.push({ type: 'board', at: round(at), sectionId: b.sectionId, blockId: b.blockId, animation: ANIMATION[b.type] || 'reveal', duration: round(duration) });
  }
  const covered = (t) => windows.some((w) => t >= w.at - 0.1 && t < w.end + 0.1);

  for (const n of numberEvents(clip.words)) if (!covered(n.at)) events.push({ type: 'number', at: n.at, value: n.value });

  // Board headlines said aloud become statements (outside any diagram).
  let statements = 0;
  for (const b of [...blocks].sort((x, y) => y.strength - x.strength)) {
    if (!TEXT_BLOCKS.has(b.type) || statements >= 2 || b.strength < 0.8) continue;
    const part = b.parts.find((p) => p.role === 'statement' || p.role === 'heading' || p.role === 'quote');
    if (!part || part.text.length > 48 || covered(part.hits[0].at)) continue;
    events.push({ type: 'statement', at: part.hits[0].at, text: part.text, style: b.type === 'quote' ? 'quiet' : 'loud' });
    statements += 1;
  }

  for (const e of emphasisWords(clip.words, boardWords)) events.push({ type: 'emphasis', ...e });

  // One tighter moment on the strongest beat (a number if there is one), then back to the normal framing.
  const anchor = events.find((e) => e.type === 'number') || events.find((e) => e.type === 'emphasis' && e.strength >= 2);
  if (anchor && anchor.at > 1.5 && clip.duration - anchor.at > 4) {
    events.push({ type: 'camera', action: 'punch_in', at: round(anchor.at - 0.2), amount: 1.12 });
    events.push({ type: 'camera', action: 'return', at: round(anchor.at + 3) });
  }
  return events.map((e) => (e.type === 'number' && e.duration === undefined ? { ...e, duration: DEFAULT_DURATION.number } : e));
}
