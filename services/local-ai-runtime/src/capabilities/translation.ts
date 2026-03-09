/**
 * @module capabilities/translation
 *
 * Translation pipeline.  Translates text between language pairs using the
 * best registered translation model.
 */

import type { ModelRegistry } from '../ModelRegistry';
import type { IModelBackend, ModelResult } from '../ModelRunner';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result returned by {@link translate}. */
export interface TranslationResult {
  /** The translated text. */
  readonly translatedText: string;
  /** ID of the model that performed the translation. */
  readonly modelId: string;
}

/** Options for {@link translate}. */
export interface TranslationOptions {
  /** Explicit model ID to use (bypasses registry selection). */
  readonly modelId?: string;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Translate text from one language to another.
 *
 * @param text           - Source text to translate.
 * @param sourceLanguage - BCP-47 source language tag (e.g. "en").
 * @param targetLanguage - BCP-47 target language tag (e.g. "fr").
 * @param registry       - The model registry for model resolution.
 * @param backend        - The backend instance that will execute the request.
 * @param options        - Optional overrides.
 * @returns Translated text and model metadata.
 * @throws if no translation model is registered or the backend fails.
 */
export async function translate(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  registry: ModelRegistry,
  backend: IModelBackend,
  options?: TranslationOptions,
): Promise<TranslationResult> {
  const modelId = options?.modelId ?? resolveModelId(registry, sourceLanguage);

  const result: ModelResult = await backend.execute({
    modelId,
    capability: 'translation',
    input: {
      text,
      sourceLanguage,
      targetLanguage,
    },
  });

  return {
    translatedText: result.output.translatedText ?? '',
    modelId: result.modelId,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModelId(registry: ModelRegistry, language: string): string {
  const best = registry.findBest('translation', { language });
  if (!best) {
    throw new Error('No translation model registered in the ModelRegistry.');
  }
  return best.id;
}
