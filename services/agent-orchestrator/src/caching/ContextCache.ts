/**
 * @module ContextCache
 * @description Simple in-memory cache with TTL support for context data.
 *
 * Used to cache assembled prompt contexts, tool definitions, and other
 * frequently-accessed data so they are not recomputed on every request.
 *
 * In a production deployment this could be backed by Redis or Memcached;
 * the in-memory implementation keeps the orchestrator dependency-free.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Internal cache entry with value, creation time, and TTL. */
interface CacheEntry<T = unknown> {
  value: T;
  createdAt: number;
  ttlMs: number;
}

/** Statistics about cache usage. */
export interface CacheStats {
  /** Number of entries currently stored. */
  readonly size: number;
  /** Total cache hits since creation or last clear. */
  readonly hits: number;
  /** Total cache misses since creation or last clear. */
  readonly misses: number;
}

// ---------------------------------------------------------------------------
// ContextCache
// ---------------------------------------------------------------------------

/** Default TTL: 5 minutes. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Default maximum number of entries. */
const DEFAULT_MAX_SIZE = 10_000;

/**
 * In-memory key-value cache with per-entry TTL, maximum size cap, and basic
 * statistics. Evicts the oldest entries when the maximum size is reached.
 */
export class ContextCache {
  private store: Map<string, CacheEntry> = new Map();
  private hits = 0;
  private misses = 0;
  private readonly maxSize: number;

  /**
   * @param maxSize - Maximum number of entries before eviction (default: 10,000).
   */
  constructor(maxSize: number = DEFAULT_MAX_SIZE) {
    this.maxSize = maxSize;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Store a value in the cache.
   *
   * @param key   - Cache key.
   * @param value - Value to store.
   * @param ttlMs - Time-to-live in milliseconds (default: 5 minutes).
   */
  set(key: string, value: unknown, ttlMs: number = DEFAULT_TTL_MS): void {
    // Evict expired entries if we are at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.pruneExpired();

      // If still at capacity after pruning, evict the oldest 10%
      if (this.store.size >= this.maxSize) {
        const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
        const keys = this.store.keys();
        for (let i = 0; i < evictCount; i++) {
          const next = keys.next();
          if (next.done) break;
          this.store.delete(next.value);
        }
      }
    }

    this.store.set(key, {
      value,
      createdAt: Date.now(),
      ttlMs,
    });
  }

  /**
   * Retrieve a value from the cache.
   *
   * Returns `undefined` if the key does not exist or has expired.
   *
   * @param key - Cache key.
   * @returns The cached value, or `undefined`.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value as T;
  }

  /**
   * Check whether a key exists and has not expired.
   *
   * @param key - Cache key.
   * @returns `true` if the key is present and valid.
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (Date.now() - entry.createdAt > entry.ttlMs) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Remove a specific key from the cache.
   *
   * @param key - Cache key to invalidate.
   */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Remove all entries and reset statistics.
   */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache usage statistics.
   *
   * @returns Current size, hit count, and miss count.
   */
  getStats(): CacheStats {
    // Prune expired entries before reporting size
    this.pruneExpired();

    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Remove all expired entries from the store.
   */
  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > entry.ttlMs) {
        this.store.delete(key);
      }
    }
  }
}
