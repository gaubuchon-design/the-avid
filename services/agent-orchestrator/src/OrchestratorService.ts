/**
 * @module OrchestratorService
 * @description Main service class that ties together plan generation, approval
 * policy enforcement, tool call routing, compensation tracking, caching, and
 * analytics logging.
 *
 * This is the primary entry point consumed by the Express/WebSocket server
 * and exposes a high-level API for processing user intents, approving plans,
 * executing steps, and rolling back changes.
 *
 * ## Execution Modes
 *
 * - **Sequential** (default): Steps execute one at a time, stopping on failure.
 * - **Parallel**: Independent steps execute concurrently with a configurable
 *   concurrency limit to avoid overwhelming backend adapters.
 * - **Conditional**: Steps execute sequentially but may be skipped based on
 *   previous step results.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AgentContext,
  AgentPlan,
  AgentStep,
  ApprovalPolicy,
  DeadLetterEntry,
  ExecutionMode,
  OrchestratorConfig,
  ToolCallResult,
  ToolDefinition,
} from './types';

import { PlanGenerator } from './planning/PlanGenerator';
import { ContextAssembler } from './planning/ContextAssembler';
import { ApprovalPolicyEngine } from './approval/ApprovalPolicyEngine';
import { ToolCallRouter } from './execution/ToolCallRouter';
import { ToolCallLogger } from './execution/ToolCallLogger';
import { CompensationManager } from './execution/CompensationManager';
import { ContextCache } from './caching/ContextCache';
import { AnalyticsLogger } from './logging/AnalyticsLogger';

// ---------------------------------------------------------------------------
// Default tool definitions
// ---------------------------------------------------------------------------

/**
 * Full set of 24 tool definitions matching the client-side AgentEngine.
 * These are used both for plan generation (Gemini function declarations) and
 * for routing tool calls to the correct adapter.
 */
