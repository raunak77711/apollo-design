import { flagText } from './retakeSignals.js';
import { clockOf } from './utterances.js';

/**
 * What DeepSeek is told when it acts as the editor.
 *
 * It is given compact, numbered utterances (never audio, never the whole board) and answers with
 * utterance RANGES marked keep or discard. It does not write timestamps: code resolves ranges to
 * word times, so the model cannot drift a cut by a second or invent a moment that was never said.
 *
 * Bump PROMPT_VERSION when the instructions change in a way that should invalidate cached analysis.
 */

export const PROMPT_VERSION = 'shorts-v3';

export const SHORT_LIMITS = { minSeconds: 15, targetMin: 25, targetMax: 75, maxSeconds: 120 };

export const DISCARD_REASONS = ['restart_marker', 'abandoned_take', 'repeated_take', 'stutter', 'false_start', 'filler_burst', 'dead_air', 'aside', 'cut'];
export const KEEP_REASONS = ['clean_take', 'clean_retake', 'main'];

export const ANALYSIS_SYSTEM = `You are the editor of a channel of short-form business education videos (YouTube Shorts, Reels, TikTok). A creator recorded one long talking-head video about sales, marketing, websites and running a business. You receive its transcript as numbered utterances (u0, u1, u2 ...) with timestamps, plus an outline of the visual board the creator talked over. Your job: find EVERY standalone short worth publishing, and decide exactly which utterances each one keeps and which it cuts.

WHAT MAKES A SHORT
- It works for a viewer who has not seen the rest of the video: no "as I said earlier", no "this" with nothing to point at. If it needs context, include the utterances that give it, or skip it.
- It opens on a hook: a claim, a surprising number, a question or a problem in its FIRST kept utterance. Never open on "So", "And", "Okay", "Now", a throat-clear or a retake announcement.
- It teaches ONE idea a viewer can repeat to someone else, and lands a payoff: the answer, the reframe, the punchline.
- Useful business, sales, marketing or website knowledge. Skip filler, housekeeping, jokes with no point, plugs, and rambling.
- Length: the kept speech should run ${SHORT_LIMITS.targetMin}-${SHORT_LIMITS.targetMax} seconds. Never under ${SHORT_LIMITS.minSeconds} or over ${SHORT_LIMITS.maxSeconds}. Each utterance shows its length in seconds: ADD UP the seconds of what you keep before you commit. If an idea is shorter than that, widen the span to include the utterances that set it up or pay it off; if it still cannot reach ${SHORT_LIMITS.minSeconds} seconds, leave it out.
- When the same idea is explained twice, publish only the stronger version.
- There is NO quota. A section of the video may hold zero shorts or several. Find every genuinely publishable idea, and publish nothing that is merely adequate.

RETAKES (the most important rule)
The creator often stumbles, abandons a sentence, and then says the whole thing again properly. Utterances may carry flags from a detector:
  ⚑restart-marker   the creator announced a restart ("sorry", "let me say that again"): ALWAYS cut it.
  ⚑abandoned        a sentence broken off or ending in "sorry": cut it.
  ⚑repeated-in:uN   utterance uN begins the same way: this one is probably the false start and uN the clean retake. Cut this one, keep uN.
  ⚑fillers / ⚑long-pause   hesitation: cut it when it sits in a failed take, keep it when it is just a natural beat.
The flags are hints from a detector, not orders: judge for yourself. Rules:
- Prefer the LATER, clean, complete take. Keep it whole.
- Never stitch half of a failed take onto a retake. A take is kept entirely or cut entirely.
- A short must not begin or end inside a failed take.
- Do not cut natural pauses, emphasis or the creator's normal rhythm just because they are pauses. The finished speaker must still sound human.

HOW TO ANSWER
Return ONLY JSON: { "shorts": [ ... ] } (an empty list is a valid answer). Each short is a SPAN of consecutive utterances, plus the CUTS inside that span:
{
  "title": "a specific, curiosity-driven title, 3-9 words, no clickbait lies",
  "topic": "kebab-case topic, e.g. lead-generation",
  "reason": "one or two sentences: why a stranger would watch this and what they learn",
  "scores": { "hook": 1-10, "clarity": 1-10, "value": 1-10, "audienceRelevance": 1-10 },
  "from": "u41",
  "to": "u58",
  "cuts": [
    { "from": "u41", "to": "u43", "reason": "abandoned_take" },
    { "from": "u50", "to": "u50", "reason": "aside" }
  ]
}
- The short plays EVERYTHING from "from" to "to" except the utterances in "cuts". Do not list what you keep.
- A cut is only for what must not be heard: failed takes, restart announcements, fillers bursts, dead air, an off-topic aside. Never use a cut to skip over good content or to jump somewhere else in the video.
- If the clean retake comes right after a failed take, begin the span AT the failed take and cut it (as in u41-u43 above), so the failed take is recorded as removed. The first and last utterance NOT cut are what the viewer hears first and last.
- Cut reasons: ${DISCARD_REASONS.join(', ')}.
- Use ONLY utterance ids you were given. Never write times.
- Scores are honest: 10 is a short you would pin; 6 is publishable; below 6, leave the short out. A hook of 9 means the first sentence alone stops a thumb.
- No markdown, no commentary, no code fences.`;

/** The board as the editor needs it: each section's headline and where it is said in the video. */
export function boardOutlineLines(index, tally) {
  if (!index) return ['(no board linked)'];
  return index.sections.map((section) => {
    const t = tally?.sections?.find((s) => s.id === section.id);
    const said = t?.primary ? ` - said around ${clockOf(t.primary.start)}` : '';
    const heads = section.blocks
      .flatMap((b) => b.parts.filter((p) => p.role !== 'caption').slice(0, 2).map((p) => p.text))
      .slice(0, 3)
      .join(' | ');
    return `${section.id} ${section.kicker ? `[${section.kicker}] ` : ''}${section.title}${heads ? `: ${heads}` : ''}${said}`;
  });
}

export function transcriptLines(utterances, signals, from, to) {
  const lines = [];
  for (let i = from; i <= to; i += 1) {
    const u = utterances[i];
    lines.push(`u${u.id} [${clockOf(u.start)}-${clockOf(u.end)} ${Math.max(1, Math.round(u.end - u.start))}s] ${u.text}${flagText(signals[i])}`);
  }
  return lines;
}

export function buildAnalysisPrompt({ title, audience, boardLines, utterances, signals, from, to, totalMinutes, windowIndex, windowCount }) {
  const parts = [
    `VIDEO: ${title || 'Untitled recording'} (${totalMinutes} min)`,
    `AUDIENCE: ${audience || 'small business owners learning sales, marketing and websites'}`,
    '',
    'BOARD OUTLINE (the visual the creator talked over; "said around" is when):',
    ...boardLines,
    '',
    windowCount > 1
      ? `TRANSCRIPT, part ${windowIndex + 1} of ${windowCount} (u${from}-u${to}). Shorts must lie entirely inside this part; the start and end overlap the neighbouring parts, so a short cut off by the edge belongs to the neighbour.`
      : `TRANSCRIPT (u${from}-u${to}):`,
    ...transcriptLines(utterances, signals, from, to),
    '',
    'Return the JSON now.',
  ];
  return { system: ANALYSIS_SYSTEM, user: parts.join('\n') };
}
