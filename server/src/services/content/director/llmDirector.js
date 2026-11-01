import { createHash } from 'node:crypto';
import { ANNOTATION_KINDS, BOARD_ANIMATIONS, CAMERA_ACTIONS, LIMITS, STATEMENT_STYLES } from './schema.js';

/**
 * DeepSeek as the motion editor.
 *
 * It sees one short at a time, in clip time, with the board blocks the creator's words matched, and answers
 * with Director Track events from the closed vocabulary. It never writes code, styles, coordinates or
 * animation curves, and it does not time emphasis itself: the phrase it quotes is looked up in the real word
 * timestamps afterwards (schema.js), so a model that is a second off, or wrong about a word, cannot move
 * or invent a moment.
 *
 * Bump PROMPT_VERSION when the instructions change in a way that should invalidate cached answers.
 */

export const DIRECTOR_PROMPT_VERSION = 'director-v1';

export const DIRECTOR_SYSTEM = `You are the motion editor for a channel of short-form business education videos (TikTok, YouTube Shorts, Reels). You receive ONE short: its transcript in CLIP TIME (seconds from the start of the short), and the Jam board blocks the creator's words matched. You decide the visual punctuation: what appears on screen, and when. A deterministic engine draws everything; you choose only WHAT and WHEN, from the vocabulary below. You never write code, colours, coordinates or animation details.

PHILOSOPHY
- The base is the creator speaking to camera. Most of a short is simply them. A visual appears only when it adds meaning the words alone do not, then it goes away.
- This is NOT a karaoke caption video. Do not emphasise every sentence, do not decorate. A 40-second short has roughly: 2-5 emphasis, 0-2 numbers, 0-2 statements, 0-2 board visuals, 1-2 camera moves, 0-2 annotations. Fewer is fine. Nothing is also fine.
- Match the visual to the idea: a spoken figure is a number; the claim the short hangs on is a statement; a process or list the creator walks through is a board block (shown while they explain it); a contrast is a comparison.

EVENTS (all times are clip seconds; "at" is when it starts)
{ "type": "emphasis",   "at": 6.2, "text": "traffic", "strength": 1-3 }         1-${LIMITS.emphasisWords} words EXACTLY as spoken. 3 is the one word the short turns on.
{ "type": "number",     "at": 12.4, "value": "$10,000", "label": "optional" }  a figure said aloud, written as a viewer would read it: $10,000, 24/7, 40%.
{ "type": "statement",  "at": 18.0, "text": "TRAFFIC ≠ PROBLEM", "style": "${STATEMENT_STYLES.join('|')}", "duration": 2.4 }   at most ${LIMITS.statementChars} characters; the claim, distilled to a few words, in capitals when it is a headline.
{ "type": "camera",     "at": 5.4, "action": "${CAMERA_ACTIONS.join('|')}" }       punch_in = slightly tighter on the face for emphasis; punch_out = wider so the creator's hand movement shows; return = back to normal. Every punch_in/punch_out is followed by a return, at least ${LIMITS.cameraGap}s apart.
{ "type": "board",      "at": 11.2, "blockId": "s4.b2", "animation": "${BOARD_ANIMATIONS.join('|')}", "part": "steps.1 (optional)", "duration": 6 }   a Jam board block shown while the creator explains it. progressive = its parts appear one by one as they are spoken; reveal = all at once; focus = dim everything except "part"; highlight = pulse "part"; compare = left/right reveal. Use ONLY blockIds from the list you are given.
{ "type": "comparison", "at": 20.0, "left": "TRAFFIC", "right": "CONVERSION", "duration": 5 }   two ideas side by side when no board block fits.
{ "type": "annotation", "at": 9.0, "kind": "${ANNOTATION_KINDS.join('|')}", "text": "leak" }   an underline, circle or arrow on one spoken word.

RULES
- Only one board visual or comparison on screen at a time, ${LIMITS.boardMin}-${LIMITS.boardMax} seconds each. Statements and numbers cannot appear while a board visual is on screen.
- Time a board visual to start just before the creator begins explaining it and end soon after they finish.
- Never repeat the same word as emphasis twice. Never put an event in the first 0.6 seconds.
- Use only words that are really in the transcript for emphasis, number and annotation text.

Return ONLY JSON: { "events": [ ... ] }. No markdown, no commentary.`;

const clock = (s) => s.toFixed(1);

/** Sentence-ish lines of the clip with their clip times: enough for the model to place events. */
export function transcriptLines(words) {
  const lines = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    lines.push(`[${clock(current[0].start)}-${clock(current[current.length - 1].end)}] ${current.map((w) => w.word).join(' ')}`);
    current = [];
  };
  for (let i = 0; i < words.length; i += 1) {
    current.push(words[i]);
    const gap = (words[i + 1]?.start ?? Infinity) - words[i].end;
    if (/[.?!]$/.test(words[i].word) || gap > 0.7 || current.length >= 18) flush();
  }
  flush();
  return lines;
}

export function boardLines(blocks) {
  if (!blocks.length) return ['(no board blocks matched this short)'];
  return blocks.map((b) => {
    const parts = b.parts.slice(0, 8).map((p) => `${p.path}:"${p.text.slice(0, 40)}" @${clock(p.hits[0].at)}s`).join('  ');
    return `${b.blockId} (${b.type}) said ${clock(b.first)}-${clock(b.last)}s  ${parts}`;
  });
}

export function buildDirectorPrompt({ title, duration, words, blocks }) {
  const user = [
    `SHORT: ${title}`,
    `LENGTH: ${Math.round(duration)} seconds`,
    '',
    'TRANSCRIPT (clip time):',
    ...transcriptLines(words),
    '',
    'BOARD BLOCKS THE CREATOR\'S WORDS MATCHED (use these blockIds; the time is when they were said):',
    ...boardLines(blocks),
    '',
    'Return the JSON now.',
  ].join('\n');
  return { system: DIRECTOR_SYSTEM, user };
}

export const directorPromptKey = ({ system, user }, model) => createHash('sha256').update(`${DIRECTOR_PROMPT_VERSION}\n${model}\n${system}\n${user}`).digest('hex');

/** One model call. `cache` (optional) is the same prompt-keyed cache the analysis uses. */
export async function askDirector({ provider, prompt, cache, signal }) {
  const key = directorPromptKey(prompt, provider.model || 'deepseek');
  const hit = cache ? await cache.get(key) : null;
  if (hit) return { raw: hit, cached: true };
  const raw = await provider.completeJSON({ ...prompt, temperature: 0.3, maxTokens: 3000, signal });
  if (cache && raw && Array.isArray(raw.events)) await cache.put(key, raw).catch(() => {});
  return { raw, cached: false };
}
