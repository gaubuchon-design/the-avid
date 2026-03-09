/**
 * @module ScatterGatherSearch
 *
 * Implements a scatter/gather search pattern across local shards and
 * remote mesh peers. A query is:
 *
 * 1. Executed against every locally-held shard (text search + ANN index).
 * 2. Fanned out to all connected peers via the {@link PeerDiscovery} layer.
 * 3. Results are collected (with a timeout), merged, and ranked by the
 *    {@link ResultRanker}.
 *
 * The search is intentionally "best-effort" — if a remote peer does not
 * respond within the timeout window, the search completes with whatever
 * results are available. The response metadata indicates how many nodes
 * were queried vs. how many responded.
 */

import type { ShardManager } from '../shard/ShardManager.js';
import type { PeerDiscovery } from './PeerDiscovery.js';
import type { IndexBuilder } from '../index/IndexBuilder.js';
import { ResultRanker } from './ResultRanker.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Query parameters for a mesh-wide search.
 */
export interface SearchQuery {
  /** Natural-language or keyword query text. */
  readonly text: string;
  /** Maximum number of results to return. */
  readonly topK: number;
  /** Optional modality filter (e.g. `['transcript', 'vision']`). */
  readonly modalities?: readonly string[];
  /** Minimum score threshold (0..1). Hits below this are discarded. */
  readonly threshold?: number;
  /** If `true`, include provenance metadata (node + shard IDs) in hits. */
  readonly includeProvenance?: boolean;
}

/**
 * A single search result from a specific node and shard.
 */
export interface SearchHit {
  /** Unique identifier of the matched record. */
  readonly id: string;
  /** Relevance score (higher is better). */
  readonly score: number;
  /** The source type (e.g. `'transcript'`, `'vision'`, `'asset'`). */
  readonly sourceType: string;
  /** The source record ID within the database. */
  readonly sourceId: string;
  /** The shard that produced this hit. */
  readonly shardId: string;
  /** The node that produced this hit. */
  readonly nodeId: string;
  /** Optional matched text snippet. */
  readonly text?: string;
  /** Optional start time in milliseconds (for time-based results). */
  readonly startTime?: number;
  /** Optional end time in milliseconds (for time-based results). */
  readonly endTime?: number;
}

/**
 * Aggregated search results from the scatter/gather operation.
 */
export interface MergedSearchResults {
  /** Ranked and deduplicated search hits. */
  readonly hits: readonly SearchHit[];
  /** Total number of raw hits before merging and deduplication. */
  readonly totalHits: number;
  /** Wall-clock time in milliseconds for the entire search. */
  readonly queryTimeMs: number;
  /** Number of nodes that were sent the query. */
  readonly nodesQueried: number;
  /** Number of nodes that responded within the timeout. */
  readonly nodesResponded: number;
}

/** Default search timeout (5 seconds). */
const DEFAULT_SEARCH_TIMEOUT_MS = 5_000;

// ─── ScatterGatherSearch ────────────────────────────────────────────────────

/**
 * Scatter/gather search engine for the knowledge-node mesh.
 *
 * Coordinates local shard search and remote peer fan-out to produce
 * a unified set of ranked results.
 */
export class ScatterGatherSearch {
  private readonly shardManager: ShardManager;
  private readonly peerDiscovery: PeerDiscovery;
  private readonly indexBuilder: IndexBuilder;
  private readonly ranker: ResultRanker;
  private readonly nodeId: string;
  private readonly searchTimeoutMs: number;

