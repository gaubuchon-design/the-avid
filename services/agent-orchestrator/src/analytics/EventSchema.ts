/**
 * @module EventSchema
 * @description Complete analytics event schema for the agent orchestrator
 * feedback loop. Defines all event types, payload shapes, and a factory
 * function for creating events with auto-generated IDs and timestamps.
 *
 * Events flow through the analytics pipeline:
 * ```
 *  EventSchema.createEvent()
 *       |
 *  PrivacyFilter.filter()
 *       |
 *  EventQueue.enqueue()
 *       |
 *  EventExporter / DashboardData
 * ```
 *
 * @see ADR-010-analytics-privacy for design rationale.
 */

import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Event type union
// ---------------------------------------------------------------------------

/**
 * All supported analytics event types in the orchestrator feedback loop.
 *
 * | Type                     | When emitted                                |
 * |--------------------------|---------------------------------------------|
 * | `prompt`                 | User submits a natural-language intent       |
 * | `plan-generated`         | PlanGenerator creates a new plan             |
 * | `plan-approved`          | User or auto-approve approves a plan         |
 * | `plan-rejected`          | User rejects a plan                         |
 * | `step-override`          | User skips, modifies, or replaces a step    |
 * | `step-failure`           | A tool call fails during execution          |
 * | `missing-endpoint`       | Agent requests a tool that does not exist    |
 * | `manual-fix-after-agent` | User manually fixes after agent completes   |
 * | `time-saved-estimate`    | Estimated time savings from agent execution |
 * | `publish-outcome`        | Result of a publish/export operation         |
 * | `token-consumed`         | Token consumption for cost tracking         |
 * | `model-fallback`         | Model switched due to unavailability/cost   |
 * | `latency-report`         | Latency metrics for an operation            |
 */
export type AnalyticsEventType =
  | 'prompt'
  | 'plan-generated'
  | 'plan-approved'
  | 'plan-rejected'
  | 'step-override'
  | 'step-failure'
  | 'missing-endpoint'
  | 'manual-fix-after-agent'
  | 'time-saved-estimate'
  | 'publish-outcome'
  | 'token-consumed'
  | 'model-fallback'
  | 'latency-report';

// ---------------------------------------------------------------------------
// Privacy levels
// ---------------------------------------------------------------------------

/**
 * Four-tier privacy classification for analytics events.
 *
 * | Level              | Audience                                      |
 * |--------------------|-----------------------------------------------|
 * | `public-aggregate` | Aggregated, anonymized -- safe for dashboards |
 * | `org-internal`     | Visible within the organization only          |
 * | `user-private`     | Visible only to the originating user          |
 * | `do-not-log`       | Must never be persisted or transmitted        |
 */
export type PrivacyLevel =
  | 'public-aggregate'
  | 'org-internal'
  | 'user-private'
  | 'do-not-log';

// ---------------------------------------------------------------------------
// Core event interface
// ---------------------------------------------------------------------------

/**
 * A single analytics event in the feedback loop.
 * All fields are readonly to enforce immutability after creation.
 */
