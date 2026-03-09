/**
 * @module ShardLeaseManager
 *
 * Manages single-writer leases for Knowledge DB shards. Each shard may
 * be actively written to by at most one node at a time. The lease model
 * prevents concurrent-write conflicts in a distributed mesh where
 * multiple nodes may hold replicas of the same shard.
 *
 * Leases are held in memory with a configurable TTL. They must be
 * explicitly renewed before expiration or they become eligible for
 * acquisition by another node. A background cleanup sweep can be
 * triggered periodically via {@link ShardLeaseManager.cleanup}.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Represents a currently-held writer lease on a shard.
 *
 * All fields are `readonly` to enforce immutability — callers receive a
 * snapshot of lease state at a point in time. Mutations happen only
 * through the manager's public API which returns a new {@link Lease}
 * object on every state change.
 */
export interface Lease {
  /** The shard this lease applies to. */
  readonly shardId: string;
  /** Node ID of the current lease holder. */
  readonly holderId: string;
  /** ISO 8601 timestamp when the lease was first acquired. */
  readonly acquiredAt: string;
  /** ISO 8601 timestamp when the lease expires if not renewed. */
  readonly expiresAt: string;
  /** Number of times this lease has been successfully renewed. */
  readonly renewalCount: number;
}

/** Default lease duration when none is specified (30 seconds). */
const DEFAULT_LEASE_DURATION_MS = 30_000;

// ─── ShardLeaseManager ─────────────────────────────────────────────────────

/**
 * In-memory lease manager implementing a single-writer-per-shard model.
 *
 * Invariants:
 * - A shard can have at most one active (non-expired) lease at any time.
 * - Only the current holder may renew or release a lease.
 * - Expired leases are treated as absent — any node may acquire them.
 *
 * Thread-safety note: Node.js is single-threaded, so no locking is
 * required. In a clustered environment the lease state must be
 * coordinated through the mesh protocol (see {@link MeshService}).
 */
export class ShardLeaseManager {
  /** Active leases keyed by shard ID. */
  private readonly leases: Map<string, Lease> = new Map();

  /** Default lease duration in milliseconds. */
  private readonly defaultDurationMs: number;

  /**
   * @param defaultDurationMs - Default lease TTL. Overridable per
   *   acquisition via the `durationMs` parameter.
   */
  constructor(defaultDurationMs: number = DEFAULT_LEASE_DURATION_MS) {
    this.defaultDurationMs = defaultDurationMs;
  }

  // ── Acquire ──────────────────────────────────────────────────────────────

  /**
   * Attempt to acquire a writer lease on a shard.
   *
   * If the shard has no active lease, or the existing lease has expired,
   * the requesting node is granted a new lease. If another node already
   * holds a valid lease, `null` is returned.
   *
   * Re-acquiring a lease that the requesting node already holds is
   * permitted and behaves like a renewal.
   *
   * @param shardId    - The shard to lease.
   * @param nodeId     - The requesting node's identifier.
   * @param durationMs - Optional lease duration override.
   * @returns The new {@link Lease} on success, or `null` if the shard
   *   is already leased by a different node.
   */
  acquireLease(
    shardId: string,
    nodeId: string,
    durationMs?: number,
  ): Lease | null {
    const existing = this.leases.get(shardId);

    if (existing) {
      // If the existing lease is held by the same node, treat as renewal.
      if (existing.holderId === nodeId) {
        return this.renewLease(shardId, nodeId);
      }

      // If the existing lease is still valid, reject.
      if (!this.isExpired(existing)) {
        return null;
      }
    }

    const now = new Date();
    const duration = durationMs ?? this.defaultDurationMs;
    const lease: Lease = {
      shardId,
      holderId: nodeId,
      acquiredAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + duration).toISOString(),
      renewalCount: 0,
    };

    this.leases.set(shardId, lease);
    return lease;
  }

  // ── Renew ────────────────────────────────────────────────────────────────

  /**
   * Renew an existing lease, extending its expiration.
   *
   * Only the current holder may renew. Returns `null` if the lease does
   * not exist, has expired, or is held by a different node.
   *
   * @param shardId - The shard whose lease should be renewed.
   * @param nodeId  - The requesting node (must be the current holder).
   * @returns The renewed {@link Lease}, or `null` on failure.
   */
  renewLease(shardId: string, nodeId: string): Lease | null {
    const existing = this.leases.get(shardId);
    if (!existing) return null;
    if (existing.holderId !== nodeId) return null;
    if (this.isExpired(existing)) return null;

    const now = new Date();
    const renewed: Lease = {
      shardId,
      holderId: nodeId,
      acquiredAt: existing.acquiredAt,
      expiresAt: new Date(now.getTime() + this.defaultDurationMs).toISOString(),
      renewalCount: existing.renewalCount + 1,
    };

    this.leases.set(shardId, renewed);
    return renewed;
  }

  // ── Release ──────────────────────────────────────────────────────────────

  /**
   * Voluntarily release a lease.
   *
   * Only the current holder may release. If the lease does not exist or
   * belongs to another node, `false` is returned.
   *
   * @param shardId - The shard whose lease should be released.
   * @param nodeId  - The requesting node (must be the current holder).
   * @returns `true` if the lease was released, `false` otherwise.
   */
  releaseLease(shardId: string, nodeId: string): boolean {
    const existing = this.leases.get(shardId);
    if (!existing) return false;
    if (existing.holderId !== nodeId) return false;

    this.leases.delete(shardId);
    return true;
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Get the current lease for a shard, if any.
   *
   * Returns `null` if no lease exists. Note: the returned lease may
   * be expired — use {@link isLeaseHolder} for an expiry-aware check.
   *
   * @param shardId - The shard to query.
   */
  getLease(shardId: string): Lease | null {
    return this.leases.get(shardId) ?? null;
  }

  /**
   * Check whether a specific node currently holds a valid (non-expired)
   * lease on a shard.
   *
   * @param shardId - The shard to check.
   * @param nodeId  - The node to check.
   */
  isLeaseHolder(shardId: string, nodeId: string): boolean {
    const lease = this.leases.get(shardId);
    if (!lease) return false;
    if (lease.holderId !== nodeId) return false;
    return !this.isExpired(lease);
  }

  /**
   * Return all leases that have passed their expiration time.
   */
  getExpiredLeases(): Lease[] {
    const expired: Lease[] = [];
    for (const lease of this.leases.values()) {
      if (this.isExpired(lease)) {
        expired.push(lease);
      }
    }
    return expired;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  /**
   * Remove all expired leases from the internal store.
   *
   * This should be called periodically (e.g. on a heartbeat timer) to
   * prevent unbounded growth of stale lease entries.
   *
   * @returns The number of leases removed.
   */
  cleanup(): number {
    let removed = 0;
    for (const [shardId, lease] of this.leases.entries()) {
      if (this.isExpired(lease)) {
        this.leases.delete(shardId);
        removed++;
      }
    }
    return removed;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Determine whether a lease has passed its expiration time.
   */
  private isExpired(lease: Lease): boolean {
    return new Date(lease.expiresAt).getTime() <= Date.now();
  }
}
