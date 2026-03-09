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
  }

  /**
   * Remove a model from the registry.
   *
   * @returns `true` if the model was found and removed.
   */
  unregister(modelId: string): boolean {
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
}
