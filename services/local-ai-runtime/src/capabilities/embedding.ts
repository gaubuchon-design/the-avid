/**
 * @module capabilities/embedding
 *
 * High-level embedding pipeline.  Callers provide texts and optionally a
 * model ID; the pipeline resolves the best available embedding model from
 * the registry, executes through the appropriate backend, and returns
 * normalised embedding vectors.
 */

import type { ModelRegistry } from '../ModelRegistry';
import type { IModelBackend, ModelResult } from '../ModelRunner';

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

/** Result returned by {@link generateEmbeddings}. */
export interface EmbeddingResult {
  /** One embedding vector per input text. */
  readonly embeddings: number[][];
  /** ID of the model that produced the embeddings. */
  readonly modelId: string;
  /** Dimensionality of each vector. */
  readonly dimensions: number;
}

/** Options for {@link generateEmbeddings}. */
export interface EmbeddingOptions {
  /** Explicit model ID to use (bypasses registry selection). */
  readonly modelId?: string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Generate embedding vectors for one or more texts.
 *
 * @param texts    - Array of strings to embed.
 * @param registry - The model registry to resolve the model from.
 * @param backend  - The backend instance that will execute the request.
 * @param options  - Optional overrides (e.g. a specific model ID).
 * @returns Normalised embedding vectors together with model metadata.
 * @throws if no embedding model is registered or the backend fails.
 */
export async function generateEmbeddings(
  texts: string[],
  registry: ModelRegistry,
  backend: IModelBackend,
  options?: EmbeddingOptions,
): Promise<EmbeddingResult> {
  // Resolve model
  const modelId = options?.modelId ?? resolveModelId(registry);

  const result: ModelResult = await backend.execute({
    modelId,
    capability: 'embedding',
    input: { embeddingTexts: texts },
  });

  const embeddings = (result.output.embeddings ?? []) as number[][];
  const dimensions = embeddings.length > 0 ? (embeddings[0]?.length ?? 0) : 0;

  return {
    embeddings,
    modelId: result.modelId,
    dimensions,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModelId(registry: ModelRegistry): string {
  const best = registry.findBest('embedding');
  if (!best) {
    throw new Error('No embedding model registered in the ModelRegistry.');
  }
  return best.id;
}
