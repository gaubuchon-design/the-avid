/**
 * @fileoverview Shared analytics schema for jobs that span Media Composer
 * and Pro Tools.
 *
 * {@link SharedJobHistory} records every audio-processing and handoff job
 * in a single in-memory ledger.  Both the MC agent orchestrator and the
 * Pro Tools bridge write to the same instance so that a unified history
 * is available for dashboards, cost tracking, and audit.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The kind of job that was executed. */
export type JobType =
  | 'dialogue-cleanup'
  | 'loudness-prep'
  | 'temp-music'
  | 'export'
  | 'handoff';

/** Lifecycle status of a job. */
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

/** A single entry in the shared job ledger. */
export interface JobHistoryEntry {
  /** Unique identifier for the job. */
  readonly id: string;
  /** Category of work. */
  readonly type: JobType;
  /** Current lifecycle status. */
  readonly status: JobStatus;
  /** ISO-8601 timestamp of when the job was created. */
  readonly startedAt: string;
  /** ISO-8601 timestamp of when the job finished (if it has). */
  readonly completedAt?: string;
  /** Wall-clock duration in milliseconds (set on completion). */
  readonly durationMs?: number;
  /** Arbitrary metrics collected during the job (loudness, peak, etc.). */
  readonly metrics?: Record<string, unknown>;
}

/** Filter criteria for querying job history. */
export interface JobHistoryFilter {
  /** Filter by job type. */
  readonly type?: string;
  /** Filter by status. */
  readonly status?: string;
}

/** Aggregate statistics over the job ledger. */
export interface JobHistoryStats {
  /** Total number of recorded jobs. */
  readonly total: number;
  /** Breakdown by job type. */
  readonly byType: Readonly<Record<string, number>>;
  /** Breakdown by status. */
  readonly byStatus: Readonly<Record<string, number>>;
  /** Mean wall-clock duration across all completed jobs (ms). */
  readonly avgDurationMs: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * In-memory ledger of all audio-processing and handoff jobs.
 *
 * This class is intentionally simple and side-effect-free so that it can
 * be serialized to disk or sent over the mesh without modification.
 *
 * @example
 * ```ts
 * const history = new SharedJobHistory();
 * history.recordJob({ id: 'j1', type: 'dialogue-cleanup', status: 'completed', ... });
 * const stats = history.getStats();
 * ```
 */
export class SharedJobHistory {
  private readonly entries: JobHistoryEntry[] = [];

  /**
   * Append a job entry to the ledger.
   *
   * If an entry with the same `id` already exists it is replaced in-place
   * (useful for updating status from `running` to `completed`).
   *
   * @param entry - The job record to store.
   */
  recordJob(entry: JobHistoryEntry): void {
    const idx = this.entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      this.entries[idx] = entry;
    } else {
      this.entries.push(entry);
    }
  }

  /**
   * Retrieve job history, optionally filtered by type and/or status.
   *
   * Results are returned in insertion order (oldest first).
   */
  getHistory(filter?: JobHistoryFilter): JobHistoryEntry[] {
    let result: JobHistoryEntry[] = [...this.entries];
    if (filter?.type) {
      result = result.filter((e) => e.type === filter.type);
    }
    if (filter?.status) {
      result = result.filter((e) => e.status === filter.status);
    }
    return result;
  }

  /**
   * Compute aggregate statistics over the entire ledger.
   */
  getStats(): JobHistoryStats {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalDurationMs = 0;
    let completedCount = 0;

    for (const entry of this.entries) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
      if (entry.durationMs !== undefined) {
        totalDurationMs += entry.durationMs;
        completedCount++;
      }
    }

    return {
      total: this.entries.length,
      byType,
      byStatus,
      avgDurationMs: completedCount > 0 ? totalDurationMs / completedCount : 0,
    };
  }

  /**
   * Serialize the entire ledger to a JSON string.
   *
   * The output is a JSON array of {@link JobHistoryEntry} objects.
   */
  exportJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}
