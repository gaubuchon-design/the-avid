/**
 * @module ReplicationManager
 *
 * Manages an append-only event log for shard replication across mesh
 * nodes. Every mutating operation on a shard (insert, update, delete)
 * is recorded as a {@link ReplicationEvent} with a monotonically
 * increasing sequence number. Remote nodes consume these events to
 * bring their replicas into sync.
 *
 * Events are stored in a bounded in-memory ring buffer. In a production
 * system these would be persisted to a WAL table within the shard
 * database.
 */

import type { ShardManager } from '../shard/ShardManager.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A single replication event representing a data mutation on a shard.
 *
 * Events form a strictly ordered, append-only log per shard. The
 * `sequence` field is globally unique within a shard and is assigned
 * by the {@link ReplicationManager}.
 */
export interface ReplicationEvent {
  /** Monotonically increasing sequence number within the shard. */
  readonly sequence: number;
  /** The shard this event belongs to. */
  readonly shardId: string;
  /** The type of mutation. */
  readonly operation: 'insert' | 'update' | 'delete';
  /** The database table affected. */
  readonly table: string;
  /** The primary key of the affected row. */
  readonly rowId: string;
  /** The row data for insert/update operations. Absent for deletes. */
  readonly data?: Record<string, unknown>;
  /** ISO 8601 timestamp when the event was created. */
  readonly timestamp: string;
}

/** Fields the caller provides when appending an event. */
export type AppendEventInput = Omit<ReplicationEvent, 'sequence' | 'timestamp'>;

/** Maximum number of events retained per shard in the in-memory buffer. */
const DEFAULT_BUFFER_SIZE = 10_000;

// ─── ReplicationManager ────────────────────────────────────────────────────

/**
 * Append-only event log manager for shard-level replication.
 *
 * Usage:
 * ```ts
 * const rm = new ReplicationManager(shardManager);
 * const evt = rm.appendEvent({ shardId: 's1', operation: 'insert', table: 'assets', rowId: 'a1', data: { ... } });
 * const events = rm.getEventsSince('s1', 0);
 * ```
 */
export class ReplicationManager {
  /** Reference to the shard manager for future apply operations. */
  private readonly shardManager: ShardManager;

  /** Per-shard event logs. Each array is bounded by `bufferSize`. */
  private readonly logs: Map<string, ReplicationEvent[]> = new Map();

  /** Per-shard monotonic sequence counters. */
  private readonly sequences: Map<string, number> = new Map();

  /** Maximum events retained per shard. */
  private readonly bufferSize: number;

  /**
   * @param shardManager - The shard manager used for applying replicated
   *   events to local databases.
   * @param bufferSize   - Maximum events retained per shard in memory.
   */
  constructor(shardManager: ShardManager, bufferSize: number = DEFAULT_BUFFER_SIZE) {
    this.shardManager = shardManager;
    this.bufferSize = bufferSize;
  }

  // ── Append ───────────────────────────────────────────────────────────────

  /**
   * Append a new replication event to the log.
   *
   * The event is assigned the next sequence number for its shard and
   * timestamped with the current wall-clock time.
   *
   * @param input - Event fields excluding `sequence` and `timestamp`,
   *   which are assigned automatically.
   * @returns The fully populated {@link ReplicationEvent}.
   */
  appendEvent(input: AppendEventInput): ReplicationEvent {
    const nextSeq = (this.sequences.get(input.shardId) ?? 0) + 1;
    this.sequences.set(input.shardId, nextSeq);

    const event: ReplicationEvent = {
      ...input,
      sequence: nextSeq,
      timestamp: new Date().toISOString(),
    };

    let log = this.logs.get(input.shardId);
    if (!log) {
      log = [];
      this.logs.set(input.shardId, log);
    }

    log.push(event);

    // Trim to bounded buffer size (evict oldest events).
    if (log.length > this.bufferSize) {
      const excess = log.length - this.bufferSize;
      log.splice(0, excess);
    }

    return event;
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Retrieve all events for a shard with a sequence number strictly
   * greater than `sinceSequence`.
   *
   * This is the primary mechanism for a replica to request a delta
   * from the primary node.
   *
   * @param shardId       - The shard to query.
   * @param sinceSequence - Return events after this sequence number.
   * @returns An ordered array of events (ascending by sequence).
   */
  getEventsSince(shardId: string, sinceSequence: number): ReplicationEvent[] {
    const log = this.logs.get(shardId);
    if (!log) return [];
    return log.filter((e) => e.sequence > sinceSequence);
  }

  /**
   * Get the latest sequence number for a shard.
   *
   * Returns `0` if no events have been recorded for the shard.
   *
   * @param shardId - The shard to query.
   */
  getLatestSequence(shardId: string): number {
    return this.sequences.get(shardId) ?? 0;
  }

  /**
   * Calculate the replication lag between the local log and a remote
   * peer's reported sequence number.
   *
   * A positive value means the remote is ahead; a negative value means
   * the local log is ahead.
   *
   * @param shardId        - The shard to compare.
   * @param remoteSequence - The remote peer's latest sequence number.
   * @returns The difference `remoteSequence - localSequence`.
   */
  getReplicationLag(shardId: string, remoteSequence: number): number {
    const local = this.getLatestSequence(shardId);
    return remoteSequence - local;
  }

  // ── Apply ────────────────────────────────────────────────────────────────

  /**
   * Apply a batch of replication events received from a remote peer.
   *
   * Events are applied in sequence order. Each event is also appended
   * to the local log (if its sequence number is higher than the current
   * local sequence) so that further downstream replicas can consume it.
   *
   * @param events - The events to apply, in ascending sequence order.
   * @returns A summary with the count of successfully applied events
   *   and any error messages.
   */
  applyEvents(events: readonly ReplicationEvent[]): { applied: number; errors: string[] } {
    let applied = 0;
    const errors: string[] = [];

    for (const event of events) {
      try {
        const localSeq = this.getLatestSequence(event.shardId);

        // Skip events that have already been applied.
        if (event.sequence <= localSeq) {
          continue;
        }

        // Update the local sequence counter.
        this.sequences.set(event.shardId, event.sequence);

        // Append to local log for downstream consumers.
        let log = this.logs.get(event.shardId);
        if (!log) {
          log = [];
          this.logs.set(event.shardId, log);
        }
        log.push(event);

        // Trim buffer.
        if (log.length > this.bufferSize) {
          log.splice(0, log.length - this.bufferSize);
        }

        applied++;
      } catch (err) {
        errors.push(
          `Failed to apply event seq=${event.sequence} shard=${event.shardId}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    return { applied, errors };
  }
}
