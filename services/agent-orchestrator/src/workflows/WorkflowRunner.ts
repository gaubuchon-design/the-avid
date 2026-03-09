/**
 * @module workflows/WorkflowRunner
 * @description Executes exemplar workflows through the OrchestratorService,
 * producing structured results with latency and token-cost reports.
 *
 * The runner bridges seed data and workflow definitions into the existing
 * plan-preview-approve-execute pipeline:
 *
 * 1. Build an {@link AgentContext} from the workflow's seed data.
 * 2. Call `orchestrator.processIntent()` with the workflow's demo prompt.
 * 3. Auto-approve the generated plan.
 * 4. Collect per-step outputs and aggregate metrics.
 *
 * Progress callbacks allow UI integration for real-time step tracking.
 */

import type { OrchestratorService } from '../OrchestratorService';
import type { AgentContext, AgentPlan } from '../types';
import type {
  WorkflowDefinition,
  WorkflowResult,
  WorkflowOutput,
  SeedData,
  LatencyReport,
  TokenReport,
} from './types';
import { SEED_DATASETS } from './data/seed-data';
import { CREATOR_SOCIAL_FAST_PATH } from './creator-social-fast-path';
import { SPORTS_LIVE_PULL } from './sports-live-pull';
import { MULTILINGUAL_LOCALIZATION } from './multilingual-localization';
import { AUDIO_CLEANUP_TEMP_MUSIC } from './audio-cleanup-temp-music';
import { CONTEXTUAL_ARCHIVE_EDIT } from './contextual-archive-edit';
import { GENERATIVE_MOTION_CLEANUP } from './generative-motion-cleanup';

/**
 * Internal registry used by the runner to resolve workflow IDs.
 * Assembled here instead of importing from the barrel to avoid circular deps.
 */
