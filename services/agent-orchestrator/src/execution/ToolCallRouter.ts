/**
 * @module ToolCallRouter
 * @description Routes tool calls to the appropriate adapter handler.
 *
 * Adapters are registered by name (e.g. `media-composer`, `local-ai`) and
 * the router dispatches incoming tool calls to the adapter that owns the
 * target tool. Default mock handlers are pre-registered for all 24 editing
 * tools so the orchestrator works out-of-the-box without live adapters.
 *
 * ## Resilience Features
 *
 * - **Retry with exponential backoff** -- Transient failures are retried up
 *   to a configurable maximum with jittered exponential delays.
 * - **Circuit breaker** -- Each adapter has its own circuit breaker that
 *   trips after consecutive failures, preventing cascading overload.
 * - **Timeout** -- Every tool call is bounded by a configurable timeout.
 * - **Token consumption tracking** -- Accurate per-call and aggregate
 *   token metering with category breakdowns.
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
// Retry Policy
// ---------------------------------------------------------------------------

/** Configuration for retry behaviour with exponential backoff. */
interface RetryPolicy {
  /** Maximum number of retry attempts (0 = no retries). */
  readonly maxRetries: number;
  /** Base delay in milliseconds before the first retry. */
  readonly baseDelayMs: number;
  /** Maximum delay cap in milliseconds. */
  readonly maxDelayMs: number;
  /** Jitter factor in [0, 1] added to each delay. */
  readonly jitterFactor: number;
}

/** Default retry policy for adapter calls. */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5_000,
  jitterFactor: 0.3,
};

/**
 * Calculate the delay for a given retry attempt using exponential backoff
 * with jitter.
 */
function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
  // Exponential: baseDelay * 2^attempt
  const exponential = policy.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exponential, policy.maxDelayMs);
  // Add jitter: delay * (1 + random * jitterFactor)
  const jitter = capped * policy.jitterFactor * Math.random();
  return capped + jitter;
}

/** Errors that are considered transient and eligible for retry. */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('503') ||
    msg.includes('429')
  );
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

/** States a circuit breaker can be in. */
type CircuitState = 'closed' | 'open' | 'half-open';

/** Per-adapter circuit breaker state. */
interface CircuitBreaker {
  /** Current state of the circuit. */
  state: CircuitState;
  /** Number of consecutive failures while closed. */
  failureCount: number;
  /** Timestamp (ms) when the circuit was opened. */
  openedAt: number;
  /** Number of successes needed in half-open to close. */
  halfOpenSuccesses: number;
  /** Consecutive failures threshold before opening the circuit. */
  readonly failureThreshold: number;
  /** Duration in ms to keep the circuit open before transitioning to half-open. */
  readonly resetTimeoutMs: number;
  /** Number of successes in half-open state required to close the circuit. */
  readonly halfOpenThreshold: number;
}

/** Create a new circuit breaker with default settings. */
function createCircuitBreaker(): CircuitBreaker {
  return {
    state: 'closed',
    failureCount: 0,
    openedAt: 0,
    halfOpenSuccesses: 0,
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenThreshold: 2,
  };
}

/**
 * Check whether a request should be allowed through the circuit breaker.
 * Transitions from open to half-open when the reset timeout has elapsed.
 */
function shouldAllowRequest(breaker: CircuitBreaker): boolean {
  switch (breaker.state) {
    case 'closed':
      return true;
    case 'open': {
      const elapsed = Date.now() - breaker.openedAt;
      if (elapsed >= breaker.resetTimeoutMs) {
        breaker.state = 'half-open';
        breaker.halfOpenSuccesses = 0;
        return true;
      }
      return false;
    }
    case 'half-open':
      return true;
  }
}

/** Record a successful call and potentially close the circuit. */
function recordSuccess(breaker: CircuitBreaker): void {
  switch (breaker.state) {
    case 'closed':
      breaker.failureCount = 0;
      break;
    case 'half-open':
      breaker.halfOpenSuccesses++;
      if (breaker.halfOpenSuccesses >= breaker.halfOpenThreshold) {
        breaker.state = 'closed';
        breaker.failureCount = 0;
      }
      break;
    case 'open':
      // Should not happen, but reset defensively
      break;
  }
}

/** Record a failed call and potentially open the circuit. */
function recordFailure(breaker: CircuitBreaker): void {
  switch (breaker.state) {
    case 'closed':
      breaker.failureCount++;
      if (breaker.failureCount >= breaker.failureThreshold) {
        breaker.state = 'open';
        breaker.openedAt = Date.now();
      }
      break;
    case 'half-open':
      // A failure in half-open immediately re-opens
      breaker.state = 'open';
      breaker.openedAt = Date.now();
      breaker.failureCount = breaker.failureThreshold;
      break;
    case 'open':
      // Already open
      break;
  }
}

// ---------------------------------------------------------------------------
// Token Consumption Tracker
// ---------------------------------------------------------------------------

