/**
 * @module ToolCallLogger
 * @description Structured logging for tool calls and plan lifecycle events.
 *
 * All entries are stored in-memory with a configurable maximum size.
 * In a production deployment this would be backed by a persistent store
 * (e.g. OpenTelemetry, CloudWatch, or a database).
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported log event types. */
export type LogEventType =
  | 'tool-start'
  | 'tool-complete'
  | 'tool-error'
  | 'plan-created'
  | 'plan-approved'
  | 'plan-completed'
  | 'plan-failed'
  | 'step-approved'
  | 'step-override';

/** Structured log entry. */
export interface LogEntry {
  /** Unique log entry identifier. */
  readonly id: string;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Event type. */
  readonly type: LogEventType;
  /** Associated plan identifier. */
  readonly planId?: string;
  /** Associated step identifier. */
  readonly stepId?: string;
  /** Tool name (for tool-related events). */
  readonly toolName?: string;
  /** Trace identifier (for tool-related events). */
  readonly traceId?: string;
  /** Wall-clock duration in milliseconds. */
  readonly durationMs?: number;
  /** Whether the operation succeeded. */
  readonly success?: boolean;
  /** Error message if the operation failed. */
  readonly error?: string;
  /** Arbitrary metadata. */
  readonly metadata?: Record<string, unknown>;
}

/** Input for logging a tool call trace. */
export interface ToolCallTrace {
  readonly traceId: string;
  readonly planId: string;
  readonly stepId: string;
  readonly toolName: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

/** Input for logging a plan lifecycle event. */
export interface PlanLogEvent {
  readonly type: LogEventType;
  readonly planId: string;
  readonly stepId?: string;
  readonly metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ToolCallLogger
// ---------------------------------------------------------------------------

/** Default maximum number of log entries to retain. */
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * In-memory structured logger for tool call and plan lifecycle events.
 */
export class ToolCallLogger {
  private entries: LogEntry[] = [];
  private readonly maxEntries: number;

  /**
   * @param maxEntries - Maximum entries to retain (FIFO eviction).
   */
  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Log a tool call start/complete/error event.
   *
   * Creates either a `tool-complete` or `tool-error` entry depending on
   * the trace's `success` flag.
   *
   * @param trace - The tool call trace to log.
   */
  logToolCall(trace: ToolCallTrace): void {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: trace.success ? 'tool-complete' : 'tool-error',
      planId: trace.planId,
      stepId: trace.stepId,
      toolName: trace.toolName,
      traceId: trace.traceId,
      durationMs: trace.durationMs,
      success: trace.success,
      error: trace.error,
      metadata: trace.metadata,
    };

    this.append(entry);
  }

  /**
   * Log a plan lifecycle event.
   *
   * @param event - The plan event to log.
   */
  logPlanEvent(event: PlanLogEvent): void {
    const entry: LogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      type: event.type,
      planId: event.planId,
      stepId: event.stepId,
      metadata: event.metadata,
    };

    this.append(entry);
  }

  /**
   * Retrieve the most recent log entries.
   *
   * @param limit - Maximum number of entries to return (default: 100).
   * @returns Array of log entries, newest first.
   */
  getRecentLogs(limit: number = 100): LogEntry[] {
    const safeLimit = Math.max(0, Math.min(limit, this.entries.length));
    return this.entries.slice(-safeLimit).reverse();
  }

  /**
   * Retrieve all log entries for a specific plan.
   *
   * @param planId - The plan identifier to filter by.
   * @returns Array of log entries in chronological order.
   */
  getLogsForPlan(planId: string): LogEntry[] {
    return this.entries.filter((e) => e.planId === planId);
  }

  /**
   * Get the total number of log entries.
   */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Clear all log entries.
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
  private append(entry: LogEntry): void {
    if (this.entries.length >= this.maxEntries) {
      // Evict the oldest 10 % to reduce frequent eviction overhead
      const evictCount = Math.max(1, Math.floor(this.maxEntries * 0.1));
      this.entries.splice(0, evictCount);
    }

    this.entries.push(entry);
  }
}
