/**
 * @module ToolCallRouter
 * @description Routes tool calls to the appropriate adapter handler.
 *
 * Adapters are registered by name (e.g. `media-composer`, `local-ai`) and
 * the router dispatches incoming tool calls to the adapter that owns the
 * target tool. Default mock handlers are pre-registered for all 24 editing
 * tools so the orchestrator works out-of-the-box without live adapters.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ToolCallResult } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A handler function capable of executing one or more tools.
 *
 * @param toolName - Name of the tool to invoke.
 * @param args     - Arguments to pass to the tool.
 * @returns The result of the tool invocation.
 */
export type ToolHandler = (
  toolName: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Tool -> adapter mapping
// ---------------------------------------------------------------------------

/** Maps each tool name to the adapter responsible for executing it. */
const TOOL_ADAPTER_MAP: Record<string, string> = {
  // Timeline editing — media-composer adapter
  splice_in: 'media-composer',
  overwrite: 'media-composer',
  lift: 'media-composer',
  extract: 'media-composer',
  ripple_trim: 'media-composer',
  split_clip: 'media-composer',
  set_clip_speed: 'media-composer',
  add_marker: 'media-composer',

  // Media management — content-core adapter
  move_clip_to_bin: 'content-core',
  set_clip_metadata: 'content-core',
  create_bin: 'content-core',
  auto_organize_bins: 'content-core',
  find_similar_clips: 'content-core',

  // Colour & grading — media-composer adapter
  apply_color_grade: 'media-composer',
  auto_color_match: 'media-composer',

  // Audio — pro-tools adapter
  adjust_audio_level: 'pro-tools',
  analyze_audio: 'pro-tools',
  remove_silence: 'pro-tools',
  normalize_audio: 'pro-tools',

  // AI analysis — local-ai adapter
  suggest_cuts: 'local-ai',
  detect_scene_changes: 'local-ai',
  generate_captions: 'local-ai',
  generate_rough_cut: 'local-ai',
  auto_reframe: 'local-ai',
};

// ---------------------------------------------------------------------------
// ToolCallRouter
// ---------------------------------------------------------------------------

/**
 * Dispatches tool calls to registered adapter handlers.
 *
 * On construction, mock handlers are registered for every known tool so
 * the orchestrator can operate without live back-end services.
 */
export class ToolCallRouter {
  /** Registered adapter handlers keyed by adapter name. */
  private adapters: Map<string, ToolHandler> = new Map();

  constructor() {
    this.registerDefaultMocks();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register an adapter handler.
   *
   * @param name    - Adapter identifier (e.g. `media-composer`).
   * @param handler - Function that executes tool calls for this adapter.
   */
  registerAdapter(name: string, handler: ToolHandler): void {
    if (!name || typeof name !== 'string') {
      throw new Error('Adapter name must be a non-empty string.');
    }
    if (typeof handler !== 'function') {
      throw new Error('Adapter handler must be a function.');
    }
    this.adapters.set(name, handler);
  }

  /**
   * Route a tool call to the appropriate adapter and return the result.
   *
   * @param toolName - Name of the tool to invoke.
   * @param args     - Arguments to pass to the tool.
   * @returns A structured {@link ToolCallResult}.
   */
  async route(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const traceId = uuidv4();
    const start = Date.now();

    const adapterName = TOOL_ADAPTER_MAP[toolName];
    if (!adapterName) {
      return {
        traceId,
        toolName,
        success: false,
        error: `No adapter mapping found for tool "${toolName}".`,
        durationMs: Date.now() - start,
        tokensConsumed: 0,
      };
    }

    const handler = this.adapters.get(adapterName);
    if (!handler) {
      return {
        traceId,
        toolName,
        success: false,
        error: `Adapter "${adapterName}" is not registered.`,
        durationMs: Date.now() - start,
        tokensConsumed: 0,
      };
    }

    try {
      // Execute with a 60-second timeout to prevent indefinite hangs
      const timeoutMs = 60_000;
      const result = await Promise.race([
        handler(toolName, args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      const durationMs = Date.now() - start;

      return {
        traceId,
        toolName,
        success: true,
        result,
        durationMs,
        tokensConsumed: this.estimateTokens(args, result),
      };
    } catch (error) {
      const durationMs = Date.now() - start;

      return {
        traceId,
        toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs,
        tokensConsumed: this.estimateTokens(args, null),
      };
    }
  }

  /**
   * Get the names of all tools that have a registered adapter.
   *
   * @returns Sorted array of tool names.
   */
  getRegisteredTools(): string[] {
    return Object.keys(TOOL_ADAPTER_MAP)
      .filter((tool) => {
        const adapter = TOOL_ADAPTER_MAP[tool];
        return adapter !== undefined && this.adapters.has(adapter);
      })
      .sort();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Register default mock handlers for all adapter categories.
   * These simulate successful tool execution with minimal latency.
   */
  private registerDefaultMocks(): void {
    const mockHandler: ToolHandler = async (toolName, args) => {
      // Simulate processing latency (20-80ms)
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60));

      return {
        tool: toolName,
        status: 'mock-success',
        args,
        message: `[mock] ${toolName} executed successfully with ${Object.keys(args).length} argument(s).`,
        timestamp: new Date().toISOString(),
      };
    };

    // Register mocks for each adapter category
    const adapterNames = new Set(Object.values(TOOL_ADAPTER_MAP));
    for (const name of adapterNames) {
      this.adapters.set(name, mockHandler);
    }
  }

  /**
   * Rough token consumption estimate based on argument and result size.
   *
   * @param args   - Tool call arguments.
   * @param result - Tool call result.
   * @returns Estimated tokens consumed.
   */
  private estimateTokens(args: Record<string, unknown>, result: unknown): number {
    const argTokens = Math.ceil(JSON.stringify(args).length / 4);
    const resultTokens = result ? Math.ceil(JSON.stringify(result).length / 4) : 0;
    return argTokens + resultTokens;
  }
}
