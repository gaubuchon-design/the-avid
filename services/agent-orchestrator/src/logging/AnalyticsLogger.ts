/**
 * @module AnalyticsLogger
 * @description Structured analytics event logging for observability.
 *
 * Captures prompt submissions, plan lifecycle events, approval decisions,
 * execution results, and token usage so operators can monitor agent
 * behaviour and cost over time.
 *
 * All entries are stored in-memory and can be exported as JSON for
 * downstream processing (dashboards, cost analysis, etc.).
 */

import { v4 as uuidv4 } from 'uuid';
import type { AgentPlan, ToolCallResult } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported analytics event types. */
export type AnalyticsEventType =
  | 'prompt'
  | 'plan'
  | 'approval'
  | 'override'
  | 'execution'
  | 'token-usage';

/** A single analytics log entry. */
export interface AnalyticsEntry {
  /** Unique entry identifier. */
  readonly id: string;
  /** Event type. */
  readonly type: AnalyticsEventType;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Session identifier for correlating events. */
  readonly sessionId: string;
  /** User identifier (if known). */
  readonly userId?: string;
  /** Associated plan identifier. */
  readonly planId?: string;
  /** Arbitrary event payload. */
  readonly data: Record<string, unknown>;
}

/** Filter for querying analytics entries. */
export interface AnalyticsFilter {
  /** Filter by session. */
  readonly sessionId?: string;
  /** Filter by plan. */
  readonly planId?: string;
  /** Filter by event type. */
  readonly type?: AnalyticsEventType;
}

// ---------------------------------------------------------------------------
// AnalyticsLogger
// ---------------------------------------------------------------------------

/** Default maximum number of entries to retain. */
const DEFAULT_MAX_ENTRIES = 50_000;

/**
 * In-memory analytics logger for agent orchestrator events.
 */
export class AnalyticsLogger {
  private entries: AnalyticsEntry[] = [];
  private readonly maxEntries: number;

  /**
   * @param maxEntries - Maximum entries to retain (FIFO eviction).
   */
  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  // -----------------------------------------------------------------------
  // Typed logging methods
  // -----------------------------------------------------------------------

  /**
   * Log a user prompt submission.
   *
   * @param sessionId      - Current session identifier.
   * @param prompt         - The raw user prompt text.
   * @param contextSummary - Assembled context summary included in the request.
   */
  logPrompt(sessionId: string, prompt: string, contextSummary: string): void {
    this.append({
      id: uuidv4(),
      type: 'prompt',
      timestamp: new Date().toISOString(),
      sessionId,
      data: {
        prompt,
        contextSummaryLength: contextSummary.length,
        contextSummaryPreview: contextSummary.substring(0, 200),
      },
    });
  }

  /**
   * Log plan creation.
   *
   * @param sessionId - Current session identifier.
   * @param plan      - The generated plan.
   */
  logPlan(sessionId: string, plan: AgentPlan): void {
    this.append({
      id: uuidv4(),
      type: 'plan',
      timestamp: new Date().toISOString(),
      sessionId,
      planId: plan.id,
      data: {
        intent: plan.intent,
        status: plan.status,
        stepCount: plan.steps.length,
        tokensEstimated: plan.tokensEstimated,
        steps: plan.steps.map((s) => ({
          id: s.id,
          toolName: s.toolName,
          description: s.description,
        })),
      },
    });
  }

  /**
   * Log an approval or rejection decision.
   *
   * @param sessionId - Current session identifier.
   * @param planId    - The plan identifier.
   * @param approved  - Whether the plan/step was approved.
   * @param stepId    - Specific step identifier (if approving a single step).
   */
  logApproval(
    sessionId: string,
    planId: string,
    approved: boolean,
    stepId?: string,
  ): void {
    this.append({
      id: uuidv4(),
      type: 'approval',
      timestamp: new Date().toISOString(),
      sessionId,
      planId,
      data: {
        approved,
        stepId: stepId ?? null,
        scope: stepId ? 'step' : 'plan',
      },
    });
  }

  /**
   * Log a tool execution result.
   *
   * @param sessionId - Current session identifier.
   * @param planId    - The plan identifier.
   * @param result    - The tool call result.
   */
  logExecution(
    sessionId: string,
    planId: string,
    result: ToolCallResult,
  ): void {
    this.append({
      id: uuidv4(),
      type: 'execution',
      timestamp: new Date().toISOString(),
      sessionId,
      planId,
      data: {
        traceId: result.traceId,
        toolName: result.toolName,
        success: result.success,
        durationMs: result.durationMs,
        tokensConsumed: result.tokensConsumed,
        error: result.error ?? null,
      },
    });
  }

  /**
   * Log token usage for cost tracking.
   *
   * @param sessionId - Current session identifier.
   * @param planId    - The plan identifier.
   * @param tokens    - Number of tokens consumed.
   * @param category  - Usage category (e.g. `planning`, `execution`, `context`).
   */
  logTokenUsage(
    sessionId: string,
    planId: string,
    tokens: number,
    category: string,
  ): void {
    this.append({
      id: uuidv4(),
      type: 'token-usage',
      timestamp: new Date().toISOString(),
      sessionId,
      planId,
      data: {
        tokens,
        category,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Query & export
  // -----------------------------------------------------------------------

  /**
   * Retrieve analytics entries, optionally filtered.
   *
   * @param filter - Optional filter criteria.
   * @returns Matching entries in chronological order.
   */
  getEntries(filter?: AnalyticsFilter): AnalyticsEntry[] {
    if (!filter) {
      return [...this.entries];
    }

    return this.entries.filter((entry) => {
      if (filter.sessionId && entry.sessionId !== filter.sessionId) return false;
      if (filter.planId && entry.planId !== filter.planId) return false;
      if (filter.type && entry.type !== filter.type) return false;
      return true;
    });
  }

  /**
   * Export all entries as a JSON string.
   *
   * @returns Pretty-printed JSON of all analytics entries.
   */
  exportJSON(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Get the total number of entries.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries = [];
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Append an entry, evicting the oldest if the buffer is full.
   */
  private append(entry: AnalyticsEntry): void {
    if (this.entries.length >= this.maxEntries) {
      const evictCount = Math.max(1, Math.floor(this.maxEntries * 0.1));
      this.entries.splice(0, evictCount);
    }

    this.entries.push(entry);
  }
}
