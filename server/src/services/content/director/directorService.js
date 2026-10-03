import { buildBoardIndex } from '../boardIndex.js';
import { baselineDirector } from './baseline.js';
import { buildClip } from './clipTimeline.js';
import { clipBoardBlocks } from './clipBoard.js';
import { askDirector, buildDirectorPrompt } from './llmDirector.js';
import { DIRECTOR_VERSION, SOURCES, blocksIndex, normalizeDirectorTrack } from './schema.js';

/**
 * Produce a Director Track for one candidate.
 *
 *   ai: true   DeepSeek directs the edit; if its answer is unusable the baseline director takes over (and the
 *              track says so), so a short is never left without an edit because a model had a bad moment.
 *   ai: false  the baseline director: rules only, free, instant.
 *
 * Either way the events are validated and grounded against the real transcript before they are returned.
 */

export function contextFor({ candidate, transcript, snapshot, tally }) {
  const clip = buildClip(candidate, transcript);
  const index = snapshot?.spec ? buildBoardIndex(snapshot.spec) : null;
  const blocks = clipBoardBlocks(tally, clip.segments);
  return { clip, blocks, ctx: { words: clip.words, duration: clip.duration, blocks: blocksIndex(index) } };
}

export function packTrack({ events, issues, source, extra = {} }) {
  if (!SOURCES.includes(source)) throw new Error(`unknown director source: ${source}`);
  return { version: DIRECTOR_VERSION, source, generatedAt: new Date().toISOString(), events, ...(issues.length ? { issues } : {}), ...extra };
}

/** Validate a track from outside (an export edited by Claude or ChatGPT, or a hand edit) and wrap it. */
export function importTrack({ raw, candidate, transcript, snapshot, tally, source = 'external' }) {
  const { ctx } = contextFor({ candidate, transcript, snapshot, tally });
  const { events, issues } = normalizeDirectorTrack(raw, ctx);
  return packTrack({ events, issues, source });
}

export async function directCandidate({ candidate, transcript, snapshot, tally, provider, ai, cache, signal }) {
  const { clip, blocks, ctx } = contextFor({ candidate, transcript, snapshot, tally });

  if (ai && provider?.live) {
    try {
      const prompt = buildDirectorPrompt({ title: candidate.title, duration: clip.duration, words: clip.words, blocks });
      const { raw, cached } = await askDirector({ provider, prompt, cache, signal });
      const result = normalizeDirectorTrack(raw, ctx);
      if (result.events.length) return packTrack({ events: result.events, issues: result.issues, source: 'deepseek', extra: { model: provider.model || 'deepseek', cached } });
      // The model answered, but nothing it said survived validation.
      const fallback = normalizeDirectorTrack(baselineDirector({ clip, blocks }), ctx);
      return packTrack({ events: fallback.events, issues: [...result.issues, 'The AI director returned nothing usable; the rule-based edit was used.'], source: 'baseline', extra: { fellBack: true } });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      const fallback = normalizeDirectorTrack(baselineDirector({ clip, blocks }), ctx);
      return packTrack({ events: fallback.events, issues: ["The AI director couldn't be reached; the rule-based edit was used."], source: 'baseline', extra: { fellBack: true } });
    }
  }
  const result = normalizeDirectorTrack(baselineDirector({ clip, blocks }), ctx);
  return packTrack({ events: result.events, issues: result.issues, source: 'baseline' });
}
