/**
 * @module ANNIndex
 *
 * Interface and in-memory implementation for Approximate Nearest
 * Neighbour (ANN) search over embedding vectors.
 *
 * The {@link BruteForceIndex} provides a correct-but-slow baseline
 * implementation using exhaustive cosine similarity. It is suitable
 * for development, testing, and small-to-medium collections (under
 * ~50 000 vectors). For production use, swap in an HNSW-backed
 * implementation when `hnswlib-node` is available.
 */

import { readFileSync, writeFileSync } from 'node:fs';

// ─── Interface ──────────────────────────────────────────────────────────────

/** A single search result returned by {@link IANNIndex.search}. */
export interface ANNSearchResult {
  /** The identifier of the matching vector. */
  id: string;
  /** Cosine similarity score in the range [-1, 1]. Higher is better. */
  score: number;
}

/**
 * Abstract interface for an ANN index.
 *
 * Implementations must be serialisable to/from disk so that the index
 * can be persisted alongside the shard database as a rebuild artifact.
 */
export interface IANNIndex {
  /**
   * Add a vector to the index.
   *
   * @param id     - Unique identifier for this vector.
   * @param vector - The embedding vector as a number array.
   */
  add(id: string, vector: number[]): void;

  /**
   * Search the index for the `topK` nearest neighbours to a query vector.
   *
   * @param query - The query embedding vector.
   * @param topK  - Maximum number of results to return.
   * @returns Ranked results sorted by descending similarity score.
   */
  search(query: number[], topK: number): ANNSearchResult[];

  /**
   * Remove a vector from the index by ID.
   *
   * @param id - The vector identifier to remove.
   */
  remove(id: string): void;

  /**
   * Return the number of vectors currently in the index.
   */
  size(): number;

  /**
   * Serialise the index to a file on disk.
   *
   * @param path - Filesystem path to write to.
   */
  save(path: string): void;

  /**
   * Load a previously saved index from disk.
   *
   * @param path - Filesystem path to read from.
   */
  load(path: string): void;
}

// ─── Brute Force Implementation ─────────────────────────────────────────────

/**
 * Serialised format for a {@link BruteForceIndex}.
 * Used by {@link BruteForceIndex.save} and {@link BruteForceIndex.load}.
 */
interface SerializedIndex {
  /** Format version for forward compatibility. */
  version: 1;
  /** Number of dimensions each vector has. */
  dimensions: number | null;
  /** Ordered list of vector entries. */
  entries: Array<{ id: string; vector: number[] }>;
}

/**
 * Brute-force ANN index using exhaustive cosine similarity.
 *
 * Time complexity:
 * - `add`:    O(1)
 * - `search`: O(n * d) where n = index size, d = dimensions
 * - `remove`: O(1)
 *
 * This is the baseline implementation used when no optimised library
 * (e.g. hnswlib-node) is available. It is accurate but not performant
 * for large collections.
 */
export class BruteForceIndex implements IANNIndex {
  /** Stored vectors keyed by ID. */
  private vectors: Map<string, Float32Array> = new Map();

  /**
   * Pre-computed L2 norms for each vector, cached for faster cosine
   * similarity computation.
   */
  private norms: Map<string, number> = new Map();

  /** Detected dimensionality (set from the first added vector). */
  private dimensions: number | null = null;

  // ── Core Operations ───────────────────────────────────────────────────

  /** @inheritdoc */
  add(id: string, vector: number[]): void {
    if (!id || typeof id !== 'string') {
      throw new Error('Vector ID must be a non-empty string');
    }
    if (vector.length === 0) {
      throw new Error('Vector must have at least one dimension');
    }
    if (this.dimensions === null) {
      this.dimensions = vector.length;
    } else if (vector.length !== this.dimensions) {
      throw new Error(
        `Dimension mismatch: expected ${this.dimensions}, got ${vector.length}`,
      );
    }

    const f32 = new Float32Array(vector);
    this.vectors.set(id, f32);
    this.norms.set(id, computeNorm(f32));
  }

