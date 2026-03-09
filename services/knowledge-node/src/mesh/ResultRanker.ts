/**
 * @module ResultRanker
 *
 * Merges and ranks search results from multiple mesh nodes. Scores are
 * normalised per-node using min–max scaling before being compared, which
 * compensates for different score distributions across heterogeneous
 * index implementations or shard sizes.
 *
 * The ranker also deduplicates results that appear on multiple nodes
 * (e.g. replicated shards) by keeping the highest-scoring instance.
 */

import type { SearchHit } from './ScatterGatherSearch.js';

// ─── ResultRanker ───────────────────────────────────────────────────────────

/**
 * Stateless utility for merging and ranking cross-node search results.
 */
export class ResultRanker {
  /**
   * Merge local and remote search hits into a single ranked list.
   *
   * Processing steps:
   * 1. Normalise scores within each node's result set using min–max
   *    scaling to the [0, 1] range.
   * 2. Combine all normalised hits into a single array.
   * 3. Sort by normalised score in descending order.
   * 4. Deduplicate by `sourceId` — when the same source appears from
   *    multiple nodes, the hit with the highest normalised score wins.
   * 5. Truncate to `topK`.
   *
   * @param localHits  - Hits from the local node's shards.
   * @param remoteHits - An array of hit arrays, one per responding
   *   remote peer.
   * @param topK       - Maximum number of results to return.
   * @returns A merged, ranked, deduplicated array of hits.
   */
  merge(
    localHits: SearchHit[],
    remoteHits: readonly SearchHit[][],
    topK: number,
  ): SearchHit[] {
    // Group all hits by their originating nodeId so we can normalise
    // per-node. Local hits share a single nodeId, remote hits may come
    // from several different nodes.
    const byNode = new Map<string, SearchHit[]>();

    for (const hit of localHits) {
      const list = byNode.get(hit.nodeId) ?? [];
      list.push(hit);
      byNode.set(hit.nodeId, list);
    }

    for (const peerHits of remoteHits) {
      for (const hit of peerHits) {
        const list = byNode.get(hit.nodeId) ?? [];
        list.push(hit);
        byNode.set(hit.nodeId, list);
      }
    }

    // Normalise scores within each node and flatten.
    const normalised: SearchHit[] = [];

    for (const [, nodeHits] of byNode) {
      const normed = this.normaliseScores(nodeHits);
      normalised.push(...normed);
    }

    // Sort descending by score.
    normalised.sort((a, b) => b.score - a.score);

    // Deduplicate by sourceId — keep highest scored.
    const seen = new Set<string>();
    const deduped: SearchHit[] = [];

    for (const hit of normalised) {
      if (seen.has(hit.sourceId)) continue;
      seen.add(hit.sourceId);
      deduped.push(hit);
    }

    return deduped.slice(0, topK);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Apply min–max normalisation to a set of hits, scaling scores into
   * the [0, 1] range. If all scores are identical, every hit receives
   * a normalised score of 1.0.
   *
   * A new array is returned — the input is not mutated.
   */
  private normaliseScores(hits: readonly SearchHit[]): SearchHit[] {
    if (hits.length === 0) return [];

    let min = Infinity;
    let max = -Infinity;

    for (const hit of hits) {
      if (hit.score < min) min = hit.score;
      if (hit.score > max) max = hit.score;
    }

    const range = max - min;

    return hits.map((hit) => ({
      ...hit,
      score: range === 0 ? 1.0 : (hit.score - min) / range,
    }));
  }
}
