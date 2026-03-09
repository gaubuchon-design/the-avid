/**
 * @module embeddings
 *
 * Types for vector embeddings used by the Knowledge DB semantic search layer.
 * Embedding chunks are derived from transcripts, visual analysis, markers,
 * or general metadata and stored in per-shard ANN indices.
 */

// ─── Embedding Backend ────────────────────────────────────────────────────────

/**
 * Supported embedding model backends.
 * - `bge-m3`       — BAAI BGE-M3 multilingual model
 * - `nvidia-embed` — NVIDIA NeMo embedding service
 * - `custom`       — User-supplied model via adapter
 */
export type EmbeddingBackend = 'bge-m3' | 'nvidia-embed' | 'custom';

// ─── Embedding Chunk ──────────────────────────────────────────────────────────

/**
 * A single embedding vector derived from a source fragment.
 *
 * Vectors are serialised as `number[]` (from Float32Array) so the type
 * remains JSON-serialisable across process and network boundaries.
 */
export interface EmbeddingChunk {
  /** Unique chunk identifier. */
  readonly id: string;
  /** ID of the source record this embedding was derived from. */
  readonly sourceId: string;
  /** Category of the source material. */
  readonly sourceType: 'transcript' | 'vision' | 'marker' | 'metadata';
  /** Knowledge DB shard this chunk is indexed in. */
  readonly shardId: string;
  /** The embedding vector, serialised from Float32Array to `number[]`. */
  readonly vector: readonly number[];
  /** Model identifier used to produce this embedding. */
  readonly model: string;
  /** Dimensionality of the vector (e.g. 768, 1024). */
  readonly dimensions: number;
  /** Start time in the source asset (seconds), if time-aligned. */
  readonly startTime: number | null;
  /** End time in the source asset (seconds), if time-aligned. */
  readonly endTime: number | null;
  /** Source text that was embedded, if applicable. */
  readonly text: string | null;
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
}

// ─── Embedding Model ──────────────────────────────────────────────────────────

/** Describes an embedding model available to the system. */
export interface EmbeddingModel {
  /** Unique model identifier. */
  readonly id: string;
  /** Human-readable model name. */
  readonly name: string;
  /** Output vector dimensionality. */
  readonly dimensions: number;
  /** Backend that serves this model. */
  readonly backend: EmbeddingBackend;
  /** Semantic version of the model weights. */
  readonly version: string;
  /** ISO 639-1 language codes supported by this model. */
  readonly languages: readonly string[];
}

// ─── ANN Index Metadata ───────────────────────────────────────────────────────

/**
 * Metadata for an Approximate Nearest Neighbour index.
 *
 * One index is built per shard/model combination and is used for
 * low-latency semantic search at query time.
 */
export interface ANNIndexMeta {
  /** Unique index identifier. */
  readonly id: string;
  /** Knowledge DB shard this index covers. */
  readonly shardId: string;
  /** Embedding model the vectors in this index were produced by. */
  readonly modelId: string;
  /** Total number of vectors in the index. */
  readonly vectorCount: number;
  /** ISO 8601 timestamp of the last index build. */
  readonly buildTimestamp: string;
  /** Content-addressable checksum of the serialised index. */
  readonly checksum: string;
  /** ANN algorithm used to construct the index. */
  readonly algorithm: 'hnsw' | 'ivf';
}
