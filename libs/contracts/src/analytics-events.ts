/**
 * @module analytics-events
 *
 * Types for the analytics event pipeline. Every meaningful user and
 * agent interaction emits an `AnalyticsEvent` that is tagged with a
 * privacy level to control aggregation, retention, and export policy.
 *
 * Specialised event interfaces extend the base event with
 * domain-specific payload fields.
 */

// ─── Event Type ───────────────────────────────────────────────────────────────

/**
 * Discriminated event types emitted by the analytics pipeline.
 */
export type EventType =
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

// ─── Privacy Level ────────────────────────────────────────────────────────────

/**
 * Controls how an event may be stored, aggregated, and exported.
 * - `public-aggregate` — may be included in anonymised aggregate metrics
 * - `org-internal`     — visible within the user's organisation only
 * - `user-private`     — visible to the originating user only
 * - `do-not-log`       — must not be persisted beyond the current session
 */
export type PrivacyLevel =
  | 'public-aggregate'
  | 'org-internal'
  | 'user-private'
  | 'do-not-log';

// ─── Base Event ───────────────────────────────────────────────────────────────

/**
 * Base analytics event.
 *
 * All specialised event types extend this with additional payload
 * fields. The `payload` map allows forward-compatible extension
 * without schema changes.
 */
export interface AnalyticsEvent {
  /** Unique event identifier. */
  readonly id: string;
  /** Discriminated event type. */
  readonly type: EventType;
  /** Session in which the event occurred. */
  readonly sessionId: string;
  /** User who triggered the event. */
  readonly userId: string;
  /** ISO 8601 event timestamp. */
  readonly timestamp: string;
  /** Freeform payload data specific to the event type. */
  readonly payload: Readonly<Record<string, unknown>>;
  /** Privacy classification for this event. */
  readonly privacyLevel: PrivacyLevel;
  /** Project context, or `null` if not project-scoped. */
  readonly projectId: string | null;
  /** Sequence context, or `null` if not sequence-scoped. */
  readonly sequenceId: string | null;
}

// ─── Specialised Events ───────────────────────────────────────────────────────

/**
 * Emitted when the user submits a natural-language prompt to the agent.
 */
export interface PromptEvent extends AnalyticsEvent {
  readonly type: 'prompt';
  /** The raw prompt text submitted by the user. */
  readonly promptText: string;
  /** Abbreviated summary of the surrounding context provided to the model. */
  readonly contextSummary: string;
  /** Truncated preview of the agent's response. */
  readonly responsePreview: string;
}

/**
 * Emitted when the agent generates or the user approves/rejects a plan.
 */
export interface PlanEvent extends AnalyticsEvent {
  readonly type: 'plan-generated' | 'plan-approved' | 'plan-rejected';
  /** Unique plan identifier. */
  readonly planId: string;
  /** Number of steps in the plan. */
  readonly stepCount: number;
  /** Canonical tool names referenced by the plan's steps. */
  readonly toolNames: readonly string[];
}

/**
 * Emitted when an agent step or tool invocation fails.
 */
export interface FailureEvent extends AnalyticsEvent {
  readonly type: 'step-failure' | 'missing-endpoint';
  /** Error message or structured error object. */
  readonly error: unknown;
  /** Tool that failed, or `null` if not tool-specific. */
  readonly toolName: string | null;
  /** Whether the failure is considered recoverable by the agent. */
  readonly recoverable: boolean;
}

/**
 * Emitted periodically to report operation latency percentiles.
 */
export interface LatencyReport extends AnalyticsEvent {
  readonly type: 'latency-report';
  /** Name of the measured operation (e.g. `"semantic-search"`, `"render"`). */
  readonly operation: string;
  /** Most recent observed duration in milliseconds. */
  readonly durationMs: number;
  /** 50th percentile latency in milliseconds. */
  readonly p50: number;
  /** 95th percentile latency in milliseconds. */
  readonly p95: number;
  /** 99th percentile latency in milliseconds. */
  readonly p99: number;
}
