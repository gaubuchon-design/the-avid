/**
 * @module ConflictHandler
 *
 * Tracks and resolves conflicts that arise during mesh operations such
 * as lease contention, stale manifest detection, and incomplete
 * replication. Each conflict is recorded as an immutable event with an
 * optional resolution annotation.
 *
 * Conflicts are stored in an in-memory log. In a production system
 * these would be persisted to the shard database or a dedicated
 * conflict-log table.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Enumeration of conflict categories that the mesh can encounter.
 *
 * - `lease-loss`           — A node lost its writer lease (e.g. expired
 *                            or revoked by another node).
 * - `stale-manifest`       — The local manifest version is behind the
 *                            version advertised by a remote peer.
 * - `partial-replication`  — A replication stream ended before all
 *                            expected events were applied.
 * - `shard-mismatch`       — Two nodes disagree on the identity or
 *                            ownership of a shard.
 */
export type ConflictType =
  | 'lease-loss'
  | 'stale-manifest'
  | 'partial-replication'
  | 'shard-mismatch';

/**
 * An immutable record of a mesh conflict.
 */
export interface Conflict {
  /** Category of the conflict. */
  readonly type: ConflictType;
  /** The shard that the conflict pertains to. */
  readonly shardId: string;
  /** The node that detected or is affected by the conflict. */
  readonly nodeId: string;
  /** Human-readable description of what went wrong. */
  readonly description: string;
  /** ISO 8601 timestamp when the conflict was recorded. */
  readonly timestamp: string;
  /** Whether the conflict has been resolved. */
  readonly resolved: boolean;
  /** Optional resolution description. */
  readonly resolution?: string;
}

// ─── ConflictHandler ────────────────────────────────────────────────────────

/**
 * Records mesh conflicts and provides resolution tracking.
 *
 * All handler methods return the {@link Conflict} object that was
 * created, allowing callers to inspect or forward it immediately.
 */
export class ConflictHandler {
  /** Ordered conflict log (append-only). */
  private readonly conflicts: Conflict[] = [];

  // ── Conflict Generators ──────────────────────────────────────────────────

  /**
   * Record a lease-loss conflict.
   *
   * This is raised when a node discovers that its writer lease on a
   * shard has been lost — either because it expired or because another
   * node acquired the shard.
   *
   * @param shardId - The affected shard.
   * @param nodeId  - The node that lost the lease.
   * @returns The recorded {@link Conflict}.
   */
  handleLeaseLoss(shardId: string, nodeId: string): Conflict {
    const conflict: Conflict = {
      type: 'lease-loss',
      shardId,
      nodeId,
      description: `Node "${nodeId}" lost writer lease on shard "${shardId}". ` +
        'Pending writes must be re-queued or discarded.',
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    this.conflicts.push(conflict);
    return conflict;
  }

  /**
   * Record a stale-manifest conflict.
   *
   * Raised when a peer advertises a manifest version that is newer than
   * the local copy, indicating that the local shard data may be out of
   * date.
   *
   * @param shardId       - The affected shard.
   * @param localVersion  - The local manifest schema version or sequence.
   * @param remoteVersion - The version advertised by the remote peer.
   * @returns The recorded {@link Conflict}.
   */
  handleStaleManifest(
    shardId: string,
    localVersion: number,
    remoteVersion: number,
  ): Conflict {
    const conflict: Conflict = {
      type: 'stale-manifest',
      shardId,
      nodeId: 'local',
      description:
        `Shard "${shardId}" manifest is stale: local version ${localVersion} ` +
        `< remote version ${remoteVersion}. A sync is required.`,
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    this.conflicts.push(conflict);
    return conflict;
  }

  /**
   * Record a partial-replication conflict.
   *
   * Raised when a replication stream ends before the expected sequence
   * number is reached, leaving the replica in an incomplete state.
   *
   * @param shardId     - The affected shard.
   * @param expectedSeq - The sequence number the replica expected to reach.
   * @param actualSeq   - The sequence number actually reached.
   * @returns The recorded {@link Conflict}.
   */
  handlePartialReplication(
    shardId: string,
    expectedSeq: number,
    actualSeq: number,
  ): Conflict {
    const conflict: Conflict = {
      type: 'partial-replication',
      shardId,
      nodeId: 'local',
      description:
        `Shard "${shardId}" replication incomplete: expected sequence ${expectedSeq}, ` +
        `but only reached ${actualSeq}. Gap of ${expectedSeq - actualSeq} events.`,
      timestamp: new Date().toISOString(),
      resolved: false,
    };
    this.conflicts.push(conflict);
    return conflict;
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Return all conflicts that have not yet been resolved.
   */
  getUnresolved(): Conflict[] {
    return this.conflicts.filter((c) => !c.resolved);
  }

  /**
   * Return the full conflict log (both resolved and unresolved).
   */
  getAll(): Conflict[] {
    return [...this.conflicts];
  }

  // ── Resolution ───────────────────────────────────────────────────────────

  /**
   * Mark a conflict as resolved with an explanatory note.
   *
   * The conflict at the given index is replaced with a new object that
   * has `resolved: true` and the supplied resolution string.
   *
   * @param index      - Zero-based index into the conflict log.
   * @param resolution - Human-readable description of how the conflict
   *   was resolved.
   * @throws {RangeError} If the index is out of bounds.
   */
  resolveConflict(index: number, resolution: string): void {
    if (index < 0 || index >= this.conflicts.length) {
      throw new RangeError(
        `Conflict index ${index} is out of bounds (0..${this.conflicts.length - 1})`,
      );
    }

    const existing = this.conflicts[index]!;
    this.conflicts[index] = {
      ...existing,
      resolved: true,
      resolution,
    };
  }
}