/** Aggregate token consumption statistics. */
interface TokenConsumptionStats {
  /** Total tokens consumed across all calls. */
  totalTokens: number;
  /** Tokens broken down by adapter name. */
  byAdapter: Map<string, number>;
  /** Tokens broken down by tool name. */
  byTool: Map<string, number>;
  /** Total number of calls tracked. */
  totalCalls: number;
}

// ---------------------------------------------------------------------------
// Tool -> adapter mapping
// ---------------------------------------------------------------------------

/** Maps each tool name to the adapter responsible for executing it. */
const TOOL_ADAPTER_MAP: Record<string, string> = {
  // Timeline editing -- media-composer adapter
  splice_in: 'media-composer',
  overwrite: 'media-composer',
  lift: 'media-composer',
  extract: 'media-composer',
  ripple_trim: 'media-composer',
  split_clip: 'media-composer',
  set_clip_speed: 'media-composer',
  add_marker: 'media-composer',

  // Media management -- content-core adapter
  move_clip_to_bin: 'content-core',
  set_clip_metadata: 'content-core',
  create_bin: 'content-core',
  auto_organize_bins: 'content-core',
  find_similar_clips: 'content-core',

  // Colour & grading -- media-composer adapter
  apply_color_grade: 'media-composer',
  auto_color_match: 'media-composer',

  // Audio -- pro-tools adapter
  adjust_audio_level: 'pro-tools',
  analyze_audio: 'pro-tools',
  remove_silence: 'pro-tools',
  normalize_audio: 'pro-tools',

  // AI analysis -- local-ai adapter
  suggest_cuts: 'local-ai',
  detect_scene_changes: 'local-ai',
  generate_captions: 'local-ai',
  generate_rough_cut: 'local-ai',
  auto_reframe: 'local-ai',
};

/** Tools that should never be retried because they are destructive. */
const NON_RETRYABLE_TOOLS: ReadonlySet<string> = new Set([
  'extract',
  'lift',
  'split_clip',
  'overwrite',
  'ripple_trim',
  'remove_silence',
]);

// ---------------------------------------------------------------------------
// ToolCallRouter
// ---------------------------------------------------------------------------

/**
 * Dispatches tool calls to registered adapter handlers with resilience
 * features including retry with exponential backoff, circuit breakers,
 * timeouts, and token consumption tracking.
 *
 * On construction, mock handlers are registered for every known tool so
 * the orchestrator can operate without live back-end services.
 */
export class ToolCallRouter {
  /** Registered adapter handlers keyed by adapter name. */
  private adapters: Map<string, ToolHandler> = new Map();

  /** Per-adapter circuit breakers. */
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  /** Retry policy for transient errors. */
  private readonly retryPolicy: RetryPolicy;

  /** Default timeout for tool calls in milliseconds. */
  private readonly timeoutMs: number;

  /** Aggregate token consumption statistics. */
  private readonly consumptionStats: TokenConsumptionStats = {
    totalTokens: 0,
    byAdapter: new Map(),
    byTool: new Map(),
    totalCalls: 0,
  };

