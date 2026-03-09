/**
 * @fileoverview Priority job queue for the render agent.
 *
 * {@link JobQueue} buffers incoming jobs, orders them by priority (highest
 * first), and provides FIFO ordering within the same priority level.
 *
 * Features:
 * - Fair scheduling with age-based priority boosting to prevent starvation
 * - Job timeout handling with configurable maxDuration
 * - Retry counting with configurable max retries
 * - Configurable queue size limits
 * - Graceful drain() for shutdown
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
  /** Number of times this job has been retried. */
  retryCount: number;
  /** Maximum number of retries allowed for this job. */
  readonly maxRetries: number;
  /** Maximum duration in milliseconds before the job is timed out. 0 = no limit. */
  readonly maxDurationMs: number;
  /** Timer handle for the timeout, if running. */
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

/** Configuration for the job queue. */
export interface JobQueueConfig {
  /** Maximum number of pending jobs the queue will hold. Default: 50. */
  readonly maxSize: number;
  /** Default maximum retries for jobs. Default: 3. */
  readonly defaultMaxRetries: number;
  /** Default maximum duration in ms before a job is timed out. 0 = no limit. Default: 0. */
  readonly defaultMaxDurationMs: number;
  /** Interval in ms for the fair-scheduling age boost check. Default: 10000. */
  readonly fairScheduleIntervalMs: number;
  /** Age in ms after which a queued job gets its effective priority boosted. Default: 30000. */
  readonly starvationThresholdMs: number;
  /** Maximum history entries to keep. Default: 500. */
  readonly maxHistorySize: number;
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
  /** Number of jobs that timed out. */
  readonly timedOut: number;
  /** Number of jobs that exhausted retries. */
  readonly retriesExhausted: number;
  /** Total number of jobs ever enqueued (including finished). */
  readonly totalEnqueued: number;
  /** Average wait time in ms for completed jobs. */
  readonly avgWaitTimeMs: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: JobQueueConfig = {
  maxSize: 50,
  defaultMaxRetries: 3,
  defaultMaxDurationMs: 0,
  fairScheduleIntervalMs: 10_000,
  starvationThresholdMs: 30_000,
  maxHistorySize: 500,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Compute the effective priority for a queued job, including age-based
 * boosting to prevent starvation of low-priority jobs.
 */
function effectivePriority(entry: QueuedJob, starvationThresholdMs: number): number {
  const basePriority = entry.job.priority ?? 0;
  const ageMs = Date.now() - new Date(entry.enqueuedAt).getTime();
  // For each full starvation interval the job has waited, boost priority by 1
  const ageBoost = starvationThresholdMs > 0
    ? Math.floor(ageMs / starvationThresholdMs)
    : 0;
  return basePriority + ageBoost;
}

/**
 * In-memory priority queue for render jobs.
 *
 * Jobs with higher `priority` values are dequeued first. Within the same
 * priority level, FIFO ordering is maintained.
 *
 * Fair scheduling: jobs that have been waiting longer than the configured
 * starvation threshold get their effective priority boosted, preventing
 * indefinite starvation of low-priority work.
 *
 * @example
 * ```ts
 * const q = new JobQueue({ maxSize: 10 });
 * q.enqueue(job1); // priority 0
 * q.enqueue(job2); // priority 5
 * q.dequeue(); // returns job2 (higher priority)
 * ```
 */
export class JobQueue {
  private readonly queue: QueuedJob[] = [];
  private readonly history: QueuedJob[] = [];
  private readonly config: JobQueueConfig;

  /** Counts for statistics tracking. */
  private timedOutCount = 0;
  private retriesExhaustedCount = 0;
  private totalWaitTimeMs = 0;
  private completedJobCount = 0;

  /** Tracked status counters to avoid O(n) scans on every access. */
  private _pendingCount = 0;
  private _runningCount = 0;

  /** Fair scheduling reorder timer. */
  private fairScheduleTimer: ReturnType<typeof setInterval> | null = null;

  /** Callback invoked when a running job times out. */
  private onJobTimeout: ((jobId: string) => void) | null = null;

  /** Whether the queue is draining (no new jobs accepted). */
  private draining = false;

  /** Resolver for drain promise. */
  private drainResolver: (() => void) | null = null;

  /**
   * @param config - Queue configuration. All fields optional; defaults applied.
   */
  constructor(config: Partial<JobQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startFairScheduler();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Number of pending (not yet started) jobs. O(1) via tracked counter. */
  get pendingCount(): number {
    return this._pendingCount;
  }

  /** Number of currently running jobs. O(1) via tracked counter. */
  get runningCount(): number {
    return this._runningCount;
  }

  /** Maximum queue size. */
  get maxSize(): number {
    return this.config.maxSize;
  }

  /** Whether the queue is currently draining. */
  get isDraining(): boolean {
    return this.draining;
  }

  /**
   * Register a callback to be invoked when a running job times out.
   * The callback receives the job ID and should cancel the associated work.
   */
  setTimeoutHandler(handler: (jobId: string) => void): void {
    this.onJobTimeout = handler;
  }

  /**
   * Add a job to the queue.
   *
   * @param job - The worker job to enqueue. Must have a non-empty id.
   * @param options - Override per-job retry/timeout settings.
   * @throws {Error} If the queue is full, draining, or the job is invalid.
   */
  enqueue(
    job: WorkerJob,
    options?: { maxRetries?: number; maxDurationMs?: number },
  ): QueuedJob {
    // Input validation
    if (!job || typeof job !== 'object') {
      throw new Error('enqueue() requires a valid job object');
    }
    if (!job.id || typeof job.id !== 'string') {
      throw new Error('enqueue() requires a job with a non-empty string id');
    }
    if (!job.type) {
      throw new Error(`enqueue() requires a job with a valid type, got: ${String(job.type)}`);
    }

    if (this.draining) {
      throw new Error(
        `Job queue is draining. Cannot enqueue job ${job.id}.`,
      );
    }

    if (this.pendingCount >= this.config.maxSize) {
      throw new Error(
        `Job queue is full (max ${this.config.maxSize}). Cannot enqueue job ${job.id}.`,
      );
    }

    // Check for duplicate job IDs
    const existingJob = this.queue.find((q) => q.job.id === job.id);
    if (existingJob) {
      throw new Error(
        `Job ${job.id} is already in the queue (status: ${existingJob.status})`,
      );
    }

    const entry: QueuedJob = {
      job,
      status: 'queued',
      enqueuedAt: isoNow(),
      retryCount: 0,
      maxRetries: options?.maxRetries ?? this.config.defaultMaxRetries,
      maxDurationMs: options?.maxDurationMs ?? this.config.defaultMaxDurationMs,
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
    this._pendingCount++;

    return entry;
  }

  /**
   * Remove and return the highest-priority pending job, or `null` if the
   * queue is empty.
   *
   * Uses fair scheduling: effective priority includes age-based boosting
   * so that long-waiting low-priority jobs eventually get served.
   */
  dequeue(): QueuedJob | null {
    // Find the best candidate using effective priority
    let bestIdx = -1;
    let bestPriority = -Infinity;

    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i]!;
      if (entry.status !== 'queued') continue;
      const ePri = effectivePriority(entry, this.config.starvationThresholdMs);
      if (ePri > bestPriority) {
        bestPriority = ePri;
        bestIdx = i;
      } else if (ePri === bestPriority && bestIdx >= 0) {
        // FIFO within same effective priority: keep the earlier one (lower index)
        // Since we scan forward and keep first match, this is already correct.
      }
    }

    if (bestIdx < 0) return null;

    const entry = this.queue[bestIdx]!;
    entry.status = 'running';
    this._pendingCount--;
    this._runningCount++;
    entry.startedAt = isoNow();

    // Record wait time
    const waitMs = Date.now() - new Date(entry.enqueuedAt).getTime();
    this.totalWaitTimeMs += waitMs;

    // Start timeout timer if configured
    if (entry.maxDurationMs > 0) {
      entry.timeoutTimer = setTimeout(() => {
        this.handleJobTimeout(entry.job.id);
      }, entry.maxDurationMs);
    }

    return entry;
  }

  /**
   * Peek at the next pending job without removing it.
   */
  peek(): QueuedJob | null {
    let bestEntry: QueuedJob | null = null;
    let bestPriority = -Infinity;

    for (const entry of this.queue) {
      if (entry.status !== 'queued') continue;
      const ePri = effectivePriority(entry, this.config.starvationThresholdMs);
      if (ePri > bestPriority) {
        bestPriority = ePri;
        bestEntry = entry;
      }
    }

    return bestEntry;
  }

  /**
   * Mark a job as completed and move it to history.
   */
  markCompleted(jobId: string): void {
    const entry = this.queue.find((q) => q.job.id === jobId);
    if (entry) {
      this.clearJobTimeout(entry);
      if (entry.status === 'running') this._runningCount--;
      else if (entry.status === 'queued') this._pendingCount--;
      entry.status = 'completed';
      entry.completedAt = isoNow();
      this.completedJobCount++;
      this.moveToHistory(jobId);
      this.checkDrainComplete();
    }
  }

  /**
   * Mark a job as failed and move it to history.
   * Detects OOM kills, disk full errors, and other non-retryable failures.
   *
   * @param jobId - The job ID that failed.
   * @param error - Error message describing the failure.
   * @returns `true` if the job can be retried (was re-queued), `false` if moved to history.
   */
  markFailed(jobId: string, error: string): boolean {
    const entry = this.queue.find((q) => q.job.id === jobId);
    if (!entry) return false;

    this.clearJobTimeout(entry);

    // Track the previous status for counter adjustment
    const prevStatus = entry.status;

    // Detect non-retryable failures
    const isOOM = error.includes('OOM') || error.includes('code 137') || error.includes('SIGKILL');
    const isDiskFull = error.includes('No space left on device') || error.includes('ENOSPC') || error.includes('Disk full');
    const isNonRetryable = isOOM || isDiskFull;

    if (isOOM) {
      console.error(`[JobQueue] Job ${jobId} failed due to OOM kill -- not retrying`);
    }
    if (isDiskFull) {
      console.error(`[JobQueue] Job ${jobId} failed due to disk full -- not retrying`);
    }

    // Check if retries are available and error is retryable
    if (!isNonRetryable && entry.retryCount < entry.maxRetries) {
      entry.retryCount++;
      // Transition from running back to queued
      if (prevStatus === 'running') { this._runningCount--; this._pendingCount++; }
      entry.status = 'queued';
      entry.startedAt = undefined;
      entry.error = `Retry ${entry.retryCount}/${entry.maxRetries}: ${error}`;
      return true;
    }

    // Exhausted retries or non-retryable failure
    if (prevStatus === 'running') this._runningCount--;
    else if (prevStatus === 'queued') this._pendingCount--;
    entry.status = 'failed';
    entry.completedAt = isoNow();
    if (isNonRetryable) {
      entry.error = `Non-retryable failure: ${error}`;
    } else {
      entry.error = `Exhausted ${entry.maxRetries} retries. Last error: ${error}`;
    }
    this.retriesExhaustedCount++;
    this.moveToHistory(jobId);
    this.checkDrainComplete();
    return false;
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
    this.clearJobTimeout(entry);
    this._pendingCount--;
    entry.status = 'cancelled';
    entry.completedAt = isoNow();
    this.moveToHistory(jobId);
    this.checkDrainComplete();
    return true;
  }

  /**
   * Cancel a running job (marks as failed with cancellation reason).
   *
   * @returns `true` if the job was found and marked.
   */
  cancelRunning(jobId: string, reason = 'Cancelled'): boolean {
    const entry = this.queue.find(
      (q) => q.job.id === jobId && q.status === 'running',
    );
    if (!entry) return false;

    this.clearJobTimeout(entry);
    this._runningCount--;
    entry.status = 'cancelled';
    entry.completedAt = isoNow();
    entry.error = reason;
    this.moveToHistory(jobId);
    this.checkDrainComplete();
    return true;
  }

  /**
   * Return aggregate queue statistics.
   */
  getStats(): QueueStats {
    // Use tracked counters for pending/running (O(1) instead of O(n))
    let completed = 0;
    let failed = 0;
    for (const h of this.history) {
      if (h.status === 'completed') completed++;
      if (h.status === 'failed') failed++;
    }

    const avgWaitTimeMs = this.completedJobCount > 0
      ? Math.round(this.totalWaitTimeMs / this.completedJobCount)
      : 0;

    return {
      pending: this._pendingCount,
      running: this._runningCount,
      completed,
      failed,
      timedOut: this.timedOutCount,
      retriesExhausted: this.retriesExhaustedCount,
      totalEnqueued: this.queue.length + this.history.length,
      avgWaitTimeMs,
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

  /**
   * Gracefully drain the queue: reject new enqueues and resolve when
   * all running and pending jobs have finished or been cancelled.
   *
   * @param timeoutMs - Maximum time to wait for drain in ms. Default: 60000.
   * @returns A promise that resolves when the queue is fully drained.
   */
  async drain(timeoutMs = 60_000): Promise<void> {
    this.draining = true;

    // Cancel all pending (not yet running) jobs
    const pendingJobs = this.queue.filter((q) => q.status === 'queued');
    for (const entry of pendingJobs) {
      this.clearJobTimeout(entry);
      this._pendingCount--;
      entry.status = 'cancelled';
      entry.completedAt = isoNow();
      entry.error = 'Queue draining';
      this.moveToHistory(entry.job.id);
    }

    // If nothing is running, resolve immediately
    if (this.runningCount === 0) {
      this.stopFairScheduler();
      return;
    }

    // Wait for running jobs to complete
    return new Promise<void>((resolve) => {
      this.drainResolver = resolve;

      // Safety timeout
      const safetyTimer = setTimeout(() => {
        // Force-fail remaining running jobs
        const stillRunning = this.queue.filter((q) => q.status === 'running');
        for (const entry of stillRunning) {
          this.clearJobTimeout(entry);
          this._runningCount--;
          entry.status = 'failed';
          entry.completedAt = isoNow();
          entry.error = 'Drain timeout exceeded';
          this.moveToHistory(entry.job.id);
        }
        this.stopFairScheduler();
        this.drainResolver = null;
        resolve();
      }, timeoutMs);

      // Prevent the timer from keeping the process alive
      if (typeof safetyTimer === 'object' && 'unref' in safetyTimer) {
        safetyTimer.unref();
      }
    });
  }

  /**
   * Stop internal timers. Call when the queue is no longer needed.
   */
  dispose(): void {
    this.stopFairScheduler();
    // Clear all timeout timers on running jobs
    for (const entry of this.queue) {
      this.clearJobTimeout(entry);
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Handle a job timeout: mark as timed out and invoke the handler. */
  private handleJobTimeout(jobId: string): void {
    const entry = this.queue.find(
      (q) => q.job.id === jobId && q.status === 'running',
    );
    if (!entry) return;

    this.timedOutCount++;
    entry.timeoutTimer = undefined;

    // Try to re-queue via markFailed (which handles retries)
    const retried = this.markFailed(jobId, `Job timed out after ${entry.maxDurationMs}ms`);

    // Notify the handler so it can cancel the actual worker process
    if (this.onJobTimeout) {
      this.onJobTimeout(jobId);
    }

    // If not retried, the job is already in history via markFailed
    void retried;
  }

  /** Clear the timeout timer on a job entry. */
  private clearJobTimeout(entry: QueuedJob): void {
    if (entry.timeoutTimer) {
      clearTimeout(entry.timeoutTimer);
      entry.timeoutTimer = undefined;
    }
  }

  private moveToHistory(jobId: string): void {
    const idx = this.queue.findIndex((q) => q.job.id === jobId);
    if (idx >= 0) {
      const [entry] = this.queue.splice(idx, 1) as [QueuedJob];
      // Clear timer ref before storing in history
      entry.timeoutTimer = undefined;
      this.history.push(entry);

      // Keep history bounded
      if (this.history.length > this.config.maxHistorySize) {
        this.history.splice(0, this.history.length - this.config.maxHistorySize);
      }
    }
  }

  /** Check if drain is complete (no more running or pending jobs). */
  private checkDrainComplete(): void {
    if (this.draining && this.runningCount === 0 && this.pendingCount === 0) {
      this.stopFairScheduler();
      if (this.drainResolver) {
        const resolver = this.drainResolver;
        this.drainResolver = null;
        resolver();
      }
    }
  }

  /**
   * Start the fair scheduling reorder timer.
   * Periodically re-sorts the pending queue by effective priority
   * so that age-boosted jobs bubble up.
   */
  private startFairScheduler(): void {
    if (this.config.fairScheduleIntervalMs <= 0) return;

    this.fairScheduleTimer = setInterval(() => {
      this.reorderByEffectivePriority();
    }, this.config.fairScheduleIntervalMs);

    // Don't keep the process alive just for the scheduler
    if (typeof this.fairScheduleTimer === 'object' && 'unref' in this.fairScheduleTimer) {
      this.fairScheduleTimer.unref();
    }
  }

  /** Stop the fair scheduling timer. */
  private stopFairScheduler(): void {
    if (this.fairScheduleTimer) {
      clearInterval(this.fairScheduleTimer);
      this.fairScheduleTimer = null;
    }
  }

  /**
   * Re-sort queued entries by their effective (age-boosted) priority.
   * Running entries keep their position.
   */
  private reorderByEffectivePriority(): void {
    // Separate running and queued entries
    const running: QueuedJob[] = [];
    const queued: QueuedJob[] = [];

    for (const entry of this.queue) {
      if (entry.status === 'running') {
        running.push(entry);
      } else if (entry.status === 'queued') {
        queued.push(entry);
      }
    }

    // Sort queued by effective priority descending, FIFO within same priority
    queued.sort((a, b) => {
      const aPri = effectivePriority(a, this.config.starvationThresholdMs);
      const bPri = effectivePriority(b, this.config.starvationThresholdMs);
      if (bPri !== aPri) return bPri - aPri;
      // FIFO: earlier enqueue first
      return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
    });

    // Rebuild the queue: running first, then queued
    this.queue.length = 0;
    this.queue.push(...running, ...queued);
  }
}