export interface AnalyticsEvent {
  /** Unique event identifier (UUIDv4). */
  readonly id: string;
  /** Discriminated event type. */
  readonly type: AnalyticsEventType;
  /** Session identifier for correlating events within a single editing session. */
  readonly sessionId: string;
  /** User identifier (may be anonymized or absent). */
  readonly userId?: string;
  /** ISO-8601 timestamp of event creation. */
  readonly timestamp: string;
  /** Privacy classification governing how the event may be stored and shared. */
  readonly privacyLevel: PrivacyLevel;
  /** Associated project identifier. */
  readonly projectId?: string;
  /** Associated sequence/timeline identifier. */
  readonly sequenceId?: string;
  /** Type-specific event payload. */
  readonly payload: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Typed payload interfaces
// ---------------------------------------------------------------------------

/** Payload for `prompt` events -- captures the user's natural-language intent. */
export interface PromptPayload {
  /** The raw prompt text submitted by the user. */
  readonly promptText: string;
  /** Summary of the editing context assembled for the LLM. */
  readonly contextSummary: string;
  /** Truncated preview of the LLM response. */
  readonly responsePreview: string;
  /** Total token count for the prompt + context. */
  readonly tokenCount: number;
}

/** Payload for `plan-generated`, `plan-approved`, and `plan-rejected` events. */
export interface PlanPayload {
  /** Unique plan identifier. */
  readonly planId: string;
  /** Number of steps in the plan. */
  readonly stepCount: number;
  /** Ordered list of tool names the plan invokes. */
  readonly toolNames: readonly string[];
  /** Estimated token budget for executing the full plan. */
  readonly estimatedTokens: number;
}

/** Payload for `step-failure` events. */
export interface FailurePayload {
  /** Plan that owns the failed step. */
  readonly planId: string;
  /** Step identifier (if available). */
  readonly stepId?: string;
  /** Tool that failed. */
  readonly toolName: string;
  /** Human-readable error message. */
  readonly errorMessage: string;
  /** Machine-readable error code (e.g. `TIMEOUT`, `AUTH_FAILURE`). */
  readonly errorCode?: string;
  /** Whether the failure is recoverable (retry / fallback possible). */
  readonly recoverable: boolean;
}

/** Payload for `step-override` events. */
export interface OverridePayload {
  /** Plan containing the overridden step. */
  readonly planId: string;
  /** Step that was overridden. */
  readonly stepId: string;
  /** Tool that the step was invoking. */
  readonly toolName: string;
  /** User-provided reason for the override. */
  readonly reason: string;
  /** What the user chose to do with the step. */
  readonly userAction: 'skip' | 'modify' | 'replace';
}

/** Payload for `missing-endpoint` events -- signals API gaps. */
export interface MissingEndpointPayload {
  /** The tool name that was requested but not registered. */
  readonly requestedTool: string;
  /** Natural-language context of the request. */
  readonly context: string;
  /** AI-suggested endpoint that could fulfil the request. */
  readonly suggestedEndpoint?: string;
  /** How many times this tool has been requested. */
  readonly frequency: number;
}

/** Payload for `manual-fix-after-agent` events. */
export interface ManualFixPayload {
  /** Plan that the user fixed after. */
  readonly planId: string;
  /** Tool whose output was manually corrected. */
  readonly toolName: string;
  /** Description of what the user fixed. */
  readonly fixDescription: string;
  /** Time the user spent on the manual fix in milliseconds. */
  readonly timeTakenMs: number;
}

/** Payload for `time-saved-estimate` events. */
export interface TimeSavedPayload {
  /** Plan for which time savings are estimated. */
  readonly planId: string;
  /** Estimated time to perform the task manually (ms). */
  readonly estimatedManualMs: number;
  /** Actual time the agent took (ms). */
  readonly actualAgentMs: number;
  /** Net time savings (estimatedManualMs - actualAgentMs). */
  readonly savingsMs: number;
  /** Confidence level of the estimate. */
  readonly confidence: 'high' | 'medium' | 'low';
}

/** Payload for `publish-outcome` events. */
export interface PublishOutcomePayload {
  /** Plan that triggered the publish. */
  readonly planId: string;
  /** Target platform (e.g. `youtube`, `instagram`, `frame.io`). */
  readonly platform: string;
  /** Outcome of the publish operation. */
  readonly status: 'success' | 'partial' | 'failed';
  /** URL of the published content (on success). */
  readonly publishedUrl?: string;
  /** Error message (on failure or partial). */
  readonly errorMessage?: string;
}

/** Payload for `token-consumed` events -- tracks actual vs. quoted token usage. */
export interface TokenConsumedPayload {
  /** Plan that consumed the tokens. */
  readonly planId: string;
  /** Usage category (e.g. `planning`, `execution`, `context`). */
  readonly category: string;
  /** Actual tokens consumed. */
  readonly tokensConsumed: number;
  /** Tokens quoted/estimated before execution. */
  readonly quotedTokens: number;
  /** Variance: actual - quoted (positive = over budget). */
  readonly variance: number;
}

/** Payload for `latency-report` events -- aggregated latency statistics. */
export interface LatencyReportPayload {
  /** The operation being measured (e.g. `plan-generation`, `tool-execution`). */
  readonly operation: string;
  /** Total duration of the measured operation (ms). */
  readonly durationMs: number;
  /** 50th percentile latency (ms). */
  readonly p50: number;
  /** 95th percentile latency (ms). */
  readonly p95: number;
  /** 99th percentile latency (ms). */
  readonly p99: number;
  /** Number of samples in the measurement window. */
  readonly sampleCount: number;
}

// ---------------------------------------------------------------------------
// Factory options
// ---------------------------------------------------------------------------

/** Optional fields when creating an event via the factory function. */
export interface CreateEventOptions {
  /** User identifier. */
  readonly userId?: string;
  /** Privacy level override (defaults to `org-internal`). */
  readonly privacyLevel?: PrivacyLevel;
  /** Associated project identifier. */
  readonly projectId?: string;
  /** Associated sequence identifier. */
  readonly sequenceId?: string;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new {@link AnalyticsEvent} with an auto-generated UUIDv4 and
 * ISO-8601 timestamp.
 *
 * @param type      - The event type discriminator.
 * @param sessionId - Session identifier for event correlation.
 * @param payload   - Type-specific event data.
 * @param options   - Optional metadata (userId, privacyLevel, projectId, sequenceId).
 * @returns A fully-formed, immutable analytics event.
 *
 * @example
 * ```ts
 * const event = createEvent('prompt', 'session-abc', {
 *   promptText: 'Remove all silence',
 *   contextSummary: 'Project: demo, Sequence: timeline-1',
 *   responsePreview: 'I will analyse the audio...',
 *   tokenCount: 342,
 * });
 * ```
 */
export function createEvent(
  type: AnalyticsEventType,
  sessionId: string,
  payload: Record<string, unknown>,
  options?: CreateEventOptions,
): AnalyticsEvent {
  if (!type) {
    throw new Error('AnalyticsEvent type is required');
  }
  if (!sessionId) {
    throw new Error('AnalyticsEvent sessionId is required');
  }

  return Object.freeze({
    id: uuidv4(),
    type,
    sessionId,
    userId: options?.userId,
    timestamp: new Date().toISOString(),
    privacyLevel: options?.privacyLevel ?? 'org-internal',
    projectId: options?.projectId,
    sequenceId: options?.sequenceId,
    payload: Object.freeze({ ...payload }),
  });
}