  /**
   * Search using a min-heap to efficiently maintain top-K results without
   * sorting the entire result set.
   *
   * @inheritdoc
   */
  search(query: number[], topK: number): ANNSearchResult[] {
    if (this.vectors.size === 0) return [];
    if (topK <= 0) return [];

    const qf32 = new Float32Array(query);
    const qNorm = computeNorm(qf32);

    // Avoid division by zero for a zero-magnitude query.
    if (qNorm === 0) {
      return [];
    }

    // Use a simple array-based min-heap for efficient top-K tracking.
    // For small K relative to N this avoids the O(N log N) full sort.
    const heap: ANNSearchResult[] = [];

    for (const [id, vec] of this.vectors.entries()) {
      const vNorm = this.norms.get(id)!;
      if (vNorm === 0) continue;

      const dot = dotProduct(qf32, vec);
      const score = dot / (qNorm * vNorm);

      if (heap.length < topK) {
        heap.push({ id, score });
        // Bubble up to maintain min-heap (smallest score at index 0)
        heapBubbleUp(heap);
      } else if (heap.length > 0 && score > heap[0]!.score) {
        // Replace the smallest element and sift down
        heap[0] = { id, score };
        heapSiftDown(heap);
      }
    }

    // Extract results sorted descending by score
    const results: ANNSearchResult[] = [];
    while (heap.length > 0) {
      results.push(heap[0]!);
      // Move last element to root and sift down
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        heapSiftDown(heap);
      }
    }

    // Results were extracted in ascending order from the min-heap, so reverse
    results.reverse();
    return results;
  }

  /**
   * Add multiple vectors in a single call.
   *
   * @param entries - Array of { id, vector } pairs.
   */
  addBatch(entries: Array<{ id: string; vector: number[] }>): void {
    for (const entry of entries) {
      this.add(entry.id, entry.vector);
    }
  }

  /** @inheritdoc */
  remove(id: string): void {
    this.vectors.delete(id);
    this.norms.delete(id);
  }

  /** @inheritdoc */
  size(): number {
    return this.vectors.size;
  }

  // ── Persistence ───────────────────────────────────────────────────────

  /** @inheritdoc */
  save(path: string): void {
    const entries: Array<{ id: string; vector: number[] }> = [];
    for (const [id, vec] of this.vectors.entries()) {
      entries.push({ id, vector: Array.from(vec) });
    }

    const data: SerializedIndex = {
      version: 1,
      dimensions: this.dimensions,
      entries,
    };

    writeFileSync(path, JSON.stringify(data), 'utf-8');
  }

  /** @inheritdoc */
  load(path: string): void {
    const raw = readFileSync(path, 'utf-8');
    const data = JSON.parse(raw) as SerializedIndex;

    if (data.version !== 1) {
      throw new Error(`Unsupported index version: ${data.version}`);
    }

    this.vectors.clear();
    this.norms.clear();
    this.dimensions = data.dimensions;

    for (const entry of data.entries) {
      const f32 = new Float32Array(entry.vector);
      this.vectors.set(entry.id, f32);
      this.norms.set(entry.id, computeNorm(f32));
    }
  }
}

// ─── Math Helpers ───────────────────────────────────────────────────────────

/**
 * Compute the L2 (Euclidean) norm of a vector.
 *
 * @param v - The vector.
 * @returns The L2 norm.
 */
function computeNorm(v: Float32Array): number {
  let sum = 0;
  for (const val of v) {
    sum += val * val;
  }
  return Math.sqrt(sum);
}

/**
 * Compute the dot product of two vectors.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns The dot product.
 */
function dotProduct(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

// ─── Min-Heap Helpers (by score, smallest at root) ──────────────────────────

/**
 * Bubble up the last element in a min-heap to restore heap property.
 */
function heapBubbleUp(heap: ANNSearchResult[]): void {
  let idx = heap.length - 1;
  while (idx > 0) {
    const parent = Math.floor((idx - 1) / 2);
    if (heap[idx]!.score < heap[parent]!.score) {
      const tmp = heap[idx]!;
      heap[idx] = heap[parent]!;
      heap[parent] = tmp;
      idx = parent;
    } else {
      break;
    }
  }
}

/**
 * Sift down the root element in a min-heap to restore heap property.
 */
function heapSiftDown(heap: ANNSearchResult[]): void {
  let idx = 0;
  const len = heap.length;

  for (;;) {
    const left = 2 * idx + 1;
    const right = 2 * idx + 2;
    let smallest = idx;

    if (left < len && heap[left]!.score < heap[smallest]!.score) {
      smallest = left;
    }
    if (right < len && heap[right]!.score < heap[smallest]!.score) {
      smallest = right;
    }

    if (smallest !== idx) {
      const tmp = heap[idx]!;
      heap[idx] = heap[smallest]!;
      heap[smallest] = tmp;
      idx = smallest;
    } else {
      break;
    }
  }
}
