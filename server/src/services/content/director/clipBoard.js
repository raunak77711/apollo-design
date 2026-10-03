import { sourceToClip } from './clipTimeline.js';

/**
 * What the Jam board shows while a short plays: the tally's hits, restricted to the kept speech and
 * moved into clip time. This is the bridge from "she says THE LEAK" to "show block s5.b2 now".
 *
 *   [{ blockId, sectionId, type, parts: [{ path, text, role, hits: [{ at, end, score }] }], first, last, strength }]
 */

const round = (v) => Math.round(v * 100) / 100;

export function clipBoardBlocks(tally, segments) {
  if (!tally?.sections) return [];
  const out = [];
  for (const section of tally.sections) {
    for (const block of section.blocks) {
      const parts = [];
      for (const part of block.parts) {
        const hits = [];
        for (const h of part.hits) {
          const at = sourceToClip(segments, h.start);
          const end = sourceToClip(segments, h.end);
          if (at === null || end === null) continue;
          hits.push({ at, end: Math.max(end, at), score: h.score });
        }
        if (hits.length) parts.push({ path: part.path, text: part.text, role: part.role, hits });
      }
      if (!parts.length) continue;
      const all = parts.flatMap((p) => p.hits);
      out.push({
        blockId: block.id,
        sectionId: section.id,
        type: block.type,
        parts,
        first: round(Math.min(...all.map((h) => h.at))),
        last: round(Math.max(...all.map((h) => h.end))),
        strength: round(all.reduce((s, h) => s + h.score, 0)),
        coverage: block.coverage,
      });
    }
  }
  return out.sort((a, b) => a.first - b.first);
}

/**
 * The stretch of a short where a block is really being talked through: hits closer than `gap` seconds belong
 * together, and the cluster with the most different parts (then the most weight) wins. A block's words can be
 * scattered across a whole short (a common word like "traffic"), but an explanation is a cluster.
 */
export function bestCluster(block, gap = 4.5) {
  const hits = block.parts.flatMap((p) => p.hits.map((h) => ({ ...h, path: p.path }))).sort((a, b) => a.at - b.at);
  const clusters = [];
  for (const h of hits) {
    const last = clusters[clusters.length - 1];
    if (last && h.at - last.last <= gap) {
      last.last = Math.max(last.last, h.end);
      last.paths.add(h.path);
      last.strength += h.score;
    } else {
      clusters.push({ first: h.at, last: h.end, paths: new Set([h.path]), strength: h.score });
    }
  }
  if (!clusters.length) return null;
  clusters.sort((a, b) => b.paths.size - a.paths.size || b.strength - a.strength);
  const best = clusters[0];
  return { first: round(best.first), last: round(best.last), parts: best.paths.size, strength: round(best.strength) };
}
