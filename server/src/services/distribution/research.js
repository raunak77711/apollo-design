/**
 * The step before the Jam board: turning a topic into a draft brief.
 *
 * A separate provider layer on purpose — `ResearchProvider` is a different contract
 * from `AIProvider` (it answers with sources and a confidence label, not operations
 * or prose), so a future provider that actually browses the web is a new class
 * implementing this same interface, not a rewrite of this one.
 *
 * `DeepSeekResearchProvider` is what exists today, and it is NOT web research: DeepSeek
 * has no browsing tool here, so a draft only ever reflects what the model already
 * knew at training time. Every draft is labelled `verified: false` and the UI is
 * expected to show that label wherever the brief appears — this is reasoning from
 * memory, not a research pass, and must never be presented as the latter.
 */

export class ResearchProvider {
  /** @returns {Promise<{ title, audience, angle, outline: string[], verified: boolean, sources: string[], caveat: string }>} */
  async draftBrief(/* { topic, notes } */) {
    throw new Error('draftBrief() not implemented');
  }
}

const SYSTEM = `You help a creator turn a topic into a starting brief for a video essay. You have NO web access and NO current information — only what you already know. Never invent a statistic, a study, a date or a named source; if you don't know something precisely, say so in the outline rather than guessing a number.

Return ONLY JSON:
{
  "title": "a working title",
  "audience": "who this is for, one short phrase",
  "angle": "the one-sentence take that makes this worth watching, not just an overview",
  "outline": ["beat 1", "beat 2", ...]   // 6-14 short beats in a sensible order, each a phrase a Jam board section could be built from
}
No markdown, no commentary, no code fences.`;

export class DeepSeekResearchProvider extends ResearchProvider {
  /** `getProvider` is called fresh on every draft, same as the rest of Apollo — never a cached reference. */
  constructor({ getProvider }) {
    super();
    this.getProvider = getProvider;
  }

  get live() {
    return Boolean(this.getProvider?.()?.live);
  }

  async draftBrief({ topic, notes = '' }) {
    const provider = this.getProvider();
    if (!provider?.live) {
      throw Object.assign(new Error('Drafting a brief needs a DeepSeek key.'), { status: 503 });
    }
    const user = `TOPIC: ${topic}${notes ? `\nNOTES FROM THE CREATOR: ${notes}` : ''}\n\nReturn the JSON now.`;
    const raw = await provider.completeJSON({ system: SYSTEM, user, temperature: 0.5, maxTokens: 1200 });
    const outline = Array.isArray(raw?.outline) ? raw.outline.filter((s) => typeof s === 'string' && s.trim()).slice(0, 14).map((s) => s.trim()) : [];
    if (outline.length < 3) throw Object.assign(new Error("Couldn't draft a usable outline from that topic. Try a more specific one."), { status: 422 });
    return {
      title: String(raw.title || topic).slice(0, 120),
      audience: String(raw.audience || '').slice(0, 200),
      angle: String(raw.angle || '').slice(0, 400),
      outline,
      verified: false,
      sources: [],
      caveat: 'Drafted from the model\'s own training knowledge, with no web access. Treat every fact, name, number and claim as unverified until you check it yourself.',
    };
  }
}
