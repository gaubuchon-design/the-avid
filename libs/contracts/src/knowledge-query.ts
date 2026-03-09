/**
 * @module knowledge-query
 *
 * Types for semantic search and knowledge queries against the
 * Knowledge DB. Queries can span multiple modalities (transcript,
 * visual, marker, metadata, embedding) and return ranked results
 * with provenance information for trust and rights verification.
 */

// ─── Modality ─────────────────────────────────────────────────────────────────

/**
 * Content modalities that can be searched.
 * - `transcript` — speech-to-text transcript segments
 * - `visual`     — vision analysis events (scene detection, OCR, etc.)
 * - `marker`     — editor-created markers and annotations
 * - `metadata`   — asset-level metadata fields
 * - `embedding`  — raw vector similarity (any source)
 */
export type Modality = 'transcript' | 'visual' | 'marker' | 'metadata' | 'embedding';

// ─── Query Filter ─────────────────────────────────────────────────────────────

/** A single filter predicate applied to search results. */
export interface QueryFilter {
  /** Field name to filter on (e.g. `"tags"`, `"duration"`, `"speaker.name"`). */
  readonly field: string;
  /** Comparison operator. */
  readonly operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  /** Value to compare against. Type depends on the field and operator. */
  readonly value: unknown;
}

// ─── Semantic Query ───────────────────────────────────────────────────────────

/**
 * A semantic search query against the Knowledge DB.
 *
 * The query text is embedded at query time and compared against the
 * specified modalities. Results are ranked by cosine similarity and
 * filtered by the supplied predicates.
 */
export interface SemanticQuery {
  /** Natural-language query text. */
  readonly text: string;
  /** Modalities to search across. */
  readonly modalities: readonly Modality[];
  /** Optional filters to narrow results. */
  readonly filters: readonly QueryFilter[];
  /** Maximum number of results to return. */
  readonly topK: number;
  /** Minimum similarity score threshold in the range [0, 1]. */
  readonly threshold: number;
  /** Whether to include full provenance metadata in results. */
  readonly includeProvenance: boolean;
}

// ─── Result Provenance ────────────────────────────────────────────────────────

/**
 * Provenance metadata for a search result, recording where the data
 * came from and any rights or caching information.
 */
export interface ResultProvenance {
  /** Origin of the result data. */
  readonly source: 'local' | 'mesh-peer' | 'content-core';
  /** Mesh node that supplied the result, or `null` if local. */
  readonly nodeId: string | null;
  /** Shard the result was indexed in, or `null`. */
  readonly shardId: string | null;
  /** Filesystem or URI path to the underlying asset, or `null`. */
  readonly assetPath: string | null;
  /** Rights summary string, or `null` if unknown. */
  readonly rights: string | null;
  /** ISO 8601 timestamp when this result was last cached, or `null`. */
  readonly cachedAt: string | null;
}

// ─── Search Result ────────────────────────────────────────────────────────────

/**
 * A single ranked result from a semantic search query.
 */
export interface SearchResult {
  /** Unique result identifier. */
  readonly id: string;
  /** Cosine similarity score in the range [0, 1]. */
  readonly score: number;
  /** Modality of the source that produced this result. */
  readonly sourceType: Modality;
  /** ID of the source record (e.g. transcript segment, marker). */
  readonly sourceId: string;
  /** Knowledge DB shard the source belongs to. */
  readonly shardId: string;
  /** Mesh node ID that served this result, or `null` if local. */
  readonly nodeId: string | null;
  /** Matched text excerpt, or `null` for non-textual modalities. */
  readonly text: string | null;
  /** Start time in the source asset (seconds), or `null`. */
  readonly startTime: number | null;
  /** End time in the source asset (seconds), or `null`. */
  readonly endTime: number | null;
  /** Thumbnail URL for visual results, or `null`. */
  readonly thumbnailUrl: string | null;
  /** Provenance metadata describing the result's origin. */
  readonly provenance: ResultProvenance;
}

// ─── Timeline Jump ────────────────────────────────────────────────────────────

/**
 * A navigation target that positions the user at a specific point
 * in a sequence timeline, typically triggered from a search result.
 */
export interface TimelineJump {
  /** Target sequence identifier. */
  readonly sequenceId: string;
  /** Target track identifier. */
  readonly trackId: string;
  /** Target time position in seconds. */
  readonly time: number;
  /** Clip at the target position, or `null` if between clips. */
  readonly clipId: string | null;
  /** Human-readable description of why this jump was suggested. */
  readonly description: string;
}
