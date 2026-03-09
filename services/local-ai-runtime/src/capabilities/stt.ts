/**
 * @module capabilities/stt
 *
 * Speech-to-text pipeline.  Accepts an audio file path, resolves the best
 * STT model from the registry, and returns timestamped transcript segments
 * with word-level detail when available.
 */

import type { ModelRegistry } from '../ModelRegistry';
import type { IModelBackend, ModelResult, TranscriptSegmentOutput } from '../ModelRunner';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result returned by {@link transcribe}. */
export interface TranscribeResult {
  /** Timestamped transcript segments. */
  readonly segments: TranscriptSegmentOutput[];
  /** Detected or specified language (BCP-47). */
  readonly language: string;
  /** ID of the model that produced the transcription. */
  readonly modelId: string;
}

/** Options for {@link transcribe}. */
export interface TranscribeOptions {
  /** BCP-47 language hint (e.g. "en", "fr"). */
  readonly language?: string;
  /** Explicit model ID to use (bypasses registry selection). */
  readonly modelId?: string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio file to timestamped text.
 *
 * @param audioPath - Absolute path to the audio file.
 * @param registry  - The model registry for model resolution.
 * @param backend   - The backend instance that will execute the request.
 * @param options   - Language hint and/or explicit model ID.
 * @returns Transcript segments, detected language, and model metadata.
 * @throws if no STT model is registered or the backend fails.
 */
export async function transcribe(
  audioPath: string,
  registry: ModelRegistry,
  backend: IModelBackend,
  options?: TranscribeOptions,
): Promise<TranscribeResult> {
  const language = options?.language ?? 'en';
  const modelId = options?.modelId ?? resolveModelId(registry, language);

  const result: ModelResult = await backend.execute({
    modelId,
    capability: 'stt',
    input: {
      audioPath,
      sourceLanguage: language,
    },
  });

  const segments = (result.output.transcriptSegments ?? []) as TranscriptSegmentOutput[];

  return {
    segments,
    language,
    modelId: result.modelId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModelId(registry: ModelRegistry, language: string): string {
  const best = registry.findBest('stt', { language });
  if (!best) {
    throw new Error('No STT model registered in the ModelRegistry.');
  }
  return best.id;
}
