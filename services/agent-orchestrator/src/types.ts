/**
 * @module types
 * @description Local type definitions for the Agent Orchestrator service.
 *
 * All types are defined locally to avoid cross-package imports at runtime.
 * This keeps the orchestrator self-contained and deployable as a standalone
 * microservice without depending on `@mcua/contracts`.
 */

// ---------------------------------------------------------------------------
// Plan & Step status enums
// ---------------------------------------------------------------------------

/** Overall status of an execution plan through its lifecycle. */
export type PlanStatus =
  | 'planning'
  | 'preview'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Status of an individual step within a plan. */
export type StepStatus =
  | 'pending'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'compensated';

/** Strategy for executing steps. */
export type ExecutionMode = 'sequential' | 'parallel' | 'conditional';

/** How approval is handled for a given plan. */
export type ApprovalMode = 'manual' | 'auto-approve' | 'dry-run';

// ---------------------------------------------------------------------------
// Plan & Step
// ---------------------------------------------------------------------------

/**
 * A decomposed execution plan generated from a user intent.
 * Plans progress through: planning -> preview -> approved -> executing -> completed/failed.
 */
export interface AgentPlan {
  /** Unique plan identifier. */
  readonly id: string;
  /** The original user intent that generated this plan. */
  readonly intent: string;
  /** Ordered list of steps to execute. */
  readonly steps: AgentStep[];
  /** Current lifecycle status. */
  status: PlanStatus;
  /** Estimated token budget before execution. */
  readonly tokensEstimated: number;
  /** Actual tokens consumed so far. */
  tokensUsed: number;
  /** ISO-8601 timestamp when the plan was created. */
  readonly createdAt: string;
  /** ISO-8601 timestamp of the last status change. */
  updatedAt: string;
  /** Policy governing how approval works for this plan. */
  readonly approvalPolicy: ApprovalPolicy;
}

/**
 * A single executable step within an {@link AgentPlan}.
 * Each step maps to exactly one tool call.
 */
export interface AgentStep {
  /** Unique step identifier. */
  readonly id: string;
  /** Parent plan identifier. */
  readonly planId: string;
  /** Zero-based position within the plan. */
  readonly index: number;
  /** Human-readable description of what this step does. */
  readonly description: string;
  /** Name of the tool to invoke. */
  readonly toolName: string;
  /** Arguments to pass to the tool. */
  readonly toolArgs: Record<string, unknown>;
  /** Current execution status. */
  status: StepStatus;
  /** Serialised result on success. */
  result?: string;
  /** Error message on failure. */
  error?: string;
  /** Description of the compensation (undo) action, if registered. */
  compensation?: string;
  /** ISO-8601 timestamp when execution started. */
  startedAt?: string;
  /** ISO-8601 timestamp when execution completed. */
  completedAt?: string;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Approval Policy
// ---------------------------------------------------------------------------

/**
 * Configurable policy that governs which steps require human approval and
 * which may be auto-approved.
 */
export interface ApprovalPolicy {
  /** The approval strategy. */
  readonly mode: ApprovalMode;
  /** Tool names that may execute without explicit user approval. */
  readonly allowedAutoTools: readonly string[];
  /** Tool names that always require explicit approval regardless of mode. */
  readonly requireApprovalFor: readonly string[];
  /** Maximum token budget that may be spent in auto-approve mode. */
  readonly maxAutoTokens: number;
}

// ---------------------------------------------------------------------------
// Agent Context
// ---------------------------------------------------------------------------

/**
 * Snapshot of the current editing context sent alongside a user intent.
 * Used by the plan generator to produce contextually relevant steps.
 */
export interface AgentContext {
  /** Active project identifier. */
  readonly projectId: string;
  /** Currently open sequence/timeline identifier. */
  readonly sequenceId?: string;
  /** Bin identifiers visible or selected by the user. */
  readonly binIds?: readonly string[];
  /** Clip identifiers currently selected on the timeline. */
  readonly selectedClipIds?: readonly string[];
  /** Current playhead position in seconds. */
  readonly playheadTime?: number;
  /** Active search/filter query. */
  readonly searchQuery?: string;
  /** Transcript text within the current view. */
  readonly transcriptContext?: string;
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

/**
 * Describes a single tool that the agent can invoke.
 * Tool definitions are registered with the {@link ToolCallRouter} and
 * also used to generate Gemini function declarations.
 */
export interface ToolDefinition {
  /** Unique tool name (snake_case). */
  readonly name: string;
  /** Human-readable description shown to the LLM. */
  readonly description: string;
  /** JSON Schema-style parameter map. */
  readonly parameters: Record<string, ToolParameter>;
  /** Whether the tool requires user confirmation before execution. */
  readonly requiresConfirmation: boolean;
  /** Estimated token cost per invocation. */
  readonly tokenCost: number;
  /** Adapter responsible for executing this tool. */
  readonly adapter: string;
}

/** Describes a single parameter of a tool. */
export interface ToolParameter {
  /** JSON Schema type (string, number, boolean, object, array). */
  readonly type: string;
  /** Human-readable parameter description. */
  readonly description: string;
  /** Whether this parameter must be provided. */
  readonly required?: boolean;
  /** Allowed values (for enum-style parameters). */
  readonly enum?: readonly string[];
}

// ---------------------------------------------------------------------------
// Tool Call Result
// ---------------------------------------------------------------------------

/** Result of executing a single tool call. */
export interface ToolCallResult {
  /** Distributed trace identifier. */
  readonly traceId: string;
  /** Tool that was invoked. */
  readonly toolName: string;
  /** Whether execution succeeded. */
  readonly success: boolean;
  /** Return value on success. */
  readonly result?: unknown;
  /** Error message on failure. */
  readonly error?: string;
  /** Wall-clock execution time in milliseconds. */
  readonly durationMs: number;
  /** Tokens consumed by this invocation. */
  readonly tokensConsumed: number;
}

// ---------------------------------------------------------------------------
// Orchestrator Configuration
// ---------------------------------------------------------------------------

/** Top-level configuration for the orchestrator service. */
export interface OrchestratorConfig {
  /** Gemini API key (optional -- falls back to template matching). */
  readonly geminiApiKey?: string;
  /** Gemini model identifier. */
  readonly geminiModel?: string;
  /** Default approval policy. */
  readonly defaultPolicy?: ApprovalPolicy;
  /** Execution mode for running plan steps. */
  readonly executionMode?: ExecutionMode;
}