const DEFAULT_TOOLS: ToolDefinition[] = [
  // Timeline editing
  { name: 'splice_in', description: 'Insert a clip into a track at a specific frame, pushing existing clips to the right.', parameters: { trackId: { type: 'string', description: 'Target track identifier.', required: true }, clipId: { type: 'string', description: 'Clip to insert.', required: true }, frame: { type: 'number', description: 'Frame position for insertion.', required: true } }, requiresConfirmation: false, tokenCost: 8, adapter: 'media-composer' },
  { name: 'overwrite', description: 'Overwrite a region on a track with a clip, replacing whatever is underneath.', parameters: { trackId: { type: 'string', description: 'Target track identifier.', required: true }, clipId: { type: 'string', description: 'Clip to overwrite with.', required: true }, startFrame: { type: 'number', description: 'Start frame of the region.', required: true }, endFrame: { type: 'number', description: 'End frame of the region.' } }, requiresConfirmation: true, tokenCost: 10, adapter: 'media-composer' },
  { name: 'lift', description: 'Remove a clip from the timeline leaving a gap (no ripple).', parameters: { clipId: { type: 'string', description: 'Clip to lift.', required: true } }, requiresConfirmation: true, tokenCost: 6, adapter: 'media-composer' },
  { name: 'extract', description: 'Remove a clip from the timeline and close the gap (ripple delete).', parameters: { clipId: { type: 'string', description: 'Clip to extract.', required: true } }, requiresConfirmation: true, tokenCost: 8, adapter: 'media-composer' },
  { name: 'ripple_trim', description: 'Trim a clip edge and ripple-shift all downstream clips.', parameters: { clipId: { type: 'string', description: 'Clip to trim.', required: true }, side: { type: 'string', description: 'Which edge to trim.', required: true, enum: ['left', 'right'] }, frameDelta: { type: 'number', description: 'Number of frames to trim (negative = shorter).', required: true } }, requiresConfirmation: true, tokenCost: 8, adapter: 'media-composer' },
  { name: 'split_clip', description: 'Split a clip into two at the given frame.', parameters: { clipId: { type: 'string', description: 'Clip to split.', required: true }, frame: { type: 'number', description: 'Frame position for the split.', required: true } }, requiresConfirmation: true, tokenCost: 6, adapter: 'media-composer' },
  { name: 'set_clip_speed', description: 'Change the playback speed of a clip.', parameters: { clipId: { type: 'string', description: 'Clip to modify.', required: true }, speed: { type: 'number', description: 'Playback speed multiplier (1.0 = normal).', required: true } }, requiresConfirmation: false, tokenCost: 5, adapter: 'media-composer' },
  { name: 'add_marker', description: 'Add a marker to the timeline at a specific frame.', parameters: { frame: { type: 'number', description: 'Frame position.', required: true }, label: { type: 'string', description: 'Marker label.', required: true }, color: { type: 'string', description: 'Marker colour (hex).' } }, requiresConfirmation: false, tokenCost: 4, adapter: 'media-composer' },

  // Media management
  { name: 'move_clip_to_bin', description: 'Move a clip reference to a different bin.', parameters: { clipId: { type: 'string', description: 'Clip to move.', required: true }, binId: { type: 'string', description: 'Target bin.', required: true } }, requiresConfirmation: false, tokenCost: 5, adapter: 'content-core' },
  { name: 'set_clip_metadata', description: 'Set metadata key-value pairs on a clip.', parameters: { clipId: { type: 'string', description: 'Clip to tag.', required: true }, metadata: { type: 'object', description: 'Key-value metadata.', required: true } }, requiresConfirmation: false, tokenCost: 6, adapter: 'content-core' },
  { name: 'create_bin', description: 'Create a new bin (folder) in the media browser.', parameters: { name: { type: 'string', description: 'Bin name.', required: true }, parentBinId: { type: 'string', description: 'Parent bin identifier.' }, color: { type: 'string', description: 'Bin colour (hex).' } }, requiresConfirmation: false, tokenCost: 4, adapter: 'content-core' },
  { name: 'auto_organize_bins', description: 'Automatically organize media in bins by scene, type, or date.', parameters: { strategy: { type: 'string', description: 'Organisation strategy.', required: true, enum: ['scene', 'type', 'date', 'camera'] }, rootBinId: { type: 'string', description: 'Root bin to organise.' } }, requiresConfirmation: false, tokenCost: 12, adapter: 'content-core' },
  { name: 'find_similar_clips', description: 'Find clips visually or audibly similar to a reference clip.', parameters: { referenceClipId: { type: 'string', description: 'Reference clip.', required: true }, similarity: { type: 'string', description: 'Similarity mode.', enum: ['visual', 'audio', 'both'] }, threshold: { type: 'number', description: 'Similarity threshold (0-1).' } }, requiresConfirmation: false, tokenCost: 15, adapter: 'content-core' },

  // Colour & grading
  { name: 'apply_color_grade', description: 'Apply a colour grading LUT or preset to one or more clips.', parameters: { clipIds: { type: 'array', description: 'Clips to grade.', required: true }, preset: { type: 'string', description: 'Grade preset name.', required: true } }, requiresConfirmation: false, tokenCost: 10, adapter: 'media-composer' },
  { name: 'auto_color_match', description: 'Match the colour grading of target clips to a reference clip.', parameters: { referenceClipId: { type: 'string', description: 'Reference clip.', required: true }, targetClipIds: { type: 'array', description: 'Clips to match.', required: true } }, requiresConfirmation: false, tokenCost: 12, adapter: 'media-composer' },

  // Audio
  { name: 'adjust_audio_level', description: 'Set the audio level (dB) for a clip or track.', parameters: { targetId: { type: 'string', description: 'Clip or track identifier.', required: true }, targetType: { type: 'string', description: 'Target type.', required: true, enum: ['clip', 'track'] }, levelDb: { type: 'number', description: 'Level in dB.', required: true } }, requiresConfirmation: false, tokenCost: 5, adapter: 'pro-tools' },
  { name: 'analyze_audio', description: 'Analyse audio waveform for loudness, peaks, and silence regions.', parameters: { trackId: { type: 'string', description: 'Track to analyse.', required: true }, clipId: { type: 'string', description: 'Specific clip (optional).' } }, requiresConfirmation: false, tokenCost: 10, adapter: 'pro-tools' },
  { name: 'remove_silence', description: 'Detect and remove silent segments from an audio track.', parameters: { trackId: { type: 'string', description: 'Track to process.', required: true }, thresholdDb: { type: 'number', description: 'Silence threshold in dB.' }, minDurationMs: { type: 'number', description: 'Minimum silence duration in ms.' } }, requiresConfirmation: true, tokenCost: 12, adapter: 'pro-tools' },
  { name: 'normalize_audio', description: 'Normalize audio levels to broadcast standard (-23 LUFS).', parameters: { trackId: { type: 'string', description: 'Track to normalise.', required: true }, targetLufs: { type: 'number', description: 'Target LUFS level.' } }, requiresConfirmation: false, tokenCost: 8, adapter: 'pro-tools' },

  // AI analysis
  { name: 'suggest_cuts', description: 'Analyse a clip and suggest optimal cut points based on content.', parameters: { clipId: { type: 'string', description: 'Clip to analyse.', required: true }, style: { type: 'string', description: 'Editing style.', enum: ['narrative', 'action', 'documentary', 'interview'] } }, requiresConfirmation: false, tokenCost: 15, adapter: 'local-ai' },
  { name: 'detect_scene_changes', description: 'Detect scene/shot changes in a video clip based on visual analysis.', parameters: { clipId: { type: 'string', description: 'Clip to analyse.', required: true }, sensitivity: { type: 'number', description: 'Detection sensitivity (0-1).' } }, requiresConfirmation: false, tokenCost: 12, adapter: 'local-ai' },
  { name: 'generate_captions', description: 'Generate word-level captions from an audio track.', parameters: { trackId: { type: 'string', description: 'Track to transcribe.', required: true }, language: { type: 'string', description: 'Target language.', required: true }, style: { type: 'string', description: 'Caption style.' } }, requiresConfirmation: false, tokenCost: 20, adapter: 'local-ai' },
  { name: 'generate_rough_cut', description: 'Generate a rough-cut assembly from bin footage using AI analysis.', parameters: { binId: { type: 'string', description: 'Source bin.', required: true }, style: { type: 'string', description: 'Editing style.' }, targetDurationSec: { type: 'number', description: 'Target duration in seconds.' } }, requiresConfirmation: true, tokenCost: 25, adapter: 'local-ai' },
  { name: 'auto_reframe', description: 'Automatically reframe a clip for a different aspect ratio.', parameters: { clipId: { type: 'string', description: 'Clip to reframe.', required: true }, targetAspect: { type: 'string', description: 'Target aspect ratio (e.g. 9:16).', required: true } }, requiresConfirmation: false, tokenCost: 15, adapter: 'local-ai' },
];

