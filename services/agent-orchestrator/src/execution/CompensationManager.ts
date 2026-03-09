/**
 * @module CompensationManager
 * @description Tracks compensation (undo) actions for executed plan steps.
 *
 * When a step executes a destructive operation the caller can register a
 * compensation function that reverses the effect. If the plan is later
 * rolled back the compensation manager invokes these functions in reverse
 * order to restore the timeline to its pre-plan state.
 *
 * ## Resilience
 *
 * - **Timeout**: Each compensation function is bounded by a configurable
 *   timeout to avoid indefinite hangs.
 * - **Retry**: Transient compensation failures are retried once before
 *   being recorded as failed.
 * - **Idempotency**: Compensations that have already executed are not
 *   re-invoked, and their prior result is returned immediately.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A registered compensation action for a single step. */
export interface CompensationEntry {
  /** Step identifier this compensation belongs to. */
  readonly stepId: string;
  /** Plan identifier this compensation belongs to. */
  readonly planId: string;
  /** Human-readable description of the undo action. */
  readonly description: string;
  /** ISO-8601 timestamp when the compensation was registered. */
  readonly registeredAt: string;
  /** Whether this compensation has been executed. */
  executed: boolean;
  /** Whether the compensation execution succeeded. */
  success?: boolean;
  /** Error message if compensation failed. */
  error?: string;
  /** ISO-8601 timestamp when the compensation was executed. */
  executedAt?: string;
  /** Wall-clock duration of the compensation in milliseconds. */
  durationMs?: number;
  /** Number of attempts made (1 = first try, 2 = retried once). */
  attempts?: number;
}

/** Internal entry with the actual compensation function. */
interface InternalCompensationEntry extends CompensationEntry {
  /** The compensation function to execute. */
  readonly compensate: () => Promise<void>;
}

/** Options for the CompensationManager. */
export interface CompensationManagerOptions {
  /** Timeout in milliseconds for each compensation function (default: 30 000). */
  readonly timeoutMs?: number;
  /** Number of retry attempts for transient failures (default: 1). */
  readonly maxRetries?: number;
}

/** Summary returned by plan-level compensation. */
export interface CompensationSummary {
  /** Number of steps successfully compensated. */
  readonly compensated: number;
  /** Number of steps that failed compensation. */
  readonly failed: number;
  /** Number of steps that were skipped (no compensation registered). */
  readonly skipped: number;
  /** Total wall-clock time for the compensation pass in milliseconds. */
  readonly totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 1;

// ---------------------------------------------------------------------------
// CompensationManager
// ---------------------------------------------------------------------------

/**
 * Manages undo/compensation actions for plan steps.
 *
 * Compensations are executed in reverse registration order (LIFO) to
 * unwind changes in the correct sequence.
 */
export class CompensationManager {
  /** All registered compensations keyed by step ID. */
  private compensations: Map<string, InternalCompensationEntry> = new Map();

  /** Compensation timeout in milliseconds. */
  private readonly timeoutMs: number;

  /** Maximum retry attempts for transient failures. */
  private readonly maxRetries: number;

  constructor(options?: CompensationManagerOptions) {
    this.timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register a compensation (undo) action for a step.
   *
   * @param stepId       - The step identifier.
   * @param compensation - Async function that reverses the step's effect.
   * @param description  - Human-readable description of the undo action.
   * @param planId       - Parent plan identifier.
   */
  registerCompensation(
    stepId: string,
    compensation: () => Promise<void>,
    description: string,
    planId: string = '',
  ): void {
    this.compensations.set(stepId, {
      stepId,
      planId,
      description,
      registeredAt: new Date().toISOString(),
      executed: false,
      compensate: compensation,
    });
  }

  /**
   * Execute the compensation for a single step.
   *
   * The compensation function is bounded by the configured timeout and
   * retried up to `maxRetries` times on transient failures.
   *
   * @param stepId - The step to compensate.
   * @returns `true` if the compensation succeeded, `false` otherwise.
   */
  async compensateStep(stepId: string): Promise<boolean> {
    const entry = this.compensations.get(stepId);
    if (!entry) {
      // No compensation registered -- silently return false
      return false;
    }

    if (entry.executed) {
      // Already executed -- return prior result
      return entry.success ?? false;
    }

    const start = Date.now();
    let lastError: string | undefined;
    const maxAttempts = 1 + this.maxRetries;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.executeWithTimeout(entry.compensate, entry.description);
        entry.executed = true;
        entry.success = true;
        entry.executedAt = new Date().toISOString();
        entry.durationMs = Date.now() - start;
        entry.attempts = attempt;
        return true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // Only retry if we have attempts remaining
        if (attempt < maxAttempts) {
          // Brief delay before retry (200ms)
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
        }
      }
    }

