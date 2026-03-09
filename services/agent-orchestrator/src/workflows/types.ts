/**
 * @module workflows/types
 * @description Common type definitions for end-to-end exemplar workflows.
 *
 * These types model the full lifecycle of a scripted demo workflow: definition,
 * seed data, execution results, and reporting. Each workflow is a polished
 * vertical slice that exercises the orchestrator pipeline from intent through
 * tool execution, producing measurable latency and token-cost metrics.
 */

// ---------------------------------------------------------------------------
// Workflow Definition
// ---------------------------------------------------------------------------

/**
 * A complete, self-contained workflow that can be run as a scripted demo.
 *
 * Each definition includes the prompt, seed data reference, ordered steps,
 * and cost/latency estimates. Workflow definitions are immutable value objects
 * registered in the {@link WORKFLOW_REGISTRY}.
 */
export interface WorkflowDefinition {
  /** Unique workflow identifier (kebab-case). */
  readonly id: string;
  /** Human-readable workflow name. */
  readonly name: string;
  /** One-sentence description of what the workflow achieves. */
  readonly description: string;
  /** Vertical category for grouping in the UI. */
  readonly vertical: 'creator' | 'sports' | 'localization' | 'audio' | 'archive' | 'generative';
  /** The natural-language prompt that triggers this workflow. */
  readonly demoPrompt: string;
  /** Identifier of the seed dataset required by this workflow. */
  readonly seedDataId: string;
  /** Estimated wall-clock duration in milliseconds. */
  readonly estimatedDurationMs: number;
  /** Estimated token budget for the full workflow. */
  readonly estimatedTokenCost: number;
  /** Ordered list of steps that compose the workflow. */
  readonly steps: readonly WorkflowStep[];
}

/**
 * A single step within a {@link WorkflowDefinition}.
 *
 * Maps to exactly one tool call in the orchestrator pipeline. Steps include
 * a failure-handling strategy so the runner knows whether to skip, retry,
 * or abort the entire workflow when a step fails.
 */
export interface WorkflowStep {
  /** Name of the tool to invoke (must match a registered tool). */
  readonly toolName: string;
  /** Human-readable description of what this step does. */
  readonly description: string;
  /** Description of the expected successful result. */
  readonly expectedResult: string;
  /**
   * Strategy when this step fails:
   * - `'skip'` — continue to the next step (non-critical step).
   * - `'retry'` — retry once before falling through to skip or abort.
   * - `'abort'` — stop the entire workflow immediately.
   *
   * Defaults to `'abort'` if not specified.
   */
  readonly failureHandler?: 'skip' | 'retry' | 'abort';
}

// ---------------------------------------------------------------------------
// Workflow Result
// ---------------------------------------------------------------------------

/**
 * Outcome of running a workflow through the {@link WorkflowRunner}.
 *
 * Captures per-step outputs, aggregate metrics, and any errors encountered.
 */
export interface WorkflowResult {
  /** Identifier of the workflow that was executed. */
  readonly workflowId: string;
  /** Overall execution status. */
  readonly status: 'completed' | 'partial' | 'failed';
  /** Number of steps that completed successfully. */
  readonly stepsCompleted: number;
  /** Total number of steps in the workflow definition. */
  readonly totalSteps: number;
  /** Per-step output records in execution order. */
  readonly outputs: readonly WorkflowOutput[];
  /** Total wall-clock latency in milliseconds. */
  readonly latencyMs: number;
  /** Total tokens consumed across all steps. */
  readonly tokensUsed: number;
  /** Error messages from failed steps (empty on full success). */
  readonly errors: readonly string[];
}

/**
 * Output from a single workflow step after execution.
 */
export interface WorkflowOutput {
  /** Zero-based index of the step within the workflow. */
  readonly stepIndex: number;
  /** Name of the tool that was invoked. */
  readonly toolName: string;
  /** Human-readable description of the step. */
  readonly description: string;
  /** Raw result returned by the tool (shape varies by tool). */
  readonly result: unknown;
  /** Wall-clock duration for this step in milliseconds. */
  readonly durationMs: number;
}

// ---------------------------------------------------------------------------
// Seed Data
// ---------------------------------------------------------------------------

/**
 * A curated dataset used to initialise context for a workflow demo.
 *
 * Contains realistic assets, bins, and optional transcript segments that
 * tell a coherent story for a specific vertical.
 */
export interface SeedData {
  /** Unique seed data identifier. */
  readonly id: string;
  /** Human-readable dataset name. */
  readonly name: string;
  /** Brief description of the scenario this data represents. */
  readonly description: string;
  /** Media assets available in this dataset. */
  readonly assets: readonly SeedAsset[];
  /** Bins that organise the assets. */
  readonly bins: readonly SeedBin[];
  /** Optional transcript segments associated with assets. */
  readonly transcriptSegments?: readonly SeedTranscriptSegment[];
}

/**
 * A single media asset within a seed dataset.
 */
export interface SeedAsset {
  /** Unique asset identifier. */
  readonly id: string;
  /** File-like display name. */
  readonly name: string;
  /** Media type. */
  readonly type: 'video' | 'audio' | 'image';
  /** Duration in seconds (0 for still images). */
  readonly duration: number;
  /** Searchable tags for classification. */
  readonly tags: readonly string[];
  /** Arbitrary metadata (codec, resolution, etc.). */
  readonly metadata?: Record<string, unknown>;
}

/**
 * A bin (folder) that references a subset of assets.
 */
export interface SeedBin {
  /** Unique bin identifier. */
  readonly id: string;
  /** Display name of the bin. */
  readonly name: string;
  /** Asset identifiers contained in this bin. */
  readonly assetIds: readonly string[];
}

/**
 * A transcript segment tied to a specific time range within an asset.
 */
export interface SeedTranscriptSegment {
  /** Asset this segment belongs to. */
  readonly assetId: string;
  /** Start time in seconds. */
  readonly startTime: number;
  /** End time in seconds. */
  readonly endTime: number;
  /** Transcribed text. */
  readonly text: string;
  /** Speaker label (when available). */
  readonly speaker?: string;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Latency breakdown for a completed workflow execution.
 */
export interface LatencyReport {
  /** Total wall-clock milliseconds from start to finish. */
  readonly totalMs: number;
  /** Per-step latency entries. */
  readonly perStep: ReadonlyArray<{ step: string; durationMs: number }>;
  /** Breakdown by phase (estimated from step timings). */
  readonly breakdown: {
    /** Time spent generating the plan. */
    readonly planning: number;
    /** Time spent in the approval gate. */
    readonly approval: number;
    /** Time spent executing tool calls. */
    readonly execution: number;
  };
}

/**
 * Token consumption report for a completed workflow execution.
 */
export interface TokenReport {
  /** Total tokens consumed across all steps. */
  readonly totalTokens: number;
  /** Per-step token counts. */
  readonly perStep: ReadonlyArray<{ step: string; tokens: number }>;
  /** Workflow vertical category for cost attribution. */
  readonly category: string;
  /** Human-readable estimated cost string (e.g., "~$0.03"). */
  readonly estimatedCost: string;
}
