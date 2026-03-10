/**
 * @module IndexBuilder
 *
 * Builds and rebuilds ANN indices from embedding chunks stored in a
 * {@link KnowledgeDB}. The index is a **derived sidecar** -- it can
 * always be reconstructed from the canonical SQLite data.
 *
 * ## Features
 *
 * - Build from all embeddings or filter by model ID.
 * - Build from a specific shard within the database.
 * - Rebuild in-place using a temp file round-trip.
 * - Progress reporting via an optional callback.
 *
 * Typical usage:
 * ```ts
 * const builder = new IndexBuilder();
 * const index = builder.buildIndex(db, { modelId: 'bge-m3' });
 * const results = index.search(queryVector, 10);
 * index.save('/path/to/index.json');
 * ```
 */

import { unlinkSync } from 'node:fs';
import { KnowledgeDB, bufferToVector } from '../db/KnowledgeDB.js';
import { BruteForceIndex, type IANNIndex } from './ANNIndex.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for building an index. */
export interface BuildIndexOptions {
  /** Optional model ID filter. Only embeddings from this model are included. */
  readonly modelId?: string;
  /** Optional shard ID filter. Only embeddings from this shard are included. */
  readonly shardId?: string;
  /** Optional progress callback invoked with (processed, total). */
  readonly onProgress?: (processed: number, total: number) => void;
}

/** Statistics from an index build operation. */
export interface BuildIndexResult {
  /** The populated index. */
  readonly index: IANNIndex;
  /** Number of embedding chunks processed. */
  readonly processed: number;
  /** Number of embedding chunks skipped due to errors. */
  readonly skipped: number;
  /** Total embedding chunks considered. */
  readonly total: number;
  /** Build duration in milliseconds. */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// IndexBuilder
// ---------------------------------------------------------------------------

/**
 * Constructs ANN indices from Knowledge DB embedding chunks.
 */
export class IndexBuilder {
  /**
   * Build a new ANN index from embedding chunks in the database.
   *
   * @param db      - An open {@link KnowledgeDB} instance to read embeddings from.
   * @param options - Optional filters and callbacks.
   * @returns A result object containing the populated index and build statistics.
   */
  buildIndex(db: KnowledgeDB, options?: BuildIndexOptions): BuildIndexResult {
    const start = Date.now();
    const index = new BruteForceIndex();
    const chunks = db.getAllEmbeddings(options?.shardId);
    const total = chunks.length;

    let processed = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      // Filter by model if specified
      if (options?.modelId && chunk.modelId !== options.modelId) {
        skipped++;
        continue;
      }

      try {
        const vector = bufferToVector(chunk.vector);
        index.add(chunk.id, Array.from(vector));
        processed++;
      } catch {
        // Skip corrupt or malformed vectors
        skipped++;
      }

      // Report progress periodically (every 500 chunks)
      if (options?.onProgress && (processed + skipped) % 500 === 0) {
        options.onProgress(processed + skipped, total);
      }
    }

    // Final progress report
    if (options?.onProgress) {
      options.onProgress(processed + skipped, total);
    }

    return {
      index,
      processed,
      skipped,
      total,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Clear an existing index and rebuild it from the database.
   *
   * This is equivalent to creating a brand-new index but re-uses the
   * same {@link IANNIndex} reference so callers do not need to update
   * their pointers.
   *
   * @param db            - An open {@link KnowledgeDB} instance.
   * @param existingIndex - The index to clear and repopulate.
   * @param options       - Optional filters and callbacks.
   * @returns A result object with the existing index now repopulated.
   */
  rebuildIndex(
    db: KnowledgeDB,
    existingIndex: IANNIndex,
    options?: BuildIndexOptions,
  ): BuildIndexResult {
    const { index: freshIndex, ...stats } = this.buildIndex(db, options);

    // If the existing index is a BruteForceIndex, we can swap data via
    // a temp serialisation round-trip. For other implementations this
    // falls back to returning the fresh index.
    if (existingIndex instanceof BruteForceIndex && freshIndex instanceof BruteForceIndex) {
      const tmpPath = `/tmp/.ann-rebuild-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
      freshIndex.save(tmpPath);
      existingIndex.load(tmpPath);

      // Clean up temp file best-effort
      try {
        unlinkSync(tmpPath);
      } catch {
        // Non-critical cleanup failure
      }
      return { index: existingIndex, ...stats };
    }

    return { index: freshIndex, ...stats };
  }
}
