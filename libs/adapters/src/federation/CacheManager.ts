/**
 * @fileoverview In-memory cache for remote Content Core results with
 * time-to-live (TTL) expiry.
 *
 * {@link CacheManager} wraps a simple `Map` with automatic expiration,
 * per-source invalidation, and hit/miss statistics.  It is intentionally
 * synchronous -- all entries live in process memory so there is no reason
 * to introduce async overhead.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single cached entry with provenance and expiry metadata. */
export interface CacheEntry<T> {
  /** The cached payload. */
  readonly data: T;
  /** ISO-8601 timestamp of when the entry was stored. */
  readonly cachedAt: string;
  /** ISO-8601 timestamp after which the entry is considered stale. */
  readonly expiresAt: string;
  /** Identifies which search backend produced this data. */
  readonly source: string;
}

/** Snapshot of cache performance counters. */
export interface CacheStats {
  /** Number of live (non-expired) entries. */
  readonly size: number;
  /** Total cache hits since creation or last {@link CacheManager.clear}. */
  readonly hits: number;
  /** Total cache misses since creation or last {@link CacheManager.clear}. */
  readonly misses: number;
  /** Total entries evicted (by TTL prune or explicit invalidation). */
  readonly evictions: number;
}

// ---------------------------------------------------------------------------
// Internal entry (mutable wrapper around the public shape)
// ---------------------------------------------------------------------------

interface InternalEntry<T> {
  readonly data: T;
  readonly cachedAt: string;
  readonly expiresAt: string;
  readonly source: string;
}

// ---------------------------------------------------------------------------
// CacheManager
// ---------------------------------------------------------------------------

/** Default TTL: 5 minutes. */
const DEFAULT_TTL_MS = 5 * 60 * 1_000;

/**
 * A lightweight in-memory cache keyed by arbitrary strings.
 *
 * Features:
 * - Per-entry TTL with automatic staleness detection on read.
 * - Source-level invalidation so that all entries originating from a
 *   specific backend can be flushed at once.
 * - Hit / miss / eviction counters exposed via {@link getStats}.
 * - {@link prune} for batch removal of expired entries.
 */
export class CacheManager {
  private readonly store = new Map<string, InternalEntry<unknown>>();
  private readonly defaultTtlMs: number;

  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;

  /**
   * @param defaultTtlMs - Default time-to-live in milliseconds for entries
   *                        that do not specify an explicit TTL.  Defaults to
   *                        5 minutes (300 000 ms).
   */
  constructor(defaultTtlMs: number = DEFAULT_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  /**
   * Store a value in the cache.
   *
   * If `key` already exists it is silently overwritten.
   *
   * @param key    - Lookup key (e.g. a search query fingerprint).
   * @param data   - Payload to cache.
   * @param source - Identifies the backend that produced the data.
   * @param ttlMs  - Optional per-entry TTL override in milliseconds.
   */
  set<T>(key: string, data: T, source: string, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.defaultTtlMs;
    const entry: InternalEntry<T> = {
      data,
      cachedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      source,
    };
    this.store.set(key, entry as InternalEntry<unknown>);
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  /**
   * Retrieve a cached entry, or `null` if the key is missing or expired.
   *
   * Expired entries are lazily evicted on access.
   */
  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.store.get(key);
    if (!entry) {
      this._misses++;
      return null;
    }
    if (this.isExpired(entry)) {
      this.store.delete(key);
      this._evictions++;
      this._misses++;
      return null;
    }
    this._hits++;
    return entry as CacheEntry<T>;
  }

  /**
   * Check whether a non-expired entry exists for `key`.
   *
   * Does **not** update hit/miss counters.
   */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      this._evictions++;
      return false;
    }
    return true;
  }

  // -----------------------------------------------------------------------
  // Invalidation
  // -----------------------------------------------------------------------

  /** Remove a single entry by key. */
  invalidate(key: string): void {
    if (this.store.delete(key)) {
      this._evictions++;
    }
  }

  /**
   * Remove **all** entries whose `source` field matches the given value.
   *
   * Useful when a backend signals that its data has changed.
   */
  invalidateBySource(source: string): void {
    for (const [key, entry] of this.store) {
      if (entry.source === source) {
        this.store.delete(key);
        this._evictions++;
      }
    }
  }

  /** Drop every entry and reset performance counters. */
  clear(): void {
    this.store.clear();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  // -----------------------------------------------------------------------
  // Maintenance
  // -----------------------------------------------------------------------

  /**
   * Scan the entire store and remove all expired entries.
   *
   * @returns The number of entries that were pruned.
   */
  prune(): number {
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
        this._evictions++;
        pruned++;
      }
    }
    return pruned;
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /**
   * Return a snapshot of the cache performance counters.
   *
   * `size` reflects the count of entries currently in the map, which may
   * include entries that are expired but have not yet been lazily evicted.
   * Call {@link prune} first for an accurate count.
   */
  getStats(): CacheStats {
    return {
      size: this.store.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
    };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private isExpired(entry: InternalEntry<unknown>): boolean {
    return new Date(entry.expiresAt).getTime() <= Date.now();
  }
}