const RUNNER_REGISTRY: Readonly<Record<string, WorkflowDefinition>> = {
  'creator-social-fast-path': CREATOR_SOCIAL_FAST_PATH,
  'sports-live-pull': SPORTS_LIVE_PULL,
  'multilingual-localization': MULTILINGUAL_LOCALIZATION,
  'audio-cleanup-temp-music': AUDIO_CLEANUP_TEMP_MUSIC,
  'contextual-archive-edit': CONTEXTUAL_ARCHIVE_EDIT,
  'generative-motion-cleanup': GENERATIVE_MOTION_CLEANUP,
};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Configuration options for the WorkflowRunner. */
export interface WorkflowRunnerOptions {
  /**
   * Progress callback invoked after each step completes.
   *
   * @param step  - Zero-based index of the completed step.
   * @param total - Total number of steps in the workflow.
   */
  readonly onProgress?: (step: number, total: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-token cost in USD used for approximate cost estimates. */
const COST_PER_TOKEN_USD = 0.00025;

/** Session identifier prefix for workflow demo runs. */
const DEMO_SESSION_PREFIX = 'workflow-demo';

// ---------------------------------------------------------------------------
// WorkflowRunner
// ---------------------------------------------------------------------------

/**
 * Runs exemplar workflows end-to-end through the orchestrator pipeline.
 *
 * @example
 * ```ts
 * const runner = new WorkflowRunner(orchestrator, {
 *   onProgress: (step, total) => console.log(`Step ${step + 1}/${total}`),
 * });
 * const result = await runner.runDemo('creator-social-fast-path');
 * console.log(runner.getLatencyReport(result));
 * ```
 */
export class WorkflowRunner {
  private readonly orchestrator: OrchestratorService;
  private readonly onProgress?: (step: number, total: number) => void;

  /**
   * @param orchestrator - The orchestrator service instance to drive.
   * @param options      - Optional runner configuration.
   */
  constructor(orchestrator: OrchestratorService, options?: WorkflowRunnerOptions) {
    this.orchestrator = orchestrator;
    this.onProgress = options?.onProgress;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Execute a workflow definition against its seed data.
   *
   * The method constructs an {@link AgentContext} from the seed data, submits
   * the workflow's demo prompt to the orchestrator, auto-approves the resulting
   * plan, and collects per-step execution results.
   *
   * @param workflow - The workflow definition to execute.
   * @param seedData - The seed dataset providing context.
   * @returns A structured result with per-step outputs and aggregate metrics.
   */
  async run(workflow: WorkflowDefinition, seedData: SeedData): Promise<WorkflowResult> {
    const startTime = performance.now();
    const sessionId = `${DEMO_SESSION_PREFIX}-${workflow.id}-${Date.now()}`;
    const context = this.buildContext(seedData);

    const outputs: WorkflowOutput[] = [];
    const errors: string[] = [];
    let tokensUsed = 0;

    try {
      // Phase 1: Generate plan from intent
      const plan = await this.orchestrator.processIntent(
        workflow.demoPrompt,
        context,
        sessionId,
      );

      // Phase 2: Auto-approve and execute
      const executedPlan = await this.orchestrator.approvePlan(plan.id);
      tokensUsed = executedPlan.tokensUsed;

      // Phase 3: Collect per-step results
      for (let i = 0; i < executedPlan.steps.length; i++) {
        const step = executedPlan.steps[i]!;

        outputs.push({
          stepIndex: i,
          toolName: step.toolName,
          description: step.description,
          result: step.result ? this.safeParseResult(step.result) : null,
          durationMs: step.durationMs ?? 0,
        });

        if (step.status === 'failed' && step.error) {
          errors.push(`Step ${i} (${step.toolName}): ${step.error}`);
        }

        // Notify progress
        this.onProgress?.(i, workflow.steps.length);
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const stepsCompleted = outputs.filter(
        (_, idx) => executedPlan.steps[idx]?.status === 'completed',
      ).length;

      return {
        workflowId: workflow.id,
        status: this.deriveStatus(executedPlan, stepsCompleted),
        stepsCompleted,
        totalSteps: workflow.steps.length,
        outputs,
        latencyMs,
        tokensUsed,
        errors,
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startTime);
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Workflow execution failed: ${message}`);

      return {
        workflowId: workflow.id,
        status: 'failed',
        stepsCompleted: outputs.filter((o) => !errors.some((e) => e.includes(`Step ${o.stepIndex}`))).length,
        totalSteps: workflow.steps.length,
        outputs,
        latencyMs,
        tokensUsed,
        errors,
      };
    }
  }

  /**
   * Convenience method that resolves a workflow and its seed data by ID,
   * then runs the workflow end-to-end.
   *
   * @param workflowId - Registered workflow identifier (e.g., `'creator-social-fast-path'`).
   * @returns A structured workflow result.
   * @throws Error if the workflow ID or seed data is not found.
   */
  async runDemo(workflowId: string): Promise<WorkflowResult> {
    const workflow = RUNNER_REGISTRY[workflowId];
    if (!workflow) {
      throw new Error(
        `Workflow "${workflowId}" not found. Available: ${Object.keys(RUNNER_REGISTRY).join(', ')}`,
      );
    }

    const seedData = SEED_DATASETS[workflow.seedDataId];
    if (!seedData) {
      throw new Error(
        `Seed data "${workflow.seedDataId}" not found for workflow "${workflowId}".`,
      );
    }

    return this.run(workflow, seedData);
  }

  /**
   * Generate a latency breakdown report from a workflow result.
   *
   * Planning and approval times are estimated since the orchestrator does not
   * expose phase-level timing. The heuristic allocates 20% of total latency
   * to planning, 5% to approval, and the remainder to execution.
   *
   * @param result - A completed workflow result.
   * @returns Structured latency report.
   */
  getLatencyReport(result: WorkflowResult): LatencyReport {
    const executionMs = result.outputs.reduce((sum, o) => sum + o.durationMs, 0);
    const overhead = Math.max(0, result.latencyMs - executionMs);

    // Heuristic breakdown: 80% planning, 20% approval of overhead
    const planningMs = Math.round(overhead * 0.8);
    const approvalMs = Math.round(overhead * 0.2);

    return {
      totalMs: result.latencyMs,
      perStep: result.outputs.map((o) => ({
        step: `${o.toolName} (${o.description})`,
        durationMs: o.durationMs,
      })),
      breakdown: {
        planning: planningMs,
        approval: approvalMs,
        execution: executionMs,
      },
    };
  }

  /**
   * Generate a token consumption report from a workflow result.
   *
   * Per-step token attribution is approximated by distributing the total
   * tokens proportionally to step duration. When duration data is unavailable,
   * tokens are distributed equally.
   *
   * @param result - A completed workflow result.
   * @returns Structured token report.
   */
  getTokenReport(result: WorkflowResult): TokenReport {
    const workflow = RUNNER_REGISTRY[result.workflowId];
    const totalDuration = result.outputs.reduce((sum, o) => sum + o.durationMs, 0);

    const perStep = result.outputs.map((o) => {
      const proportion = totalDuration > 0
        ? o.durationMs / totalDuration
        : 1 / Math.max(result.outputs.length, 1);

      return {
        step: `${o.toolName} (${o.description})`,
        tokens: Math.round(result.tokensUsed * proportion),
      };
    });

    const estimatedCost = (result.tokensUsed * COST_PER_TOKEN_USD).toFixed(4);

    return {
      totalTokens: result.tokensUsed,
      perStep,
      category: workflow?.vertical ?? 'unknown',
      estimatedCost: `~$${estimatedCost}`,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build an {@link AgentContext} from seed data.
   *
   * Uses the first bin as the active context and the first asset as the
   * reference clip, providing enough structure for the plan generator to
   * produce contextually relevant steps.
   */
  private buildContext(seedData: SeedData): AgentContext {
    const firstBin = seedData.bins[0];
    const transcriptText = seedData.transcriptSegments
      ?.map((seg) => `[${seg.speaker ?? 'Speaker'}] ${seg.text}`)
      .join('\n');

    return {
      projectId: `demo-${seedData.id}`,
      sequenceId: `seq-${seedData.id}-001`,
      binIds: seedData.bins.map((b) => b.id),
      selectedClipIds: firstBin ? firstBin.assetIds.slice(0, 3) as string[] : [],
      playheadTime: 0,
      transcriptContext: transcriptText,
    };
  }

  /**
   * Derive the overall workflow status from the executed plan.
   */
  private deriveStatus(
    plan: AgentPlan,
    stepsCompleted: number,
  ): WorkflowResult['status'] {
    if (plan.status === 'completed') return 'completed';
    if (plan.status === 'failed' && stepsCompleted > 0) return 'partial';
    return 'failed';
  }

  /**
   * Safely parse a JSON result string, returning the raw string on failure.
   */
  private safeParseResult(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