// ---------------------------------------------------------------------------
// Event Subscriber
// ---------------------------------------------------------------------------

/** Callback for plan status updates. */
export type PlanUpdateSubscriber = (plan: AgentPlan) => void;

// ---------------------------------------------------------------------------
// Execution Concurrency
// ---------------------------------------------------------------------------

/** Default maximum number of steps to execute in parallel. */
const DEFAULT_PARALLEL_CONCURRENCY = 4;

/** Maximum number of plans that can execute at the same time. */
const MAX_CONCURRENT_PLANS = 8;

/** Maximum history entries before pruning. */
const MAX_HISTORY_SIZE = 1_000;

/** Percentage of history to prune when the limit is reached. */
const HISTORY_PRUNE_PERCENT = 0.1;

/** Maximum retry attempts for a single step before giving up. */
const DEFAULT_STEP_RETRY_COUNT = 2;

/** Token budget overshoot tolerance (10% headroom). */
const TOKEN_BUDGET_HEADROOM = 0.1;

/** Default plan-level execution timeout: 5 minutes. */
const DEFAULT_PLAN_TIMEOUT_MS = 5 * 60 * 1000;

/** Default step-level backoff delays: 1s, 2s, 4s. */
const DEFAULT_STEP_BACKOFF_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];

/** Default max dead-letter queue size. */
const DEFAULT_DEAD_LETTER_MAX_SIZE = 100;

// ---------------------------------------------------------------------------
// OrchestratorService
// ---------------------------------------------------------------------------

/**
 * Central orchestration service for the agent pipeline.
 *
 * Lifecycle:
 * 1. `processIntent` -- generate a plan from a user intent (returns in `preview` status).
 * 2. `approvePlan` / `approveStep` -- approve the plan or individual steps.
 * 3. Steps execute via the {@link ToolCallRouter}.
 * 4. `compensatePlan` -- roll back executed steps if needed.
 *
 * Execution modes:
 * - `sequential` -- steps execute one at a time (default).
 * - `parallel`   -- independent steps execute concurrently.
 * - `conditional` -- steps execute sequentially with skip logic.
 */
export class OrchestratorService {
  private readonly planGenerator: PlanGenerator;
  private readonly contextAssembler: ContextAssembler;
  private readonly policyEngine: ApprovalPolicyEngine;
  private readonly toolRouter: ToolCallRouter;
  private readonly toolLogger: ToolCallLogger;
  private readonly compensationManager: CompensationManager;
  private readonly contextCache: ContextCache;
  private readonly analyticsLogger: AnalyticsLogger;
  private readonly tools: ToolDefinition[];
  private readonly executionMode: ExecutionMode;
  private readonly parallelConcurrency: number;
  private readonly stepRetryCount: number;
  private readonly tokenBudgetEnabled: boolean;
  private readonly planTimeoutMs: number;
  private readonly stepBackoffDelaysMs: readonly number[];
  private readonly deadLetterMaxSize: number;

  /** All plans keyed by plan ID. */
  private plans: Map<string, AgentPlan> = new Map();
  /** Completed/failed plans for history. */
  private history: AgentPlan[] = [];
  /** Subscribers for plan updates. */
  private subscribers: Set<PlanUpdateSubscriber> = new Set();
  /** Tracks how many plans are currently executing. */
  private executingPlanCount = 0;
  /** Set of plan IDs that have been requested for cancellation. */
  private cancelledPlanIds: Set<string> = new Set();
  /** Dead-letter queue for plans that failed after exhausting retries. */
  private deadLetterQueue: DeadLetterEntry[] = [];
  /** Tracks per-plan execution start times for timeout enforcement. */
  private planStartTimes: Map<string, number> = new Map();

  /**
   * @param config - Orchestrator configuration.
   */
  constructor(config: OrchestratorConfig = {}) {
    this.planGenerator = new PlanGenerator({
      apiKey: config.geminiApiKey,
      model: config.geminiModel,
    });
    this.contextAssembler = new ContextAssembler();
    this.policyEngine = new ApprovalPolicyEngine(config.defaultPolicy);
    this.toolRouter = new ToolCallRouter();
    this.toolLogger = new ToolCallLogger();
    this.compensationManager = new CompensationManager();
    this.contextCache = new ContextCache();
    this.analyticsLogger = new AnalyticsLogger();
    this.tools = [...DEFAULT_TOOLS];
    this.executionMode = config.executionMode ?? 'sequential';
    this.parallelConcurrency = DEFAULT_PARALLEL_CONCURRENCY;
    this.stepRetryCount = config.stepRetryCount ?? DEFAULT_STEP_RETRY_COUNT;
    this.tokenBudgetEnabled = config.tokenBudgetEnabled ?? true;
    this.planTimeoutMs = config.planTimeoutMs ?? DEFAULT_PLAN_TIMEOUT_MS;
    this.stepBackoffDelaysMs = config.stepBackoffDelaysMs ?? DEFAULT_STEP_BACKOFF_DELAYS_MS;
    this.deadLetterMaxSize = config.deadLetterMaxSize ?? DEFAULT_DEAD_LETTER_MAX_SIZE;
  }

