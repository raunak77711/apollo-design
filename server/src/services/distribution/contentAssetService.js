import { tokenize } from '../content/text.js';
import { classify, classifyWithAI } from './classification.js';

/**
 * Turning approved, rendered shorts into the batch's pool of publishable assets —
 * the "160 raw candidates -> 42 good shorts" step, one level up from a single
 * recording. Content Factory's own analysis already quality-gates and deduplicates
 * *within* one video (`analysis/analyze.js`); this is the pass that catches the same
 * point made in two different long-forms from the same research round, which that
 * step has no way to see.
 *
 * Promotion is idempotent and safe to call again after every new approval: a
 * candidate already promoted is left alone, classification is only computed once,
 * and the dedup pass re-runs over the whole batch so a newly promoted asset can
 * still be caught as a duplicate of one promoted earlier (or vice versa — the
 * stronger of the two always wins, regardless of promotion order).
 */

const DUPLICATE_THRESHOLD = 0.8; // share of the smaller asset's distinctive words that must also appear in the other

/** Cross-video: never compares raw timestamps (meaningless across different source files), only what was actually said. */
export function sameConcept(a, b) {
  const ta = new Set(tokenize(a.text));
  const tb = new Set(tokenize(b.text));
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size) >= DUPLICATE_THRESHOLD;
}

export function createContentAssetService({ assets, batches, contentService, getProvider = () => null, log = console }) {
  async function renderFileFor(sessionId, candidate) {
    return `content/sessions/${sessionId}/${candidate.render.file}`;
  }

  /** Promote every eligible candidate (approved + rendered, not yet promoted) from every session in the batch. */
  async function promoteNew(batchId) {
    const batch = await batches.get(batchId);
    const existing = await assets.listByBatch(batchId);
    const already = new Set(existing.map((a) => `${a.sourceSessionId}:${a.candidateId}`));
    let created = 0;

    for (const sessionId of batch.sessionIds) {
      const session = await contentService.getSession(sessionId).catch(() => null);
      if (!session) continue;
      for (const candidate of session.candidates || []) {
        if (candidate.status !== 'approved' || candidate.render?.status !== 'done') continue;
        if (already.has(`${sessionId}:${candidate.id}`)) continue;

        const directorEvents = candidate.director?.events || [];
        const classification = await classifyWithAI({ candidate, directorEvents, provider: getProvider() }).catch(() => classify({ candidate, directorEvents }));
        await assets.create({
          batchId, sourceSessionId: sessionId, candidateId: candidate.id,
          title: candidate.title, description: candidate.reason, tags: [],
          text: candidate.text, hook: candidate.hook, score: candidate.score,
          classification, conceptId: classification.concept,
          renderFile: await renderFileFor(sessionId, candidate),
          duplicateOf: null, status: 'ready',
        });
        created += 1;
      }
    }
    if (created) await dedupe(batchId);
    return { created };
  }

  /** Re-group the whole batch's assets by what they actually say; the weakest in each duplicate cluster defers to the strongest. */
  async function dedupe(batchId) {
    const all = (await assets.listByBatch(batchId)).filter((a) => a.status !== 'archived');
    const bySourceOrder = [...all].sort((a, b) => (b.score || 0) - (a.score || 0));
    const clusters = []; // [{ keeper, members: [...] }]

    for (const asset of bySourceOrder) {
      const cluster = clusters.find((c) => sameConcept(c.keeper, asset));
      if (cluster) cluster.members.push(asset);
      else clusters.push({ keeper: asset, members: [asset] });
    }

    let changed = 0;
    for (const { keeper, members } of clusters) {
      for (const member of members) {
        const shouldBeDup = member.id !== keeper.id;
        const wasDup = Boolean(member.duplicateOf);
        if (shouldBeDup === wasDup && member.duplicateOf === (shouldBeDup ? keeper.id : null)) continue;
        await assets.update(member.id, (a) => { a.duplicateOf = shouldBeDup ? keeper.id : null; });
        changed += 1;
      }
    }
    return { clusters: clusters.length, changed };
  }

  return {
    promoteNew,
    dedupe,
    async listUnique(batchId) {
      return (await assets.listByBatch(batchId)).filter((a) => !a.duplicateOf && a.status !== 'archived');
    },
    async listAll(batchId) {
      return assets.listByBatch(batchId);
    },
  };
}