  /**
   * @param shardManager  - Local shard manager for DB access.
   * @param peerDiscovery - Peer network layer for fan-out.
   * @param indexBuilder  - ANN index builder for vector search.
   * @param nodeId        - This node's identifier.
   * @param searchTimeoutMs - Timeout for remote peer responses.
   */
  constructor(
    shardManager: ShardManager,
    peerDiscovery: PeerDiscovery,
    indexBuilder: IndexBuilder,
    nodeId: string,
    searchTimeoutMs: number = DEFAULT_SEARCH_TIMEOUT_MS,
  ) {
    this.shardManager = shardManager;
    this.peerDiscovery = peerDiscovery;
    this.indexBuilder = indexBuilder;
    this.ranker = new ResultRanker();
    this.nodeId = nodeId;
    this.searchTimeoutMs = searchTimeoutMs;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Execute a scatter/gather search across local shards and remote peers.
   *
   * @param query - The search parameters.
   * @returns Merged results with timing and node metadata.
   */
  async search(query: SearchQuery): Promise<MergedSearchResults> {
    const startMs = Date.now();

    // Phase 1: Search local shards.
    const localHits = this.searchLocal(query);

    // Phase 2: Fan out to remote peers.
    const connectedPeers = this.peerDiscovery.getConnectedPeers();
    const nodesQueried = connectedPeers.length;

    const remoteResults = await this.fanOutSearch(query);
    const nodesResponded = remoteResults.length;

    // Phase 3: Merge and rank.
    const merged = this.ranker.merge(localHits, remoteResults, query.topK);

    // Phase 4: Apply threshold filter.
    const filtered = query.threshold != null
      ? merged.filter((h) => h.score >= query.threshold!)
      : merged;

    const totalHits = localHits.length +
      remoteResults.reduce((sum, r) => sum + r.length, 0);

    return {
      hits: filtered,
      totalHits,
      queryTimeMs: Date.now() - startMs,
      nodesQueried: nodesQueried + 1, // +1 for local
      nodesResponded: nodesResponded + 1, // +1 for local (always responds)
    };
  }

  /**
   * Search only the local shards. Useful for handling incoming search
   * requests from remote peers without re-fanning out.
   *
   * @param query - The search parameters.
   * @returns An array of local search hits.
   */
  searchLocal(query: SearchQuery): SearchHit[] {
    const hits: SearchHit[] = [];
    const shards = this.shardManager.listShards();

    for (const manifest of shards) {
      try {
        const handle = this.shardManager.openShard(manifest.shardId);
        try {
          // Text search across transcript segments.
          if (!query.modalities || query.modalities.includes('transcript')) {
            const segments = handle.db.searchTranscripts(query.text, query.topK);
            for (const seg of segments) {
              hits.push({
                id: seg.id,
                score: this.computeTextScore(query.text, seg.text),
                sourceType: 'transcript',
                sourceId: seg.assetId,
                shardId: manifest.shardId,
                nodeId: this.nodeId,
                text: seg.text,
                startTime: seg.startTimeMs,
                endTime: seg.endTimeMs,
              });
            }
          }

          // Text search across assets.
          if (!query.modalities || query.modalities.includes('asset')) {
            const assets = handle.db.searchAssets(query.text);
            for (const asset of assets) {
              hits.push({
                id: asset.id,
                score: this.computeTextScore(query.text, asset.name),
                sourceType: 'asset',
                sourceId: asset.id,
                shardId: manifest.shardId,
                nodeId: this.nodeId,
                text: asset.name,
              });
            }
          }

          // ANN vector search if embeddings are present.
          if (!query.modalities || query.modalities.includes('embedding')) {
            const embeddings = handle.db.getAllEmbeddings(manifest.shardId);
            if (embeddings.length > 0) {
              const index = this.indexBuilder.buildIndex(handle.db);
              if (index.size() > 0) {
                // Generate a simple bag-of-characters query vector for demo.
                // In production this would call an embedding model.
                const queryVector = this.textToSimpleVector(query.text, embeddings[0]?.dimensions ?? 3);
                const annResults = index.search(queryVector, query.topK);

                for (const result of annResults) {
                  // Find the embedding chunk to get source metadata.
                  const chunk = embeddings.find((e) => e.id === result.id);
                  if (chunk) {
                    hits.push({
                      id: chunk.id,
                      score: result.score,
                      sourceType: chunk.sourceType,
                      sourceId: chunk.sourceId,
                      shardId: manifest.shardId,
                      nodeId: this.nodeId,
                      text: chunk.text ?? undefined,
                      startTime: chunk.startTimeMs ?? undefined,
                      endTime: chunk.endTimeMs ?? undefined,
                    });
                  }
                }
              }
            }
          }
        } finally {
          handle.db.close();
        }
      } catch {
        // Skip shards that fail to open.
      }
    }

    // Sort by score descending and limit to topK.
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, query.topK);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Fan out a search query to all connected peers and collect responses
   * within the timeout window.
   */
  private async fanOutSearch(query: SearchQuery): Promise<SearchHit[][]> {
    const peers = this.peerDiscovery.getConnectedPeers();
    if (peers.length === 0) return [];

    const results: SearchHit[][] = [];

    const peerPromises = peers.map(async (peer) => {
      try {
        const response = await Promise.race([
          this.peerDiscovery.sendToPeer(peer.nodeId, 'search', query),
          this.timeout(this.searchTimeoutMs),
        ]);

        if (response && typeof response === 'object' && 'hits' in (response as Record<string, unknown>)) {
          const peerHits = (response as { hits: SearchHit[] }).hits;
          results.push(peerHits);
        }
      } catch {
        // Peer didn't respond in time — skip.
      }
    });

    await Promise.allSettled(peerPromises);
    return results;
  }

  /**
   * Compute a simple text relevance score based on word overlap.
   *
   * This is a naive TF-like score for demonstration. In production,
   * this would use BM25 or a learned ranking model.
   */
  private computeTextScore(query: string, text: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const textLower = text.toLowerCase();

    if (queryTerms.length === 0) return 0;

    let matches = 0;
    for (const term of queryTerms) {
      if (textLower.includes(term)) {
        matches++;
      }
    }

    return matches / queryTerms.length;
  }

  /**
   * Generate a simple deterministic vector from text for demo purposes.
   *
   * In production, this would call an embedding model API.
   */
  private textToSimpleVector(text: string, dimensions: number): number[] {
    const vector = new Array<number>(dimensions).fill(0);
    const chars = text.toLowerCase();

    for (let i = 0; i < chars.length; i++) {
      const idx = i % dimensions;
      vector[idx] = (vector[idx] ?? 0) + chars.charCodeAt(i) / 256;
    }

    // Normalise to unit length.
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] = vector[i]! / norm;
      }
    }

    return vector;
  }

  /**
   * Create a promise that rejects after the specified delay.
   */
  private timeout(ms: number): Promise<never> {
    return new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }
}
