/**
 * @module ModelRegistry
 *
 * In-memory registry of available AI models.  Models are registered at
 * startup (see {@link seedRegistry}) and can be queried by capability,
 * language, or hardware preference so the capability pipelines never
 * hard-code model identifiers.
 */

import type {
  ModelCapability,
  QuantizationLevel,
  HardwarePreference,
} from './ModelRunner';

// ---------------------------------------------------------------------------
// Registry entry
// ---------------------------------------------------------------------------

/** Model loading state for lifecycle tracking. */
export type ModelLoadState = 'unloaded' | 'loading' | 'loaded' | 'unloading' | 'error';

/** Metadata describing a single registered model. */
export interface ModelRegistryEntry {
  /** Unique identifier (e.g. "whisper-large-v3"). */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Capabilities this model provides. */
  readonly capabilities: readonly ModelCapability[];
  /** BCP-47 language codes the model supports ("*" = multilingual). */
  readonly languages: readonly string[];
  /** Backend that should execute this model (e.g. "onnxruntime", "llama.cpp"). */
  readonly backend: string;
  /** Quantization level of the stored weights. */
  readonly quantization: QuantizationLevel;
  /** Preferred hardware for execution. */
  readonly hardware: HardwarePreference;
  /** On-disk size of the model weights in bytes. */
  readonly sizeBytes: number;
  /** Embedding dimensionality (only meaningful for embedding models). */
  readonly dimensions?: number;
  /** Short human-readable description. */
  readonly description: string;
  /** Semantic version of the model. */
  readonly version: string;
  /** SPDX license identifier. */
  readonly license: string;
}

/** Runtime state tracked for each model. */
interface ModelRuntimeState {
  /** Current loading state. */
  loadState: ModelLoadState;
  /** Number of times this model has been invoked. */
  invokeCount: number;
  /** Timestamp of the last invocation (ms since epoch). */
  lastInvokedAt: number;
  /** Timestamp when the model was loaded (ms since epoch). */
  loadedAt: number;
  /** Cumulative inference time in milliseconds. */
  totalInferenceMs: number;
}

// ---------------------------------------------------------------------------
// Quantization quality ranking (lower index = higher quality)
// ---------------------------------------------------------------------------

const QUANT_QUALITY: readonly QuantizationLevel[] = [
  'fp32',
  'fp16',
  'int8',
  'q5_k_m',
  'q4_k_m',
  'int4',
];

// ---------------------------------------------------------------------------
// ModelRegistry
// ---------------------------------------------------------------------------

/**
 * Central registry of AI models known to the local runtime.
 *
 * Models are registered at startup via {@link register} and looked up by the
 * capability pipelines through {@link findByCapability} or {@link findBest}.
 */
export class ModelRegistry {
  /** Internal map keyed by model ID. */
  private readonly models = new Map<string, ModelRegistryEntry>();

  /** Runtime state keyed by model ID. */
  private readonly runtimeState = new Map<string, ModelRuntimeState>();

  // -----------------------------------------------------------------------
  // Mutation
  // -----------------------------------------------------------------------

  /**
   * Register a model entry.
   *
   * @throws {Error} if a model with the same `id` is already registered.
   */
  register(entry: ModelRegistryEntry): void {
    if (this.models.has(entry.id)) {
      throw new Error(`Model "${entry.id}" is already registered`);
    }
    this.models.set(entry.id, entry);
    this.runtimeState.set(entry.id, {
      loadState: 'unloaded',
      invokeCount: 0,
      lastInvokedAt: 0,
      loadedAt: 0,
      totalInferenceMs: 0,
    });
  }

  /**
   * Remove a model from the registry.
   *
   * @returns `true` if the model was found and removed.
   */
  unregister(modelId: string): boolean {
    this.runtimeState.delete(modelId);
    return this.models.delete(modelId);
  }

  // -----------------------------------------------------------------------
  // Lookup
  // -----------------------------------------------------------------------

  /** Retrieve a single model entry by ID, or `undefined` if not found. */
  getModel(modelId: string): ModelRegistryEntry | undefined {
    return this.models.get(modelId);
  }

  /** Return every model that advertises the given capability. */
  findByCapability(capability: ModelCapability): ModelRegistryEntry[] {
    return [...this.models.values()].filter((m) =>
      m.capabilities.includes(capability),
    );
  }

  /**
   * Return every model that lists the given BCP-47 language code
   * **or** the wildcard `"*"` (multilingual).
   */
  findByLanguage(language: string): ModelRegistryEntry[] {
    const lang = language.toLowerCase();
    return [...this.models.values()].filter(
      (m) =>
        m.languages.some((l) => l.toLowerCase() === lang) ||
        m.languages.includes('*'),
    );
  }

