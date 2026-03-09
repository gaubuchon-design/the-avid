/**
 * @module PlanGenerator
 * @description Gemini-based plan generation with function calling.
 *
 * When a Gemini API key is configured the generator sends the user intent,
 * editing context, and tool definitions to the Gemini API and parses the
 * returned function calls into an ordered execution plan.
 *
 * When no API key is available the generator falls back to local template
 * matching (see {@link PromptTemplates}) so the service still works for
 * demos and offline development.
 */

import { v4 as uuidv4 } from 'uuid';
import type { AgentContext, AgentPlan, AgentStep, ApprovalPolicy, ToolDefinition } from '../types';
import { ContextAssembler } from './ContextAssembler';
import { SYSTEM_PROMPT, matchTemplate } from './PromptTemplates';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_STEPS = 10;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for constructing a {@link PlanGenerator}. */
export interface PlanGeneratorOptions {
  /** Gemini API key. When empty, template matching is used. */
  apiKey?: string;
  /** Gemini model to use (default: gemini-2.0-flash). */
  model?: string;
}

// ---------------------------------------------------------------------------
// PlanGenerator
// ---------------------------------------------------------------------------

/**
 * Generates execution plans from natural-language user intents.
 *
 * The generator first attempts to call Gemini with function declarations
 * derived from the registered tool definitions. If no API key is set, or the
 * call fails, it falls back to deterministic template matching.
 */
export class PlanGenerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly contextAssembler: ContextAssembler;

  /**
   * @param options - Generator configuration.
   */
  constructor(options: PlanGeneratorOptions = {}) {
    this.apiKey = options.apiKey ?? process.env['GEMINI_API_KEY'] ?? '';
    this.model = options.model ?? DEFAULT_MODEL;
    this.contextAssembler = new ContextAssembler();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate an execution plan from a user intent.
   *
   * @param intent  - Raw natural-language intent string.
   * @param context - Current editing context snapshot.
   * @param tools   - Registered tool definitions.
   * @returns A plan in `preview` status ready for user approval.
   */
  async generatePlan(
    intent: string,
    context: AgentContext,
    tools: ToolDefinition[],
  ): Promise<AgentPlan> {
    const planId = uuidv4();
    const now = new Date().toISOString();

    // Default approval policy — overridden by the orchestrator service
    const approvalPolicy: ApprovalPolicy = {
      mode: 'manual',
      allowedAutoTools: [],
      requireApprovalFor: [],
      maxAutoTokens: 100,
    };

    // Attempt Gemini-powered generation first
    if (this.apiKey) {
      try {
        const steps = await this.generateViaGemini(planId, intent, context, tools);
        const estimatedTokens = this.contextAssembler.estimateTokens(intent) + steps.length * 15;

        return {
          id: planId,
          intent,
          steps,
          status: 'preview',
          tokensEstimated: estimatedTokens,
          tokensUsed: estimatedTokens,
          createdAt: now,
          updatedAt: now,
          approvalPolicy,
        };
      } catch (error) {
        console.warn(
          '[PlanGenerator] Gemini API call failed, falling back to templates:',
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Fallback: template matching
    const steps = this.generateFromTemplate(planId, intent);
    const estimatedTokens = steps.reduce((sum, _s, _i) => sum + 10, 0) + 5;

    return {
      id: planId,
      intent,
      steps,
      status: 'preview',
      tokensEstimated: estimatedTokens,
      tokensUsed: 0,
      createdAt: now,
      updatedAt: now,
      approvalPolicy,
    };
  }

  // -----------------------------------------------------------------------
  // Gemini generation
  // -----------------------------------------------------------------------

  /**
   * Call the Gemini API with function declarations and parse the function
   * calls from the response into plan steps.
   */
  private async generateViaGemini(
    planId: string,
    intent: string,
    context: AgentContext,
    tools: ToolDefinition[],
  ): Promise<AgentStep[]> {
    const contextText = this.contextAssembler.assemble(context);
    const userMessage = `Context:\n${contextText}\n\nUser intent: ${intent}`;

    // Build Gemini function declarations from tool definitions
    const functionDeclarations = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([name, param]) => [
            name,
            {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
            },
          ]),
        ),
        required: Object.entries(tool.parameters)
          .filter(([, param]) => param.required)
          .map(([name]) => name),
      },
    }));

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      tools: [{ functionDeclarations }],
    };

    const url = `${GEMINI_API_BASE}/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(
        `Gemini API error ${response.status}: ${errorBody.error?.message ?? 'Unknown'}`,
      );
    }

    const data = await response.json();
    return this.parseFunctionCalls(planId, data);
  }

  /**
   * Extract function calls from a Gemini API response and convert them
   * into {@link AgentStep} objects.
   */
  private parseFunctionCalls(planId: string, data: Record<string, unknown>): AgentStep[] {
    const candidates = (data as any).candidates;
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return [];
    }

    const parts: any[] = candidates[0]?.content?.parts ?? [];

    const functionCalls = parts
      .filter((part: any) => part.functionCall)
      .map((part: any) => ({
        name: part.functionCall.name as string,
        args: (part.functionCall.args ?? {}) as Record<string, unknown>,
      }));

    // Limit to MAX_STEPS
    const limited = functionCalls.slice(0, MAX_STEPS);

    return limited.map((fc, index) => ({
      id: uuidv4(),
      planId,
      index,
      description: `Execute ${fc.name}`,
      toolName: fc.name,
      toolArgs: fc.args,
      status: 'pending' as const,
    }));
  }

  // -----------------------------------------------------------------------
  // Template fallback
  // -----------------------------------------------------------------------

  /**
   * Generate plan steps from local templates when the Gemini API is
   * unavailable.
   *
   * @param planId - Parent plan identifier.
   * @param intent - Raw user intent.
   * @returns Array of pending steps, or a generic analysis step if no
   *          template matches.
   */
  private generateFromTemplate(planId: string, intent: string): AgentStep[] {
    const template = matchTemplate(intent);

    if (template) {
      return template.steps.map((step, index) => ({
        id: uuidv4(),
        planId,
        index,
        description: step.description,
        toolName: step.toolName,
        toolArgs: { ...step.toolArgs },
        status: 'pending' as const,
      }));
    }

    // Generic fallback: analyse first, then suggest edits
    return [
      {
        id: uuidv4(),
        planId,
        index: 0,
        description: `Analyse request: "${intent}"`,
        toolName: 'detect_scene_changes',
        toolArgs: { clipId: 'c1', sensitivity: 0.5 },
        status: 'pending' as const,
      },
      {
        id: uuidv4(),
        planId,
        index: 1,
        description: 'Suggest optimal edit points based on analysis',
        toolName: 'suggest_cuts',
        toolArgs: { clipId: 'c1', style: 'narrative' },
        status: 'pending' as const,
      },
    ];
  }
}