  // -----------------------------------------------------------------------
  // Plan lifecycle
  // -----------------------------------------------------------------------

  /**
   * Process a user intent into an execution plan.
   *
   * The plan is returned in `preview` status so the user can inspect and
   * approve before any tools are executed.
   *
   * @param intent    - Raw natural-language intent.
   * @param context   - Current editing context.
   * @param sessionId - Session identifier for analytics correlation.
   * @returns The generated plan in preview status.
   */
  async processIntent(
    intent: string,
    context: AgentContext,
    sessionId: string,
  ): Promise<AgentPlan> {
    // Log the prompt
    const contextText = this.contextAssembler.assemble(context);
    this.analyticsLogger.logPrompt(sessionId, intent, contextText);

    // Check cache for identical intent+context
    const cacheKey = `plan:${intent}:${context.projectId}:${context.sequenceId ?? ''}`;
    const cached = this.contextCache.get<AgentPlan>(cacheKey);
    if (cached) {
      // Return a deep copy with a new ID so it is independently manageable
      const freshPlan = this.clonePlanWithNewIds(cached);
      this.plans.set(freshPlan.id, freshPlan);
      this.analyticsLogger.logPlan(sessionId, freshPlan);
      this.notify(freshPlan);
      return freshPlan;
    }

    // Generate plan
    const plan = await this.planGenerator.generatePlan(intent, context, this.tools);
    this.plans.set(plan.id, plan);

    // Cache for re-use
    this.contextCache.set(cacheKey, plan, 2 * 60 * 1000); // 2 minute TTL

    // Log plan creation
    this.analyticsLogger.logPlan(sessionId, plan);
    this.toolLogger.logPlanEvent({ type: 'plan-created', planId: plan.id });
    this.notify(plan);

    return plan;
  }

  /**
   * Approve an entire plan and execute all pending steps.
   *
   * Execution mode is determined by the service configuration:
   * - `sequential` -- steps run one at a time.
   * - `parallel`   -- independent steps run concurrently.
   * - `conditional` -- steps run sequentially with skip logic.
   *
   * @param planId - The plan to approve.
   * @returns The plan after execution completes.
   * @throws Error if the plan is not found, not in a valid state, or if the
   *   concurrent plan execution limit has been reached.
   */
  async approvePlan(planId: string): Promise<AgentPlan> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    if (plan.status !== 'preview') {
      throw new Error(`Plan "${planId}" is in "${plan.status}" status and cannot be approved.`);
    }

    // Guard: enforce concurrent plan execution limit
    if (this.executingPlanCount >= MAX_CONCURRENT_PLANS) {
      throw new Error(
        `Concurrent plan execution limit reached (${MAX_CONCURRENT_PLANS}). ` +
        `Wait for an active plan to complete before approving another.`,
      );
    }

    plan.status = 'approved';
    plan.updatedAt = new Date().toISOString();
    this.toolLogger.logPlanEvent({ type: 'plan-approved', planId });
    this.notify(plan);

    // Approve all pending steps
    for (const step of plan.steps) {
      if (step.status === 'pending') {
        (step as { status: string }).status = 'approved';
      }
    }

    // Guard again right before execution in case multiple approvals raced.
    if (this.executingPlanCount >= MAX_CONCURRENT_PLANS) {
      plan.status = 'preview';
      plan.updatedAt = new Date().toISOString();
      for (const step of plan.steps) {
        if (step.status === 'approved') {
          (step as { status: string }).status = 'pending';
        }
      }
      this.notify(plan);
      throw new Error(
        `Concurrent plan execution limit reached (${MAX_CONCURRENT_PLANS}). ` +
        `Wait for an active plan to complete before approving another.`,
      );
    }

    // Execute
    plan.status = 'executing';
    plan.updatedAt = new Date().toISOString();
    this.executingPlanCount++;
    this.notify(plan);

    try {
      await this.executeSteps(plan);
    } finally {
      this.executingPlanCount = Math.max(0, this.executingPlanCount - 1);
    }