  constructor(options?: { retryPolicy?: Partial<RetryPolicy>; timeoutMs?: number }) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...options?.retryPolicy };
    this.timeoutMs = options?.timeoutMs ?? 60_000;
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
    // Initialise a circuit breaker for the new adapter
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, createCircuitBreaker());
    }
  }

  /**
   * Route a tool call to the appropriate adapter and return the result.
   *
   * The call passes through the circuit breaker for the target adapter.
   * Transient failures are retried with exponential backoff (unless the
   * tool is destructive). Token consumption is tracked per call.
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

    // Circuit breaker check
    const breaker = this.getOrCreateBreaker(adapterName);
    if (!shouldAllowRequest(breaker)) {
      return {
        traceId,
        toolName,
        success: false,
        error: `Circuit breaker open for adapter "${adapterName}". Too many consecutive failures; requests are temporarily blocked.`,
        durationMs: Date.now() - start,
        tokensConsumed: 0,
      };
    }

    // Determine if retries are allowed for this tool
    const allowRetries = !NON_RETRYABLE_TOOLS.has(toolName);
    const maxAttempts = allowRetries ? this.retryPolicy.maxRetries + 1 : 1;
    let lastError: string | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Wait before retry (skip delay on first attempt)
      if (attempt > 0) {
        const delay = computeRetryDelay(attempt - 1, this.retryPolicy);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }

      try {
        const result = await this.executeWithTimeout(handler, toolName, args);
        const durationMs = Date.now() - start;

        // Record success with circuit breaker
        recordSuccess(breaker);

        const tokensConsumed = this.estimateTokens(toolName, args, result);
        this.trackConsumption(toolName, adapterName, tokensConsumed);

        return {
          traceId,
          toolName,
          success: true,
          result,
          durationMs,
          tokensConsumed,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // Only retry transient errors
        if (!isTransientError(error) || attempt >= maxAttempts - 1) {
          recordFailure(breaker);
          const durationMs = Date.now() - start;
          const tokensConsumed = this.estimateTokens(toolName, args, null);
          this.trackConsumption(toolName, adapterName, tokensConsumed);

          return {
            traceId,
            toolName,
            success: false,
            error: attempt > 0
              ? `${lastError} (after ${attempt + 1} attempt(s))`
              : lastError,
            durationMs,
            tokensConsumed,
          };
        }
        // Transient error -- loop will retry
      }
    }

    // Should not reach here, but handle defensively
    recordFailure(breaker);
    return {
      traceId,
      toolName,
      success: false,
      error: lastError ?? 'Unknown error after retries.',
      durationMs: Date.now() - start,
      tokensConsumed: 0,
    };
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

  /**
   * Get the current circuit breaker state for an adapter.
   *
   * @param adapterName - The adapter to query.
   * @returns The circuit state, or `undefined` if the adapter is unknown.
   */
  getCircuitState(adapterName: string): CircuitState | undefined {
    return this.circuitBreakers.get(adapterName)?.state;
  }

  /**
   * Manually reset the circuit breaker for an adapter.
   *
   * @param adapterName - The adapter whose circuit to reset.
   */
  resetCircuit(adapterName: string): void {
    const breaker = this.circuitBreakers.get(adapterName);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.halfOpenSuccesses = 0;
    }
  }

  /**
   * Get aggregate token consumption statistics.
   *
   * @returns A snapshot of total and per-category token usage.
   */
  getConsumptionStats(): {
    totalTokens: number;
    totalCalls: number;
    byAdapter: Record<string, number>;
    byTool: Record<string, number>;
  } {
    const byAdapter: Record<string, number> = {};
    for (const [key, value] of this.consumptionStats.byAdapter) {
      byAdapter[key] = value;
    }
    const byTool: Record<string, number> = {};
    for (const [key, value] of this.consumptionStats.byTool) {
      byTool[key] = value;
    }
    return {
      totalTokens: this.consumptionStats.totalTokens,
      totalCalls: this.consumptionStats.totalCalls,
      byAdapter,
      byTool,
    };
  }

  /**
   * Reset token consumption statistics.
   */
  resetConsumptionStats(): void {
    this.consumptionStats.totalTokens = 0;
    this.consumptionStats.totalCalls = 0;
    this.consumptionStats.byAdapter.clear();
    this.consumptionStats.byTool.clear();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Execute a tool call through the handler with a timeout guard.
   */
  private async executeWithTimeout(
    handler: ToolHandler,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Tool "${toolName}" timed out after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
    });

    try {
      const result = await Promise.race([handler(toolName, args), timeoutPromise]);
      return result;
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Get or create a circuit breaker for the given adapter.
   */
  private getOrCreateBreaker(adapterName: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(adapterName);
    if (!breaker) {
      breaker = createCircuitBreaker();
      this.circuitBreakers.set(adapterName, breaker);
    }
    return breaker;
  }

  /**
   * Track token consumption for aggregate reporting.
   */
  private trackConsumption(toolName: string, adapterName: string, tokens: number): void {
    this.consumptionStats.totalTokens += tokens;
    this.consumptionStats.totalCalls++;

    const adapterTotal = this.consumptionStats.byAdapter.get(adapterName) ?? 0;
    this.consumptionStats.byAdapter.set(adapterName, adapterTotal + tokens);

    const toolTotal = this.consumptionStats.byTool.get(toolName) ?? 0;
    this.consumptionStats.byTool.set(toolName, toolTotal + tokens);
  }

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
      this.circuitBreakers.set(name, createCircuitBreaker());
    }
  }

  /**
   * Token consumption estimate using a per-tool cost model combined with
   * argument/result size heuristics.
   *
   * @param toolName - The tool that was called.
   * @param args     - Tool call arguments.
   * @param result   - Tool call result (null on failure).
   * @returns Estimated tokens consumed.
   */
  private estimateTokens(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
  ): number {
    // Base cost per tool category
    const baseCosts: Record<string, number> = {
      // AI-heavy tools cost more
      suggest_cuts: 15,
      detect_scene_changes: 12,
      generate_captions: 20,
      generate_rough_cut: 25,
      auto_reframe: 15,
      find_similar_clips: 15,
      // Audio processing
      analyze_audio: 10,
      normalize_audio: 8,
      remove_silence: 12,
      // Standard editing tools
      splice_in: 8,
      overwrite: 10,
      extract: 8,
      lift: 6,
      ripple_trim: 8,
      split_clip: 6,
      // Light tools
      add_marker: 4,
      set_clip_speed: 5,
      move_clip_to_bin: 5,
      set_clip_metadata: 6,
      create_bin: 4,
      auto_organize_bins: 12,
      apply_color_grade: 10,
      auto_color_match: 12,
      adjust_audio_level: 5,
    };

    const baseCost = baseCosts[toolName] ?? 8;

    // Variable cost based on argument + result payload size
    const argSize = JSON.stringify(args).length;
    const resultSize = result ? JSON.stringify(result).length : 0;
    const payloadTokens = Math.ceil((argSize + resultSize) / 4);

    // Total is base cost + a fraction of the payload size (capped)
    return baseCost + Math.min(payloadTokens, 100);
  }
}
