import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readFileRetry, writeFileAtomic } from '../atomicFile.js';
import { composite, normalizeCandidate, sameIdea } from './candidate.js';
import { PROMPT_VERSION, boardOutlineLines, buildAnalysisPrompt } from './prompts.js';
import { detectRetakeSignals } from './retakeSignals.js';
import { buildUtterances } from './utterances.js';

/**
 * Find the shorts in a transcript.
 *
 * Long recordings are cut into overlapping windows (a 40-minute talk is ~6,000 words, well inside a
 * model's context, but a focused window gives sharper judgement and a failure costs one window, not the
 * run). Each window is one model call whose answer is validated into candidates; candidates are then
 * de-duplicated across windows and held to a quality bar. Every model answer is cached by the exact
 * prompt, so re-analysing an unchanged recording costs nothing.
 */

export class AnalysisError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'AnalysisError';
    this.status = status;
  }
}

export const QUALITY = { hook: 6, clarity: 6, value: 6, audienceRelevance: 5 };
const FATAL = new Set([401, 402, 403]);
const isFatal = (err) => err?.name === 'NotConfiguredError' || FATAL.has(err?.status);

export function passesQuality(scores) {
  return Object.entries(QUALITY).every(([k, min]) => scores[k] >= min);
}

/* ------------------------------ model-answer cache ----------------------------- */

export function createLlmCache(dir) {
  const fileFor = (key) => path.join(dir, `${key}.json`);
  return {
    async get(key) {
      try {
        return JSON.parse(await readFileRetry(fileFor(key)));
      } catch {
        return null;
      }
    },
    async put(key, value) {
      await fs.mkdir(dir, { recursive: true });
      await writeFileAtomic(fileFor(key), JSON.stringify(value));
    },
  };
}

const promptKey = ({ system, user }, model) => createHash('sha256').update(`${PROMPT_VERSION}\n${model}\n${system}\n${user}`).digest('hex');

/* --------------------------------- windows ------------------------------------- */

/** Utterance ranges of about `size` words, each starting about `overlap` words before the previous one ended. */
export function makeWindows(utterances, { size = 2200, overlap = 200 } = {}) {
  const wordsIn = (u) => u.lastWord - u.firstWord + 1;
  const total = utterances.reduce((n, u) => n + wordsIn(u), 0);
  if (total <= size * 1.25) return [{ from: 0, to: utterances.length - 1 }];

  const windows = [];
  let from = 0;
  while (from < utterances.length) {
    let to = from;
    let count = 0;
    while (to < utterances.length && count < size) {
      count += wordsIn(utterances[to]);
      to += 1;
    }
    to -= 1;
    windows.push({ from, to });
    if (to >= utterances.length - 1) break;
    // Step back by `overlap` words, but always move forward.
    let back = to;
    let carried = 0;
    while (back > from + 1 && carried < overlap) {
      carried += wordsIn(utterances[back]);
      back -= 1;
    }
    from = Math.max(from + 1, back + 1);
  }
  // A tiny last window adds nothing the previous one did not already see.
  if (windows.length > 1) {
    const last = windows[windows.length - 1];
    const words = utterances.slice(last.from, last.to + 1).reduce((n, u) => n + wordsIn(u), 0);
    if (words < overlap * 1.5) windows.pop();
  }
  return windows;
}

/* ---------------------------------- retakes ------------------------------------ */

/** Every restart the detector saw, as stretches of the recording (for review, and to show what a clip cut). */
export function summarizeRetakes(utterances, signals) {
  const out = [];
  utterances.forEach((u, i) => {
    const kinds = signals[i].filter((s) => s.type === 'restart_marker' || s.type === 'abandoned' || s.type === 'repeated_opening');
    if (!kinds.length) return;
    const type = kinds[0].type;
    const previous = out[out.length - 1];
    if (previous && previous.lastUtterance === i - 1) {
      previous.end = u.end;
      previous.lastUtterance = i;
      previous.text += ` ${u.text}`;
      if (!previous.types.includes(type)) previous.types.push(type);
      return;
    }
    out.push({ start: u.start, end: u.end, firstUtterance: i, lastUtterance: i, types: [type], text: u.text });
  });
  return out.map(({ firstUtterance, lastUtterance, ...r }) => ({ ...r, utterances: [`u${firstUtterance}`, `u${lastUtterance}`] }));
}

