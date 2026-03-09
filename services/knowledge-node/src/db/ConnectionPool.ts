/**
 * @module ConnectionPool
 *
 * A lightweight connection pool for KnowledgeDB instances.  Because
 * `better-sqlite3` uses synchronous I/O, true concurrency gains come
 * from WAL mode readers — the pool primarily ensures callers do not
 * open (and forget to close) an unbounded number of connections, and
 * provides connection reuse with health checks.
 *
 * Usage:
 * ```ts
 * const pool = new ConnectionPool('/data/knowledge.db', { maxSize: 4 });
 * const db = pool.acquire();
 * try {
 *   db.listAssets();
 * } finally {
 *   pool.release(db);
 * }
 * // Or use the convenience helper:
 * const assets = pool.withConnection((db) => db.listAssets());
 * pool.destroy();
 * ```
 */

import { KnowledgeDB } from './KnowledgeDB.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the connection pool. */
export interface ConnectionPoolOptions {
  /** Maximum number of connections in the pool (default: 4). */
  readonly maxSize?: number;
  /** Maximum idle time in milliseconds before a connection is closed (default: 60 000). */
  readonly idleTimeoutMs?: number;
}

/** Internal wrapper tracking pool state for a single connection. */
interface PoolEntry {
  /** The database instance. */
  readonly db: KnowledgeDB;
  /** Timestamp when the connection was last released back into the pool. */
  lastReleasedAt: number;
  /** Whether the connection is currently in use. */
  inUse: boolean;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_SIZE = 4;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// ConnectionPool
// ---------------------------------------------------------------------------

/**
 * Manages a bounded pool of KnowledgeDB connections to a single
 * database file.
 */
export class ConnectionPool {
  /** Path to the SQLite database file. */
  private readonly dbPath: string;
  /** Pool configuration. */
  private readonly maxSize: number;
  private readonly idleTimeoutMs: number;
  /** All managed connections. */
  private readonly entries: PoolEntry[] = [];
  /** Whether the pool has been destroyed. */
  private destroyed = false;
  /** Periodic idle connection reaper. */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dbPath: string, options?: ConnectionPoolOptions) {
    this.dbPath = dbPath;
    this.maxSize = options?.maxSize ?? DEFAULT_MAX_SIZE;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

    // Start a periodic reaper for idle connections.
    this.cleanupTimer = setInterval(() => this.reapIdle(), this.idleTimeoutMs);
    this.cleanupTimer.unref();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Acquire a connection from the pool.
   *
   * If an idle connection is available it is returned immediately.
   * If all connections are in use but the pool has not reached its max
   * size, a new connection is created.
   *
   * @throws {Error} If the pool is destroyed or full.
   */
  acquire(): KnowledgeDB {
    if (this.destroyed) {
      throw new Error('ConnectionPool has been destroyed.');
    }

    // 1. Try to find an idle entry.
    for (const entry of this.entries) {
      if (!entry.inUse && !entry.db.isClosed) {
        entry.inUse = true;
        return entry.db;
      }
    }

    // 2. Create a new entry if below max size.
    if (this.entries.length < this.maxSize) {
      const db = new KnowledgeDB(this.dbPath);
      const entry: PoolEntry = { db, lastReleasedAt: Date.now(), inUse: true };
      this.entries.push(entry);
      return db;
    }

    throw new Error(
      `ConnectionPool exhausted: all ${this.maxSize} connections are in use.`,
    );
  }

  /**
   * Release a connection back to the pool.
   *
   * The connection remains open and available for reuse.
   *
   * @param db - The connection previously obtained from {@link acquire}.
   */
  release(db: KnowledgeDB): void {
    const entry = this.entries.find((e) => e.db === db);
    if (!entry) return; // Not managed by this pool — silently ignore.
    entry.inUse = false;
    entry.lastReleasedAt = Date.now();
  }

  /**
   * Convenience helper: acquire a connection, run a synchronous callback,
   * then release the connection back to the pool.
   *
   * @param fn - Callback receiving the acquired connection.
   * @returns The return value of `fn`.
   */
  withConnection<T>(fn: (db: KnowledgeDB) => T): T {
    const db = this.acquire();
    try {
      return fn(db);
    } finally {
      this.release(db);
    }
  }

  /**
   * Async variant of {@link withConnection}.
   */
  async withConnectionAsync<T>(fn: (db: KnowledgeDB) => Promise<T>): Promise<T> {
    const db = this.acquire();
    try {
      return await fn(db);
    } finally {
      this.release(db);
    }
  }

  /**
   * Get pool statistics.
   */
  getStats(): { total: number; inUse: number; idle: number; maxSize: number } {
    let inUse = 0;
    let idle = 0;
    for (const entry of this.entries) {
      if (entry.inUse) {
        inUse++;
      } else {
        idle++;
      }
    }
    return { total: this.entries.length, inUse, idle, maxSize: this.maxSize };
  }

  /**
   * Destroy the pool, closing all connections immediately.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    for (const entry of this.entries) {
      if (!entry.db.isClosed) {
        entry.db.close();
      }
    }
    this.entries.length = 0;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  /**
   * Close idle connections that have exceeded the idle timeout.
   * Always keeps at least one connection alive.
   */
  private reapIdle(): void {
    if (this.destroyed) return;

    const now = Date.now();
    let removed = 0;

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (
        !entry.inUse &&
        !entry.db.isClosed &&
        now - entry.lastReleasedAt > this.idleTimeoutMs &&
        // Always keep at least one connection alive.
        this.entries.length - removed > 1
      ) {
        entry.db.close();
        this.entries.splice(i, 1);
        removed++;
      }
    }
  }
}