    // All attempts exhausted
    entry.executed = true;
    entry.success = false;
    entry.error = lastError;
    entry.executedAt = new Date().toISOString();
    entry.durationMs = Date.now() - start;
    entry.attempts = maxAttempts;
    return false;
  }

  /**
   * Compensate all executed steps in a plan, in reverse order.
   *
   * @param planId - The plan identifier.
   * @param steps  - The plan's step list (used to determine execution order).
   * @returns Summary with compensated, failed, and skipped counts.
   */
  async compensatePlan(
    planId: string,
    steps: { id: string; status: string }[],
  ): Promise<CompensationSummary> {
    const start = Date.now();
    let compensated = 0;
    let failed = 0;
    let skipped = 0;

    // Only compensate steps that have actually been executed (completed or failed)
    const executedSteps = steps
      .filter((s) => s.status === 'completed' || s.status === 'failed')
      .reverse(); // LIFO order

    for (const step of executedSteps) {
      const entry = this.compensations.get(step.id);
      if (!entry || entry.executed) {
        skipped++;
        continue;
      }

      const success = await this.compensateStep(step.id);
      if (success) {
        compensated++;
      } else {
        failed++;
      }
    }

    return {
      compensated,
      failed,
      skipped,
      totalDurationMs: Date.now() - start,
    };
  }

  /**
   * Get all compensation entries registered for a plan.
   *
   * @param planId - The plan identifier.
   * @returns Array of compensation entries (without the internal function).
   */
  getCompensations(planId: string): CompensationEntry[] {
    const entries: CompensationEntry[] = [];

    for (const entry of this.compensations.values()) {
      if (entry.planId === planId) {
        // Return a copy without the internal compensate function
        entries.push({
          stepId: entry.stepId,
          planId: entry.planId,
          description: entry.description,
          registeredAt: entry.registeredAt,
          executed: entry.executed,
          success: entry.success,
          error: entry.error,
          executedAt: entry.executedAt,
          durationMs: entry.durationMs,
          attempts: entry.attempts,
        });
      }
    }

    return entries;
  }

  /**
   * Check whether a step has a registered compensation.
   *
   * @param stepId - The step identifier.
   * @returns `true` if a compensation is registered.
   */
  hasCompensation(stepId: string): boolean {
    return this.compensations.has(stepId);
  }

  /**
   * Get the total number of registered compensations.
   */
  get size(): number {
    return this.compensations.size;
  }

  /**
   * Get aggregate statistics about all compensations.
   */
  getStats(): {
    total: number;
    executed: number;
    succeeded: number;
    failed: number;
    pending: number;
  } {
    let executed = 0;
    let succeeded = 0;
    let failedCount = 0;

    for (const entry of this.compensations.values()) {
      if (entry.executed) {
        executed++;
        if (entry.success) {
          succeeded++;
        } else {
          failedCount++;
        }
      }
    }

    return {
      total: this.compensations.size,
      executed,
      succeeded,
      failed: failedCount,
      pending: this.compensations.size - executed,
    };
  }

  /**
   * Remove all compensations (e.g. when resetting state).
   */
  clear(): void {
    this.compensations.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Execute a compensation function with timeout protection.
   */
  private async executeWithTimeout(
    fn: () => Promise<void>,
    description: string,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Compensation timed out after ${this.timeoutMs}ms: ${description}`)),
        this.timeoutMs,
      );
    });

    try {
      await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
  }
}