/* ----------------------------------- analyze ----------------------------------- */

export async function analyzeTranscript({
  transcript, boardIndex = null, tally = null, provider, title = '', audience = '', sourceHash = '',
  cache = null, signal, onProgress, concurrency = 3, windowOptions,
}) {
  if (!provider?.live) {
    throw new AnalysisError('Finding shorts needs a DeepSeek key. Add DEEPSEEK_API_KEY and restart Apollo.', 503);
  }
  const model = provider.model || 'deepseek';
  const { utterances, words } = buildUtterances(transcript);
  if (utterances.length < 3) throw new AnalysisError('There is too little speech in this recording to look for shorts.', 422);
  const signals = detectRetakeSignals(utterances, words);
  const boardLines = boardOutlineLines(boardIndex, tally);
  const windows = makeWindows(utterances, windowOptions);
  const totalMinutes = Math.max(1, Math.round(transcript.duration / 60));

  const stats = { windows: windows.length, cachedWindows: 0, modelCalls: 0, proposed: 0, accepted: 0, rejected: [], lowQuality: 0, duplicates: 0 };
  const warnings = [];
  const proposed = [];
  let finished = 0;
  let succeeded = 0;

  async function runWindow(win, index) {
    const prompt = buildAnalysisPrompt({ title, audience, boardLines, utterances, signals, from: win.from, to: win.to, totalMinutes, windowIndex: index, windowCount: windows.length });
    const key = promptKey(prompt, model);
    let raw = cache ? await cache.get(key) : null;
    if (raw) {
      stats.cachedWindows += 1;
    } else {
      for (let attempt = 0; ; attempt += 1) {
        try {
          if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
          stats.modelCalls += 1;
          raw = await provider.completeJSON({ ...prompt, temperature: 0.3, maxTokens: 5000, signal });
          break;
        } catch (err) {
          if (isFatal(err) || err.name === 'AbortError' || attempt >= 1) throw err;
        }
      }
      if (cache && raw && Array.isArray(raw.shorts)) await cache.put(key, raw).catch(() => {});
    }

    const shorts = Array.isArray(raw?.shorts) ? raw.shorts : [];
    for (const short of shorts) {
      stats.proposed += 1;
      const { candidate, issue } = normalizeCandidate(short, { utterances, words, signals, sourceHash, tally, model });
      if (!candidate) {
        stats.rejected.push(issue);
        continue;
      }
      // A short that reaches outside its own window was seen without its context; the neighbouring window owns it.
      const ids = candidate.sourceSegments.flatMap((s) => [s.from, s.to]).map((v) => Number(v.slice(1)));
      if (windows.length > 1 && (Math.min(...ids) < win.from || Math.max(...ids) > win.to)) {
        stats.rejected.push(`"${candidate.title}": reaches outside its window`);
        continue;
      }
      proposed.push(candidate);
    }
  }

  // A small worker pool: windows are independent.
  let next = 0;
  const worker = async () => {
    while (next < windows.length) {
      const index = next;
      next += 1;
      try {
        await runWindow(windows[index], index);
        succeeded += 1;
      } catch (err) {
        if (isFatal(err) || err.name === 'AbortError') throw err;
        warnings.push(`Part ${index + 1} of ${windows.length} could not be analysed (${err.message}).`);
      }
      finished += 1;
      onProgress?.({ done: finished, total: windows.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, windows.length) }, worker));
  if (!succeeded) throw new AnalysisError("The model couldn't be reached to look for shorts. Try again in a moment.", 502);

  // Hold to the bar, then keep the stronger of any two that are the same idea.
  const good = proposed.filter((c) => {
    if (passesQuality(c.scores)) return true;
    stats.lowQuality += 1;
    return false;
  });
  good.sort((a, b) => b.score - a.score || a.sourceStart - b.sourceStart);
  const kept = [];
  for (const c of good) {
    if (kept.some((k) => sameIdea(k, c))) stats.duplicates += 1;
    else kept.push(c);
  }
  const ranked = kept.map((c, i) => ({ ...c, rank: i + 1 }));
  ranked.sort((a, b) => a.sourceStart - b.sourceStart);
  stats.accepted = ranked.length;

  return { candidates: ranked, retakes: summarizeRetakes(utterances, signals), stats, warnings, model, promptVersion: PROMPT_VERSION, utteranceCount: utterances.length };
}

export { composite };