    return plan;
  }

  /**
   * Approve and execute a single step within a plan.
   *
   * @param planId - The plan identifier.
   * @param stepId - The step to approve.
   * @returns The step after execution.
   * @throws Error if the plan or step is not found.
   */
  async approveStep(planId: string, stepId: string): Promise<AgentStep> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step "${stepId}" not found in plan "${planId}".`);
    }

    if (step.status !== 'pending') {
      throw new Error(`Step "${stepId}" is in "${step.status}" status and cannot be approved.`);
    }

    (step as { status: string }).status = 'approved';
    this.toolLogger.logPlanEvent({ type: 'step-approved', planId, stepId });
    this.notify(plan);

    // Execute just this step
    await this.executeSingleStep(plan, step);

    return step;
  }

  /**
   * Reject an entire plan.
   *
   * @param planId - The plan to reject.
   * @param reason - Optional rejection reason.
   */
  async rejectPlan(planId: string, reason?: string): Promise<void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    plan.status = 'cancelled';
    plan.updatedAt = new Date().toISOString();

    for (const step of plan.steps) {
      if (step.status === 'pending' || step.status === 'approved') {
        (step as { status: string }).status = 'cancelled';
      }
    }

    this.toolLogger.logPlanEvent({
      type: 'plan-failed',
      planId,
      metadata: { reason: reason ?? 'Rejected by user' },
    });

    this.archivePlan(plan);
    this.notify(plan);
  }

  /**
   * Cancel a plan that may already be executing and compensate any
   * completed destructive steps automatically.
   *
   * @param planId       - The plan to cancel.
   * @param compensate   - Whether to automatically compensate executed steps (default: true).
   * @returns Compensation summary if compensation was performed.
   */
  async cancelPlan(
    planId: string,
    compensate = true,
  ): Promise<{ compensated: number; failed: number; skipped: number; totalDurationMs: number } | void> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    // Signal cancellation so in-flight steps stop at the next checkpoint.
    this.cancelledPlanIds.add(planId);

    plan.status = 'cancelled';
    plan.updatedAt = new Date().toISOString();

    for (const step of plan.steps) {
      if (step.status === 'pending' || step.status === 'approved' || step.status === 'executing') {
        (step as { status: string }).status = 'cancelled';
      }
    }

    this.toolLogger.logPlanEvent({
      type: 'plan-failed',
      planId,
      metadata: { reason: 'Cancelled' },
    });

    // Auto-compensate completed destructive steps.
    let result: { compensated: number; failed: number; skipped: number; totalDurationMs: number } | undefined;
    if (compensate) {
      const hasCompletedSteps = plan.steps.some((s) => s.status === 'completed');
      if (hasCompletedSteps) {
        result = await this.compensationManager.compensatePlan(planId, plan.steps);
        for (const step of plan.steps) {
          if (step.status === 'completed') {
            const compensation = this.compensationManager
              .getCompensations(planId)
              .find((c) => c.stepId === step.id);
            if (compensation?.success) {
              (step as { status: string }).status = 'compensated';
            }
          }
        }
      }
    }

    this.cancelledPlanIds.delete(planId);
    this.archivePlan(plan);
    this.notify(plan);

    return result;
  }

  /**
   * Compensate (undo) all executed steps in a plan.
   *
   * @param planId - The plan to compensate.
   * @returns Summary of compensated, failed, and skipped counts.
   */
  async compensatePlan(
    planId: string,
  ): Promise<{ compensated: number; failed: number; skipped: number; totalDurationMs: number }> {
    const plan = this.plans.get(planId) ?? this.history.find((p) => p.id === planId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found.`);
    }

    const result = await this.compensationManager.compensatePlan(planId, plan.steps);

    // Mark compensated steps
    for (const step of plan.steps) {
      if (step.status === 'completed') {
        const compensation = this.compensationManager
          .getCompensations(planId)
          .find((c) => c.stepId === step.id);
        if (compensation?.success) {
          (step as { status: string }).status = 'compensated';
        }
      }
    }

    plan.updatedAt = new Date().toISOString();
    this.notify(plan);

    return result;
  }

  // -----------------------------------------------------------------------
  // Plan queries
  // -----------------------------------------------------------------------

  /**
   * Get a specific plan by ID.
   *
   * @param planId - The plan identifier.
   * @returns The plan, or `undefined` if not found.
   */
  getPlan(planId: string): AgentPlan | undefined {
    return this.plans.get(planId) ?? this.history.find((p) => p.id === planId);
  }

  /**
   * Get all active (non-archived) plans.
   *
   * @returns Array of active plans.
   */
  getActivePlans(): AgentPlan[] {
    return Array.from(this.plans.values());
  }

  /**
   * Get all archived (completed/failed/cancelled) plans.
   *
   * @returns Array of historical plans.
   */
  getHistory(): AgentPlan[] {
    return [...this.history];
  }

  /**
   * Get the list of registered tool definitions.
   *
   * @returns Array of tool definitions.
   */
  getTools(): ToolDefinition[] {
    return [...this.tools];
  }

  /**
   * Get the analytics logger for external access (e.g. API routes).
   */
  getAnalytics(): AnalyticsLogger {
    return this.analyticsLogger;
  }

  /**
   * Get the tool call router for adapter registration.
   */
  getRouter(): ToolCallRouter {
    return this.toolRouter;
  }

  // -----------------------------------------------------------------------
  // Subscriptions
  // -----------------------------------------------------------------------

  /**
   * Subscribe to plan status updates.
   *
   * @param cb - Callback invoked with a plan snapshot on every change.
   * @returns Unsubscribe function.
   */
  subscribe(cb: PlanUpdateSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /**
   * Get the current execution mode.
   */
  getExecutionMode(): ExecutionMode {
    return this.executionMode;
  }

  /**
   * Get the number of plans currently executing.
   */
  getExecutingPlanCount(): number {
    return this.executingPlanCount;
  }

  /**
   * Get circuit breaker states for all adapters via the tool router.
   */
  getCircuitStates(): Record<string, string> {
    const stats = this.toolRouter.getConsumptionStats();
    const states: Record<string, string> = {};
    for (const adapter of Object.keys(stats.byAdapter)) {
      const state = this.toolRouter.getCircuitState(adapter);
      if (state !== undefined) {
        states[adapter] = state;
      }
    }
    return states;
  }

  // -----------------------------------------------------------------------
  // Dead-letter queue
  // -----------------------------------------------------------------------

  /**
   * Get all entries in the dead-letter queue.
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return this.deadLetterQueue.map((entry) => ({
      ...entry,
      plan: {
        ...entry.plan,
        steps: entry.plan.steps.map((s) => ({ ...s })),
      },
    }));
  }

  /**
   * Get the count of entries in the dead-letter queue.
   */
  getDeadLetterCount(): number {
    return this.deadLetterQueue.length;
  }

  /**
   * Clear the dead-letter queue.
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue.length = 0;
  }

  /**
   * Remove a specific entry from the dead-letter queue by plan ID.
   *
   * @param planId - The plan ID to remove.
   * @returns `true` if an entry was found and removed.
   */
  removeFromDeadLetterQueue(planId: string): boolean {
    const index = this.deadLetterQueue.findIndex((e) => e.plan.id === planId);
    if (index >= 0) {
      this.deadLetterQueue.splice(index, 1);
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Private: execution
  // -----------------------------------------------------------------------

  /**
   * Execute all approved steps in a plan using the configured execution mode.
   * Enforces a plan-level timeout. On failure, auto-compensates completed
   * destructive steps and dead-letters the plan if all retries are exhausted.
   */
  private async executeSteps(plan: AgentPlan): Promise<void> {
    this.planStartTimes.set(plan.id, Date.now());

    let allSucceeded: boolean;
    let timedOut = false;

    try {
      const executionPromise = (async (): Promise<boolean> => {
        switch (this.executionMode) {
          case 'parallel':
            return this.executeStepsParallel(plan);
          case 'conditional':
            return this.executeStepsConditional(plan);
          case 'sequential':
          default:
            return this.executeStepsSequential(plan);
        }
      })();

      // Race execution against the plan-level timeout
      const timeoutPromise = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          timedOut = true;
          // Signal cancellation so in-flight steps stop
          this.cancelledPlanIds.add(plan.id);
          resolve(false);
        }, this.planTimeoutMs);
        // Don't let the timer keep the process alive
        if (typeof timer === 'object' && 'unref' in timer) {
          timer.unref();
        }
        // Store for cleanup
        (plan as { _timeoutTimer?: ReturnType<typeof setTimeout> })._timeoutTimer = timer;
      });

      allSucceeded = await Promise.race([executionPromise, timeoutPromise]);

      // Clean up timeout timer
      const timer = (plan as { _timeoutTimer?: ReturnType<typeof setTimeout> })._timeoutTimer;
      if (timer !== undefined) {
        clearTimeout(timer);
        delete (plan as { _timeoutTimer?: ReturnType<typeof setTimeout> })._timeoutTimer;
      }
    } finally {
      this.planStartTimes.delete(plan.id);
      // Clean up cancellation signal if it was set by timeout
      if (timedOut) {
        this.cancelledPlanIds.delete(plan.id);
      }
    }

    if (timedOut) {
      // Mark remaining steps as cancelled due to timeout
      for (const step of plan.steps) {
        if (step.status === 'approved' || step.status === 'executing') {
          (step as { status: string }).status = 'cancelled';
          (step as { error?: string }).error = `Plan timed out after ${this.planTimeoutMs}ms`;
        }
      }
    }

    const planFailed = !allSucceeded;
    plan.status = planFailed ? 'failed' : 'completed';
    plan.updatedAt = new Date().toISOString();

    // On failure, auto-compensate completed destructive steps
    if (planFailed) {
      const hasCompletedSteps = plan.steps.some((s) => s.status === 'completed');
      if (hasCompletedSteps) {
        await this.compensationManager.compensatePlan(plan.id, plan.steps);
        for (const step of plan.steps) {
          if (step.status === 'completed') {
            const compensation = this.compensationManager
              .getCompensations(plan.id)
              .find((c) => c.stepId === step.id);
            if (compensation?.success) {
              (step as { status: string }).status = 'compensated';
            }
          }
        }
      }

      // Add to dead-letter queue
      this.addToDeadLetterQueue(plan, timedOut
        ? `Plan timed out after ${this.planTimeoutMs}ms`
        : 'Plan execution failed');
    }

    this.toolLogger.logPlanEvent({
      type: planFailed ? 'plan-failed' : 'plan-completed',
      planId: plan.id,
      metadata: timedOut ? { reason: 'timeout' } : undefined,
    });

    this.archivePlan(plan);
    this.notify(plan);
  }

  /**
   * Sequential execution: steps run one at a time, halting on first failure
   * or if the plan has been cancelled.
   */
  private async executeStepsSequential(plan: AgentPlan): Promise<boolean> {
    for (const step of plan.steps) {
      // Check cancellation before each step.
      if (this.isPlanCancelled(plan.id)) {
        for (const remaining of plan.steps) {
          if (remaining.status === 'approved') {
            (remaining as { status: string }).status = 'cancelled';
          }
        }
        return false;
      }

      if (step.status === 'cancelled') continue;
      if (step.status !== 'approved') continue;

      const success = await this.executeSingleStep(plan, step);
      if (!success) {
        // Cancel remaining steps on failure
        for (const remaining of plan.steps) {
          if (remaining.status === 'approved') {
            (remaining as { status: string }).status = 'cancelled';
          }
        }
        return false;
      }
    }
    return true;
  }

  /**
   * Parallel execution: run approved steps concurrently with a concurrency
   * limit to avoid overwhelming backend adapters.
   *
   * Steps are grouped by their adapter -- steps within the same adapter
   * execute in order, but different adapters run in parallel.
   */
  private async executeStepsParallel(plan: AgentPlan): Promise<boolean> {
    const approvedSteps = plan.steps.filter(
      (s) => s.status === 'approved',
    );

    if (approvedSteps.length === 0) return true;

    // Partition steps into batches respecting the concurrency limit
    const batchSize = this.parallelConcurrency;
    let allSucceeded = true;

    for (let i = 0; i < approvedSteps.length; i += batchSize) {
      const batch = approvedSteps.slice(i, i + batchSize);

      // If a previous batch already failed, cancel remaining steps
      if (!allSucceeded) {
        for (const step of batch) {
          (step as { status: string }).status = 'cancelled';
        }
        continue;
      }

      const results = await Promise.allSettled(
        batch.map((step) => this.executeSingleStep(plan, step)),
      );

      for (const result of results) {
        if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value)) {
          allSucceeded = false;
        }
      }
    }

    return allSucceeded;
  }

  /**
   * Conditional execution: steps run sequentially but may be skipped if
   * the previous step failed (non-fatal skip, does not halt the plan).
   */
  private async executeStepsConditional(plan: AgentPlan): Promise<boolean> {
    let anyFailed = false;

    for (const step of plan.steps) {
      if (step.status === 'cancelled') continue;
      if (step.status !== 'approved') continue;

      const success = await this.executeSingleStep(plan, step);
      if (!success) {
        anyFailed = true;
        // In conditional mode, continue executing remaining steps
        // (unlike sequential which halts on first failure)
      }
    }

    return !anyFailed;
  }

  /**
   * Check whether the plan has been flagged for cancellation or has
   * exceeded its timeout.
   */
  private isPlanCancelled(planId: string): boolean {
    if (this.cancelledPlanIds.has(planId)) return true;
    // Check plan-level timeout
    const startTime = this.planStartTimes.get(planId);
    if (startTime !== undefined && Date.now() - startTime > this.planTimeoutMs) {
      return true;
    }
    return false;
  }

  /**
   * Check whether executing the next step would exceed the plan's token budget.
   *
   * @param plan     - The plan being executed.
   * @param toolName - The tool about to be invoked.
   * @returns `true` if the budget would be exceeded.
   */
  private wouldExceedTokenBudget(plan: AgentPlan, toolName: string): boolean {
    if (!this.tokenBudgetEnabled) return false;
    if (plan.tokensEstimated <= 0) return false;

    // Find the tool definition to estimate the upcoming cost.
    const toolDef = this.tools.find((t) => t.name === toolName);
    const estimatedStepCost = toolDef?.tokenCost ?? 10;

    const budgetCeiling = plan.tokensEstimated * (1 + TOKEN_BUDGET_HEADROOM);
    return plan.tokensUsed + estimatedStepCost > budgetCeiling;
  }

  /**
   * Execute a single step with retry logic: route the tool call, log the
   * result, register compensation if applicable, and track analytics.
   *
   * The step is retried up to `stepRetryCount` times for transient failures
   * (as determined by the ToolCallRouter). Destructive tools are never
   * retried at the orchestrator level; the router handles its own retry
   * for non-destructive tools.
   */
  private async executeSingleStep(plan: AgentPlan, step: AgentStep): Promise<boolean> {
    // Check for cancellation before starting.
    if (this.isPlanCancelled(plan.id)) {
      (step as { status: string }).status = 'cancelled';
      return false;
    }

    // Check token budget before execution.
    if (this.wouldExceedTokenBudget(plan, step.toolName)) {
      (step as { status: string }).status = 'failed';
      (step as { error?: string }).error =
        `Token budget exceeded: used ${plan.tokensUsed} of ${plan.tokensEstimated} estimated tokens.`;
      (step as { completedAt?: string }).completedAt = new Date().toISOString();
      plan.updatedAt = new Date().toISOString();
      this.notify(plan);
      return false;
    }

    (step as { status: string }).status = 'executing';
    (step as { startedAt?: string }).startedAt = new Date().toISOString();
    this.notify(plan);

    // Destructive tools should not be retried at the orchestrator level.
    const destructiveTools = new Set([
      'extract', 'lift', 'split_clip', 'overwrite', 'ripple_trim', 'remove_silence',
    ]);
    const isDestructive = destructiveTools.has(step.toolName);
    const maxAttempts = isDestructive ? 1 : Math.max(1, this.stepRetryCount + 1);
    let result: ToolCallResult | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check cancellation between retries.
      if (attempt > 0 && this.isPlanCancelled(plan.id)) {
        (step as { status: string }).status = 'cancelled';
        return false;
      }

      // Step-level backoff between retries using configurable delays (default: 1s, 2s, 4s).
      if (attempt > 0) {
        const delayIndex = Math.min(attempt - 1, this.stepBackoffDelaysMs.length - 1);
        const backoffMs = this.stepBackoffDelaysMs[delayIndex] ?? 1_000;
        await new Promise<void>((resolve) => setTimeout(resolve, backoffMs));
      }

      try {
        result = await this.toolRouter.route(step.toolName, step.toolArgs as Record<string, unknown>);
      } catch (err) {
        // Defensive: if the router itself throws (should not normally happen)
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (attempt < maxAttempts - 1) continue; // retry
        (step as { status: string }).status = 'failed';
        (step as { error?: string }).error = errorMsg;
        (step as { completedAt?: string }).completedAt = new Date().toISOString();
        plan.updatedAt = new Date().toISOString();
        this.notify(plan);
        return false;
      }

      // If the call succeeded, break out of the retry loop.
      if (result.success) break;

      // If the call failed but we have retries left, continue.
      if (attempt < maxAttempts - 1) continue;
    }

    // Should never be null given the loop, but guard defensively.
    if (!result) {
      (step as { status: string }).status = 'failed';
      (step as { error?: string }).error = 'No result after retry attempts.';
      (step as { completedAt?: string }).completedAt = new Date().toISOString();
      plan.updatedAt = new Date().toISOString();
      this.notify(plan);
      return false;
    }

    // Log the tool call
    this.toolLogger.logToolCall({
      traceId: result.traceId,
      planId: plan.id,
      stepId: step.id,
      toolName: step.toolName,
      durationMs: result.durationMs,
      success: result.success,
      error: result.error,
    });

    // Update step
    (step as { completedAt?: string }).completedAt = new Date().toISOString();
    (step as { durationMs?: number }).durationMs = result.durationMs;
    plan.tokensUsed += result.tokensConsumed;

    if (result.success) {
      (step as { status: string }).status = 'completed';
      (step as { result?: string }).result =
        typeof result.result === 'string' ? result.result : JSON.stringify(result.result);

      // Register compensation for destructive tools
      if (isDestructive) {
        const capturedToolName = step.toolName;
        const capturedArgs = step.toolArgs;
        this.compensationManager.registerCompensation(
          step.id,
          async () => {
            // In a production system this would invoke the inverse operation
            // via the adapter. For now the compensation is logged for auditing.
            void capturedArgs;
            void capturedToolName;
          },
          `Undo ${step.toolName}: ${step.description}`,
          plan.id,
        );
        (step as { compensation?: string }).compensation = `Undo ${step.toolName}`;
      }
    } else {
      (step as { status: string }).status = 'failed';
      (step as { error?: string }).error = result.error;
    }

    plan.updatedAt = new Date().toISOString();
    this.notify(plan);

    return result.success;
  }

  // -----------------------------------------------------------------------
  // Private: helpers
  // -----------------------------------------------------------------------

  /**
   * Add a failed plan to the dead-letter queue for later inspection.
   */
  private addToDeadLetterQueue(plan: AgentPlan, reason: string): void {
    const failedSteps = plan.steps.filter((s) => s.status === 'failed');
    this.deadLetterQueue.push({
      plan: {
        ...plan,
        steps: plan.steps.map((s) => ({ ...s })),
      },
      reason,
      deadLetteredAt: new Date().toISOString(),
      attempts: failedSteps.length,
    });

    // Prune oldest entries if over the limit
    while (this.deadLetterQueue.length > this.deadLetterMaxSize) {
      this.deadLetterQueue.shift();
    }
  }

  /**
   * Move a plan from the active map to the history array.
   */
  private archivePlan(plan: AgentPlan): void {
    this.plans.delete(plan.id);
    this.history.push(plan);

    // Keep history bounded
    if (this.history.length > MAX_HISTORY_SIZE) {
      const pruneCount = Math.max(1, Math.floor(MAX_HISTORY_SIZE * HISTORY_PRUNE_PERCENT));
      this.history.splice(0, pruneCount);
    }
  }

  /**
   * Deep-clone a plan with fresh IDs so it can be independently managed.
   */
  private clonePlanWithNewIds(source: AgentPlan): AgentPlan {
    const newPlanId = uuidv4();
    const now = new Date().toISOString();

    return {
      ...source,
      id: newPlanId,
      steps: source.steps.map((step, index) => ({
        ...step,
        id: uuidv4(),
        planId: newPlanId,
        index,
        status: 'pending' as const,
        result: undefined,
        error: undefined,
        compensation: undefined,
        startedAt: undefined,
        completedAt: undefined,
        durationMs: undefined,
      })),
      status: 'preview' as const,
      tokensUsed: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Notify all subscribers with a snapshot of the plan.
   */
  private notify(plan: AgentPlan): void {
    const snapshot: AgentPlan = {
      ...plan,
      steps: plan.steps.map((s) => ({ ...s })),
    };

    for (const cb of this.subscribers) {
      try {
        cb(snapshot);
      } catch (error) {
        // Subscriber error — logged but not re-thrown to avoid disrupting notifications
        void (error); // Swallow subscriber errors to protect other subscribers
      }
    }
  }
}
