/**
 * @module tool-traces
 *
 * Types for tracing agent tool invocations throughout the plan execution
 * lifecycle. Every tool call produces a `ToolTrace` that records timing,
 * token cost, and result status. Failed steps can trigger compensation
 * actions that are tracked via `CompensationRecord`.
 */

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Lifecycle status of a tool trace.
 * - `pending`      — step is queued but not yet started
 * - `executing`    — tool call is in flight
 * - `completed`    — tool call succeeded
 * - `failed`       — tool call errored
 * - `compensated`  — a compensation action reversed the effect
 */
export type TraceStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'compensated';

// ─── Tool Trace ───────────────────────────────────────────────────────────────

/**
 * An immutable record of a single tool invocation within an agent plan.
 *
 * Traces are the primary observability primitive: they capture what was
 * called, with which arguments, how long it took, and how many tokens
 * it consumed.
 */
export interface ToolTrace {
  /** Unique trace identifier. */
  readonly id: string;
  /** The agent plan this trace belongs to. */
  readonly planId: string;
  /** Zero-based index of the step within the plan. */
  readonly stepIndex: number;
  /** Canonical name of the tool that was invoked. */
  readonly toolName: string;
  /** Arguments passed to the tool. */
  readonly toolArgs: Readonly<Record<string, unknown>>;
  /** Current lifecycle status. */
  readonly status: TraceStatus;
  /** Serialised tool result on success, or `null`. */
  readonly result: unknown | null;
  /** Error message or structured error on failure, or `null`. */
  readonly error: unknown | null;
  /** ISO 8601 timestamp when execution started. */
  readonly startedAt: string;
  /** ISO 8601 timestamp when execution completed, or `null` if still running. */
  readonly completedAt: string | null;
  /** Wall-clock duration in milliseconds, or `null` if still running. */
  readonly durationMs: number | null;
  /** Number of tokens consumed by this invocation. */
  readonly tokensCost: number;
}

// ─── Tool Invocation ──────────────────────────────────────────────────────────

/**
 * Low-level invocation detail for a tool trace, recording the adapter
 * layer, endpoint, and raw request/response payloads.
 */
export interface ToolInvocation {
  /** The parent trace ID this invocation belongs to. */
  readonly traceId: string;
  /** Adapter that handled the call. */
  readonly adapter:
    | 'media-composer'
    | 'content-core'
    | 'pro-tools'
    | 'publish'
    | 'local-ai'
    | 'knowledge-node';
  /** Target endpoint or command path within the adapter. */
  readonly endpoint: string;
  /** Raw request payload sent to the adapter. */
  readonly request: unknown;
  /** Raw response payload received from the adapter. */
  readonly response: unknown;
}

// ─── Compensation ─────────────────────────────────────────────────────────────

/**
 * A record of a compensation (rollback) action executed after a tool
 * invocation failed or was cancelled.
 */
export interface CompensationRecord {
  /** Unique compensation record identifier. */
  readonly id: string;
  /** The trace ID of the failed step that triggered compensation. */
  readonly traceId: string;
  /** Human-readable description of the compensating action. */
  readonly action: string;
  /** Outcome of the compensation attempt. */
  readonly status: 'pending' | 'completed' | 'failed';
  /** ISO 8601 timestamp when the compensation was executed. */
  readonly executedAt: string;
}
