/**
 * @module IndexBuilder
 *
 * Builds and rebuilds ANN indices from embedding chunks stored in a
 * {@link KnowledgeDB}. The index is a **derived sidecar** — it can
 * always be reconstructed from the canonical SQLite data.
 *
 * Typical usage:
 * ```ts
 * const builder = new IndexBuilder();
 * const index = builder.buildIndex(db, 'bge-m3');
 * const results = index.search(queryVector, 10);
 * index.save('/path/to/index.json');
 * ```
 */

import { unlinkSync } from 'node:fs';
import { KnowledgeDB, bufferToVector } from '../db/KnowledgeDB.js';
import { BruteForceIndex, type IANNIndex } from './ANNIndex.js';

/**
 * Constructs ANN indices from Knowledge DB embedding chunks.
 */
export class IndexBuilder {
  /**
   * Build a new ANN index from all embedding chunks in the database.
   *
   * @param db      - An open {@link KnowledgeDB} instance to read
   *   embeddings from.
   * @param modelId - Optional model ID filter. If provided, only
   *   embeddings produced by this model are included.
   * @returns A populated {@link IANNIndex} ready for queries.
   */
  buildIndex(db: KnowledgeDB, modelId?: string): IANNIndex {
    const index = new BruteForceIndex();
    const chunks = db.getAllEmbeddings();

    for (const chunk of chunks) {
      // Filter by model if specified.
      if (modelId && chunk.modelId !== modelId) {
        continue;
      }

      try {
        const vector = bufferToVector(chunk.vector);
        index.add(chunk.id, Array.from(vector));
      } catch (err) {
        // Skip corrupt vectors — the chunk is omitted from the index.
        void err;
      }
    }

    return index;
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
   * @param modelId       - Optional model ID filter.
   * @returns The same index instance, now repopulated.
   */
  rebuildIndex(
    db: KnowledgeDB,
    existingIndex: IANNIndex,
    modelId?: string,
  ): IANNIndex {
    // Remove all existing entries.
    // Since IANNIndex doesn't expose an iterator, we build a fresh one
    // and copy into the existing if it supports that — or we return a
    // new one. The BruteForceIndex can simply be reloaded via save/load.
    const freshIndex = this.buildIndex(db, modelId);

    // If the existing index is a BruteForceIndex, we can swap data via
    // a temp serialisation round-trip. For other implementations this
    // falls back to returning the fresh index.
    if (existingIndex instanceof BruteForceIndex && freshIndex instanceof BruteForceIndex) {
      const tmpPath = `/tmp/.ann-rebuild-${Date.now()}.json`;
      freshIndex.save(tmpPath);
      existingIndex.load(tmpPath);

      // Clean up temp file best-effort.
      try {
        unlinkSync(tmpPath);
      } catch {
        // Non-critical cleanup failure.
      }
      return existingIndex;
    }

    return freshIndex;
  }
}
