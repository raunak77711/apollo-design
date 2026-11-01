/**
 * What a short is, for planning a calendar around: where it sits in the funnel, what
 * kind of hook it opens on, and what shape it is. Classified once, when a short is
 * promoted into a `ContentAsset` (an approved, keeper short) — not during shorts-finding,
 * so it never risks that already-stable pipeline.
 *
 * Funnel stage and hook type are closed enums with a free, deterministic heuristic
 * first; `classifyWithAI` can refine them with one DeepSeek call, but its answer is
 * only ever kept if it names a value from the same enum — exactly the pattern the
 * rest of Apollo uses for untrusted model output. Archetype (the format) is never
 * asked of a model at all: it is read straight off the Director Track's own event
 * composition, which already says, deterministically, whether a short is board-heavy,
 * number-heavy or a plain talking head.
 */

export const FUNNEL_STAGES = ['tofu', 'mofu', 'bofu'];
export const HOOK_TYPES = ['question', 'stat-shock', 'contrarian', 'story', 'how-to', 'warning', 'curiosity-gap', 'direct-claim'];
export const ARCHETYPES = ['board-explainer', 'comparison', 'data-forward', 'talking-head'];

const BOFU_WORDS = /\b(price|pricing|guarantee|risk.?free|refund|book a call|sign up|get started|case study|testimonial|proof|results?)\b/i;
const MOFU_WORDS = /\b(how to|step|framework|system|process|compare|versus|checklist|mistake|fix)\b/i;

/** Funnel stage from the short's own words — never from a model, so it costs nothing and never contradicts itself between runs. */
export function classifyFunnelStage({ hook = '', reason = '', topic = '' }) {
  const text = `${hook} ${reason} ${topic}`;
  if (BOFU_WORDS.test(text)) return 'bofu';
  if (MOFU_WORDS.test(text)) return 'mofu';
  return 'tofu';
}

export function classifyHookType(hook = '') {
  const h = hook.trim();
  if (/\?\s*$/.test(h)) return 'question';
  if (/\b\d+(\.\d+)?%|\$[\d,]+|\b\d+x\b/i.test(h)) return 'stat-shock';
  if (/\b(imagine|picture|one day|a customer|a client|let me tell you)\b/i.test(h)) return 'story';
  if (/\b(how to|step \d|here's how|the way to)\b/i.test(h)) return 'how-to';
  // An imperative caution ("Never do X", "Don't X", "Avoid X") is a warning; a flat claim with "not/isn't/wrong" is contrarian.
  if (/^(warning|don't|never|avoid)\b/i.test(h) || /\bmistake\b/i.test(h)) return 'warning';
  if (/\b(not|isn't|never|stop|myth|wrong|actually)\b/i.test(h)) return 'contrarian';
  if (/\.\.\.$|\bwhat (happens|happened)\b/i.test(h)) return 'curiosity-gap';
  return 'direct-claim';
}

/** Purely from what the Director Track decided to show — no model call, and it can never disagree with the rendered video. */
export function classifyArchetype(events = []) {
  const counts = events.reduce((n, e) => ({ ...n, [e.type]: (n[e.type] || 0) + 1 }), {});
  if (counts.comparison) return 'comparison';
  if (counts.board) return 'board-explainer';
  if ((counts.number || 0) >= 2) return 'data-forward';
  return 'talking-head';
}

export function classify({ candidate, directorEvents = [] }) {
  return {
    funnelStage: classifyFunnelStage(candidate),
    hookType: classifyHookType(candidate.hook),
    archetype: classifyArchetype(directorEvents),
    concept: candidate.topic || 'general',
  };
}

const AI_SYSTEM = `You classify ONE short-form video clip for a content calendar. You are given its hook (the first line), why it was selected, and its topic. Answer ONLY with JSON: { "funnelStage": "tofu"|"mofu"|"bofu", "hookType": "${HOOK_TYPES.join('"|"')}" }
tofu = broad awareness, a surprising idea, no ask. mofu = a how-to, a framework, a comparison — useful on its own, building trust. bofu = proof, pricing, a guarantee, a call to act — aimed at someone already considering buying. Pick the single best match for each. No markdown, no commentary.`;

/**
 * Ask DeepSeek to refine the deterministic guess. Its answer is used only where it
 * names a real enum value; anything else (a typo, an invented stage, no answer at
 * all because there's no live model) leaves the deterministic classification exactly
 * as it was — this can only ever improve on the heuristic, never break it.
 */
export async function classifyWithAI({ candidate, directorEvents, provider, signal }) {
  const base = classify({ candidate, directorEvents });
  if (!provider?.live) return base;
  try {
    const user = `HOOK: ${candidate.hook}\nWHY SELECTED: ${candidate.reason}\nTOPIC: ${candidate.topic}\n\nReturn the JSON now.`;
    const raw = await provider.completeJSON({ system: AI_SYSTEM, user, temperature: 0.2, maxTokens: 120, signal });
    return {
      ...base,
      funnelStage: FUNNEL_STAGES.includes(raw?.funnelStage) ? raw.funnelStage : base.funnelStage,
      hookType: HOOK_TYPES.includes(raw?.hookType) ? raw.hookType : base.hookType,
    };
  } catch {
    return base; // a failed or unreachable model is never fatal to classification
  }
}
