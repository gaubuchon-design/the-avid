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
  /**
   * Maximum number of texts to embed per backend call. Large input arrays
   * are automatically chunked into batches of this size.
   *
   * @default 256
   */
  readonly batchSize?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default number of texts per backend call. */
const DEFAULT_BATCH_SIZE = 256;

/** Maximum single-text length we accept (characters). */
const MAX_TEXT_LENGTH = 100_000;

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Generate embedding vectors for one or more texts.
 *
 * When `texts` exceeds the batch size the input is automatically chunked and
 * the results are concatenated in order. This prevents a single huge request
 * from exceeding backend memory or token limits.
 *
 * @param texts    - Array of strings to embed.
 * @param registry - The model registry to resolve the model from.
 * @param backend  - The backend instance that will execute the request.
 * @param options  - Optional overrides (e.g. a specific model ID or batch size).
 * @returns Normalised embedding vectors together with model metadata.
 * @throws if no embedding model is registered, input is invalid, or the backend fails.
 */
export async function generateEmbeddings(
  texts: string[],
  registry: ModelRegistry,
  backend: IModelBackend,
  options?: EmbeddingOptions,
): Promise<EmbeddingResult> {
  // ---- Input validation ---------------------------------------------------
  if (texts.length === 0) {
    throw new Error('At least one text string is required for embedding.');
  }

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]!;
    if (typeof t !== 'string') {
      throw new Error(`texts[${i}] is not a string.`);
    }
    if (t.length > MAX_TEXT_LENGTH) {
      throw new Error(
        `texts[${i}] exceeds the maximum length of ${MAX_TEXT_LENGTH} characters.`,
      );
    }
  }

  // ---- Resolve model ------------------------------------------------------
  const modelId = options?.modelId ?? resolveModelId(registry);
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  // ---- Single batch fast-path ---------------------------------------------
  if (texts.length <= batchSize) {
    return executeBatch(texts, modelId, backend);
  }

  // ---- Multi-batch --------------------------------------------------------
  const allEmbeddings: number[][] = [];
  let finalDimensions = 0;

  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const chunk = texts.slice(offset, offset + batchSize);
    const batchResult = await executeBatch(chunk, modelId, backend);

    allEmbeddings.push(...batchResult.embeddings);
    if (batchResult.dimensions > 0) {
      finalDimensions = batchResult.dimensions;
    }
  }

  return {
    embeddings: allEmbeddings,
    modelId,
    dimensions: finalDimensions,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Execute a single batch against the backend and return an EmbeddingResult. */
async function executeBatch(
  texts: string[],
  modelId: string,
  backend: IModelBackend,
): Promise<EmbeddingResult> {
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
