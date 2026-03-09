/**
 * @fileoverview Unified ranking and provenance-preserving merge of search
 * results from heterogeneous backends.
 *
 * {@link ResultMerger} accepts two lists -- local mesh results and remote
 * Content Core results -- normalizes their scores onto a common 0-1 scale
 * using min-max normalization, applies a configurable local-boost
 * multiplier, then returns the top-K merged results sorted by descending
 * score.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single result returned by the local mesh / vector search. */
export interface LocalSearchResult {
  /** Unique identifier of the matching entity. */
  readonly id: string;
  /** Raw relevance score as produced by the local search backend. */
  readonly score: number;
  /** Kind of source (e.g. "transcript", "embedding", "bin"). */
  readonly sourceType: string;
  /** Matched text excerpt, if applicable. */
  readonly text?: string;
  /** Start timecode in seconds. */
  readonly startTime?: number;
  /** End timecode in seconds. */
  readonly endTime?: number;
  /** Mesh shard that produced the result. */
  readonly shardId?: string;
  /** Mesh node that produced the result. */
  readonly nodeId?: string;
}

/**
 * A result that has been normalized and enriched with provenance.
 *
 * `hydrationLevel` indicates how much detail has been fetched:
 * - `stub`    -- only id + score; no metadata.
 * - `summary` -- lightweight metadata (title, description, rights status).
 * - `full`    -- complete asset detail including media references.
 */
export interface FederatedResult {
  /** Unique identifier. */
  readonly id: string;
  /** Which backend produced this result. */
  readonly source: 'local' | 'content-core' | 'mesh';
  /** Normalized score in the range [0, 1]. */
  readonly score: number;
  /** Asset / entity title. */
  readonly title?: string;
  /** Short description. */
  readonly description?: string;
  /** Source type label (e.g. "transcript", "archive"). */
  readonly sourceType?: string;
  /** Matched text excerpt. */
  readonly text?: string;
  /** Start timecode in seconds. */
  readonly startTime?: number;
  /** End timecode in seconds. */
  readonly endTime?: number;
  /** Abbreviated rights information. */
  readonly rights?: {
    readonly status: string;
    readonly license?: string;
    readonly restrictions: readonly string[];
  };
  /** Current hydration depth. */
  readonly hydrationLevel: 'stub' | 'summary' | 'full';
  /** ISO-8601 timestamp of when the result was cached, if applicable. */
  readonly cachedAt?: string;
}

// ---------------------------------------------------------------------------
// ResultMerger
// ---------------------------------------------------------------------------

/**
 * Default multiplier applied to local results before ranking.
 *
 * A factor of 1.1 gives a mild preference for local data which is
 * inherently lower-latency and more likely to be fresh.
 */
const DEFAULT_LOCAL_BOOST = 1.1;

/**
 * Merges and ranks search results from local and remote sources.
 *
 * Usage:
 * ```ts
 * const merger = new ResultMerger();
 * const merged = merger.merge(localResults, remoteResults, 20);
 * ```
 */
export class ResultMerger {
  private readonly localBoost: number;

  /**
   * @param localBoost - Multiplier applied to normalized local scores.
   *                     Defaults to {@link DEFAULT_LOCAL_BOOST} (1.1).
   */
  constructor(localBoost: number = DEFAULT_LOCAL_BOOST) {
    this.localBoost = localBoost;
  }

  /**
   * Merge local and remote results into a single ranked list.
   *
   * @param localResults  - Results from the local mesh / vector DB.
   * @param remoteResults - Results already shaped as {@link FederatedResult}
   *                        (e.g. from Content Core).
   * @param topK          - Maximum number of results to return.
   * @returns Merged, deduplicated, and score-normalized results.
   */
  merge(
    localResults: readonly LocalSearchResult[],
    remoteResults: readonly FederatedResult[],
    topK: number,
  ): FederatedResult[] {
    const normalizedLocal = this.normalizeLocal(localResults);
    const normalizedRemote = this.normalizeRemote(remoteResults);

    // Build a map keyed by id to deduplicate; keep the higher-scored entry.
    const merged = new Map<string, FederatedResult>();

    for (const result of normalizedLocal) {
      const existing = merged.get(result.id);
      if (!existing || result.score > existing.score) {
        merged.set(result.id, result);
      }
    }

    for (const result of normalizedRemote) {
      const existing = merged.get(result.id);
      if (!existing || result.score > existing.score) {
        merged.set(result.id, result);
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  // -----------------------------------------------------------------------
  // Normalization helpers
  // -----------------------------------------------------------------------

  /**
   * Min-max normalize local results and convert them to
   * {@link FederatedResult} shape, applying the local boost.
   */
  private normalizeLocal(
    results: readonly LocalSearchResult[],
  ): FederatedResult[] {
    if (results.length === 0) return [];

    const scores = results.map((r) => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1; // avoid division by zero

    return results.map((r) => {
      const normalized = ((r.score - min) / range) * this.localBoost;
      return {
        id: r.id,
        source: 'local' as const,
        score: Math.min(normalized, 1), // clamp after boost
        sourceType: r.sourceType,
        text: r.text,
        startTime: r.startTime,
        endTime: r.endTime,
        hydrationLevel: 'stub' as const,
      };
    });
  }

  /**
   * Min-max normalize remote results, preserving existing metadata.
   */
  private normalizeRemote(
    results: readonly FederatedResult[],
  ): FederatedResult[] {
    if (results.length === 0) return [];

    const scores = results.map((r) => r.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    return results.map((r) => ({
      ...r,
      score: (r.score - min) / range,
    }));
  }
}
