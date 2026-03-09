/**
 * @fileoverview Priority job queue for the render agent.
 *
 * {@link JobQueue} buffers incoming jobs, orders them by priority (highest
 * first), and provides FIFO ordering within the same priority level.
 *
 * The queue emits lifecycle events so that the {@link RenderAgent} can
 * report queue depth and wait times to the coordinator.
 */

import type { WorkerJob } from './index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a queued job. */
export type QueuedJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A job entry in the queue with metadata. */
export interface QueuedJob {
  /** The original worker job. */
  readonly job: WorkerJob;
  /** Current lifecycle status. */
  status: QueuedJobStatus;
  /** ISO-8601 timestamp of when the job was enqueued. */
  readonly enqueuedAt: string;
  /** ISO-8601 timestamp of when execution started (if it has). */
  startedAt?: string;
  /** ISO-8601 timestamp of when execution completed (if it has). */
  completedAt?: string;
  /** Error message if the job failed. */
  error?: string;
}

/** Snapshot of queue statistics. */
export interface QueueStats {
  /** Number of jobs waiting to be executed. */
  readonly pending: number;
  /** Number of jobs currently executing. */
  readonly running: number;
  /** Number of jobs completed successfully. */
  readonly completed: number;
  /** Number of jobs that failed. */
  readonly failed: number;
  /** Total number of jobs ever enqueued (including finished). */
  readonly totalEnqueued: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * In-memory priority queue for render jobs.
 *
 * Jobs with higher `priority` values are dequeued first. Within the same
 * priority level, FIFO ordering is maintained.
 *
 * @example
 * ```ts
 * const q = new JobQueue(10);
 * q.enqueue(job1); // priority 0
 * q.enqueue(job2); // priority 5
 * q.dequeue(); // returns job2 (higher priority)
 * ```
 */
export class JobQueue {
  private readonly queue: QueuedJob[] = [];
  private readonly history: QueuedJob[] = [];
  private readonly maxSize: number;

  /**
   * @param maxSize - Maximum number of pending jobs the queue will hold.
   *                  Enqueue calls beyond this limit throw an error.
   *                  Defaults to 50.
   */
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }

  /** Number of pending (not yet started) jobs. */
  get pendingCount(): number {
    return this.queue.filter((q) => q.status === 'queued').length;
  }

  /** Number of currently running jobs. */
  get runningCount(): number {
    return this.queue.filter((q) => q.status === 'running').length;
  }

  /**
   * Add a job to the queue.
   *
   * @throws If the queue is full.
   */
  enqueue(job: WorkerJob): QueuedJob {
    if (this.pendingCount >= this.maxSize) {
      throw new Error(
        `Job queue is full (max ${this.maxSize}). Cannot enqueue job ${job.id}.`,
      );
    }

    const entry: QueuedJob = {
      job,
      status: 'queued',
      enqueuedAt: isoNow(),
    };

    // Insert in priority-sorted position (higher priority closer to front).
    const priority = job.priority ?? 0;
    let insertIdx = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i]!;
      if (existing.status !== 'queued') continue;
      const existingPriority = existing.job.priority ?? 0;
      if (priority > existingPriority) {
        insertIdx = i;
        break;
      }
    }
    this.queue.splice(insertIdx, 0, entry);

    return entry;
  }

  /**
   * Remove and return the highest-priority pending job, or `null` if the
   * queue is empty.
   */
  dequeue(): QueuedJob | null {
    const idx = this.queue.findIndex((q) => q.status === 'queued');
    if (idx < 0) return null;

    const entry = this.queue[idx]!;
    entry.status = 'running';
    entry.startedAt = isoNow();
    return entry;
  }

  /**
   * Peek at the next pending job without removing it.
   */
  peek(): QueuedJob | null {
    return this.queue.find((q) => q.status === 'queued') ?? null;
  }

  /**
   * Mark a job as completed and move it to history.
   */
  markCompleted(jobId: string): void {
    const entry = this.queue.find((q) => q.job.id === jobId);
    if (entry) {
      entry.status = 'completed';
      entry.completedAt = isoNow();
      this.moveToHistory(jobId);
    }
  }

  /**
   * Mark a job as failed and move it to history.
   */
  markFailed(jobId: string, error: string): void {
    const entry = this.queue.find((q) => q.job.id === jobId);
    if (entry) {
      entry.status = 'failed';
      entry.completedAt = isoNow();
      entry.error = error;
      this.moveToHistory(jobId);
    }
  }

  /**
   * Cancel a specific queued job (must be in 'queued' state).
   *
   * @returns `true` if the job was found and cancelled.
   */
  cancel(jobId: string): boolean {
    const idx = this.queue.findIndex(
      (q) => q.job.id === jobId && q.status === 'queued',
    );
    if (idx < 0) return false;

    const entry = this.queue[idx]!;
    entry.status = 'cancelled';
    entry.completedAt = isoNow();
    this.moveToHistory(jobId);
    return true;
  }

  /**
   * Return aggregate queue statistics.
   */
  getStats(): QueueStats {
    let pending = 0;
    let running = 0;
    for (const q of this.queue) {
      if (q.status === 'queued') pending++;
      if (q.status === 'running') running++;
    }

    let completed = 0;
    let failed = 0;
    for (const h of this.history) {
      if (h.status === 'completed') completed++;
      if (h.status === 'failed') failed++;
    }

    return {
      pending,
      running,
      completed,
      failed,
      totalEnqueued: this.queue.length + this.history.length,
    };
  }

  /**
   * Return a snapshot of all pending/running jobs in priority order.
   */
  getActiveJobs(): readonly QueuedJob[] {
    return this.queue.filter(
      (q) => q.status === 'queued' || q.status === 'running',
    );
  }

  /**
   * Return the recent job history (completed/failed/cancelled).
   *
   * @param limit - Maximum number of entries to return (default 100).
   */
  getHistory(limit = 100): readonly QueuedJob[] {
    return this.history.slice(-limit);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private moveToHistory(jobId: string): void {
    const idx = this.queue.findIndex((q) => q.job.id === jobId);
    if (idx >= 0) {
      const [entry] = this.queue.splice(idx, 1) as [QueuedJob];
      this.history.push(entry);

      // Keep history bounded
      if (this.history.length > 500) {
        this.history.splice(0, this.history.length - 500);
      }
    }
  }
}