  /**
   * Heuristic "best model" selection.
   *
   * 1. Filter to models that support the requested capability.
   * 2. If a language is specified, prefer models that list that language.
   * 3. If a hardware preference is specified, prefer models targeting it.
   * 4. Rank remaining candidates by quantization quality (higher is better).
   */
  findBest(
    capability: ModelCapability,
    options?: { language?: string; hardware?: HardwarePreference },
  ): ModelRegistryEntry | undefined {
    let candidates = this.findByCapability(capability);
    if (candidates.length === 0) return undefined;

    // Prefer models that support the requested language
    if (options?.language) {
      const lang = options.language.toLowerCase();
      const langMatches = candidates.filter(
        (m) =>
          m.languages.some((l) => l.toLowerCase() === lang) ||
          m.languages.includes('*'),
      );
      if (langMatches.length > 0) {
        candidates = langMatches;
      }
    }

    // Prefer models targeting the requested hardware
    if (options?.hardware && options.hardware !== 'auto') {
      const hwMatches = candidates.filter(
        (m) => m.hardware === options.hardware,
      );
      if (hwMatches.length > 0) {
        candidates = hwMatches;
      }
    }

    // Sort by quantization quality (higher quality first)
    candidates.sort((a, b) => {
      const aIdx = QUANT_QUALITY.indexOf(a.quantization);
      const bIdx = QUANT_QUALITY.indexOf(b.quantization);
      return aIdx - bIdx;
    });

    return candidates[0];
  }

  /** Return a snapshot of all registered models. */
  listAll(): ModelRegistryEntry[] {
    return [...this.models.values()];
  }

  // -----------------------------------------------------------------------
  // Lifecycle tracking
  // -----------------------------------------------------------------------

  /**
   * Update the load state of a model.
   *
   * @param modelId - The model identifier.
   * @param state   - The new load state.
   */
  setLoadState(modelId: string, state: ModelLoadState): void {
    const runtime = this.runtimeState.get(modelId);
    if (!runtime) return;

    runtime.loadState = state;
    if (state === 'loaded') {
      runtime.loadedAt = Date.now();
    }
  }

  /**
   * Record a model invocation for usage tracking.
   *
   * @param modelId   - The model identifier.
   * @param durationMs - Wall-clock inference duration in milliseconds.
   */
  recordInvocation(modelId: string, durationMs: number): void {
    const runtime = this.runtimeState.get(modelId);
    if (!runtime) return;

    runtime.invokeCount++;
    runtime.lastInvokedAt = Date.now();
    runtime.totalInferenceMs += durationMs;
  }

  /**
   * Get the load state of a model.
   *
   * @param modelId - The model identifier.
   * @returns The load state, or `undefined` if the model is not registered.
   */
  getLoadState(modelId: string): ModelLoadState | undefined {
    return this.runtimeState.get(modelId)?.loadState;
  }

  /**
   * Find models that have been idle (not invoked) for longer than the
   * given threshold. Useful for implementing model cool-down / eviction.
   *
   * @param idleThresholdMs - Maximum idle time in milliseconds.
   * @returns Array of model IDs that exceed the idle threshold.
   */
  findIdleModels(idleThresholdMs: number): string[] {
    const now = Date.now();
    const idle: string[] = [];

    for (const [modelId, state] of this.runtimeState) {
      if (
        state.loadState === 'loaded' &&
        state.lastInvokedAt > 0 &&
        now - state.lastInvokedAt > idleThresholdMs
      ) {
        idle.push(modelId);
      }
    }

    return idle;
  }

  /**
   * Get usage statistics for a model.
   *
   * @param modelId - The model identifier.
   * @returns Usage statistics, or `undefined` if the model is not registered.
   */
  getModelStats(modelId: string): {
    loadState: ModelLoadState;
    invokeCount: number;
    lastInvokedAt: number;
    totalInferenceMs: number;
    avgInferenceMs: number;
  } | undefined {
    const state = this.runtimeState.get(modelId);
    if (!state) return undefined;

    return {
      loadState: state.loadState,
      invokeCount: state.invokeCount,
      lastInvokedAt: state.lastInvokedAt,
      totalInferenceMs: state.totalInferenceMs,
      avgInferenceMs: state.invokeCount > 0
        ? Math.round(state.totalInferenceMs / state.invokeCount)
        : 0,
    };
  }

  /**
   * Get the total estimated memory footprint of all loaded models.
   *
   * @returns Total size in bytes of models currently in the `loaded` state.
   */
  getLoadedMemoryEstimate(): number {
    let total = 0;
    for (const [modelId, state] of this.runtimeState) {
      if (state.loadState === 'loaded') {
        const entry = this.models.get(modelId);
        if (entry) {
          total += entry.sizeBytes;
        }
      }
    }
    return total;
  }
}
