/**
 * @module CompensationManager
 * @description Tracks compensation (undo) actions for executed plan steps.
 *
 * When a step executes a destructive operation the caller can register a
 * compensation function that reverses the effect. If the plan is later
 * rolled back the compensation manager invokes these functions in reverse
 * order to restore the timeline to its pre-plan state.
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
}

/** Internal entry with the actual compensation function. */
interface InternalCompensationEntry extends CompensationEntry {
  /** The compensation function to execute. */
  readonly compensate: () => Promise<void>;
}

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
   * @param stepId - The step to compensate.
   * @returns `true` if the compensation succeeded, `false` otherwise.
   */
  async compensateStep(stepId: string): Promise<boolean> {
    const entry = this.compensations.get(stepId);
    if (!entry) {
      // No compensation registered — silently return false
      return false;
    }

    if (entry.executed) {
      // Already executed — return prior result
      return entry.success ?? false;
    }

    try {
      await entry.compensate();
      entry.executed = true;
      entry.success = true;
      return true;
    } catch (error) {
      entry.executed = true;
      entry.success = false;
      entry.error = error instanceof Error ? error.message : String(error);
      // Compensation failure recorded in the entry — callers check entry.success
      return false;
    }
  }

  /**
   * Compensate all executed steps in a plan, in reverse order.
   *
   * @param planId - The plan identifier.
   * @param steps  - The plan's step list (used to determine execution order).
   * @returns Summary of compensated and failed counts.
   */
  async compensatePlan(
    planId: string,
    steps: { id: string; status: string }[],
  ): Promise<{ compensated: number; failed: number }> {
    let compensated = 0;
    let failed = 0;

    // Only compensate steps that have actually been executed (completed or failed)
    const executedSteps = steps
      .filter((s) => s.status === 'completed' || s.status === 'failed')
      .reverse(); // LIFO order

    for (const step of executedSteps) {
      const entry = this.compensations.get(step.id);
      if (!entry || entry.executed) {
        continue;
      }

      const success = await this.compensateStep(step.id);
      if (success) {
        compensated++;
      } else {
        failed++;
      }
    }

    return { compensated, failed };
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
   * Remove all compensations (e.g. when resetting state).
   */
  clear(): void {
    this.compensations.clear();
  }
}
