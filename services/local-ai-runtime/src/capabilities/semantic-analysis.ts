/**
 * @module capabilities/semantic-analysis
 *
 * Semantic analysis pipelines.  Provides two high-level functions:
 *
 * - {@link analyzeQuery}  — rewrite and decompose a user search query.
 * - {@link analyzeContent} — summarise, tag, and extract sentiment from text.
 */

import type { ModelRegistry } from '../ModelRegistry';
import type { IModelBackend, ModelResult } from '../ModelRunner';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of a query analysis. */
export interface QueryAnalysisResult {
  /** Rewritten / expanded query string. */
  readonly rewrittenQuery: string;
  /** User intents inferred from the query (e.g. "find", "compare"). */
  readonly intents: string[];
  /** Named entities extracted from the query. */
  readonly entities: string[];
  /** Media modalities implied by the query (e.g. "video", "audio"). */
  readonly modalities: string[];
}

/** Result of content analysis. */
export interface ContentAnalysisResult {
  /** Short summary of the text. */
  readonly summary: string;
  /** Keywords / key phrases. */
  readonly keywords: string[];
  /** Sentiment label (positive | negative | neutral | mixed). */
  readonly sentiment: string;
  /** High-level topic labels. */
  readonly topics: string[];
}

/** Options shared by both analysis functions. */
export interface AnalysisOptions {
  /** Explicit model ID (bypasses registry selection). */
  readonly modelId?: string;
}

// ---------------------------------------------------------------------------
// analyzeQuery
// ---------------------------------------------------------------------------

/**
 * Rewrite and decompose a user search query into structured intent data.
 *
 * @param query    - Raw user query string.
 * @param registry - Model registry for model resolution.
 * @param backend  - Backend that will execute the request.
 * @param options  - Optional overrides.
 */
export async function analyzeQuery(
  query: string,
  registry: ModelRegistry,
  backend: IModelBackend,
  options?: AnalysisOptions,
): Promise<QueryAnalysisResult> {
  // Try query-rewrite first, fall back to semantic-analysis
  const modelId =
    options?.modelId ?? resolveModelId(registry, 'query-rewrite', 'semantic-analysis');

  const rewriteResult: ModelResult = await backend.execute({
    modelId,
    capability: 'query-rewrite',
    input: { text: query },
  });

  const analysisResult: ModelResult = await backend.execute({
    modelId: options?.modelId ?? resolveModelId(registry, 'semantic-analysis', 'query-rewrite'),
    capability: 'semantic-analysis',
    input: { text: query },
  });

  const analysis = analysisResult.output.analysisResult ?? {};

  return {
    rewrittenQuery: rewriteResult.output.text ?? query,
    intents: asStringArray(analysis['intents']) ?? inferIntents(query),
    entities: asStringArray(analysis['entities']) ?? inferEntities(query),
    modalities: asStringArray(analysis['modalities']) ?? inferModalities(query),
  };
}

// ---------------------------------------------------------------------------
// analyzeContent
// ---------------------------------------------------------------------------

/**
 * Analyse a block of text to extract summary, keywords, sentiment, and topics.
 *
 * @param text     - Text content to analyse.
 * @param registry - Model registry for model resolution.
 * @param backend  - Backend that will execute the request.
 * @param options  - Optional overrides.
 */
export async function analyzeContent(
  text: string,
  registry: ModelRegistry,
  backend: IModelBackend,
  options?: AnalysisOptions,
): Promise<ContentAnalysisResult> {
  const modelId =
    options?.modelId ?? resolveModelId(registry, 'semantic-analysis', 'text-generation');

  const result: ModelResult = await backend.execute({
    modelId,
    capability: 'semantic-analysis',
    input: { text },
  });

  const analysis = result.output.analysisResult ?? {};

  return {
    summary: typeof analysis['summary'] === 'string' ? analysis['summary'] : text.slice(0, 200),
    keywords: asStringArray(analysis['keywords']) ?? [],
    sentiment: typeof analysis['sentiment'] === 'string' ? analysis['sentiment'] : 'neutral',
    topics: asStringArray(analysis['topics']) ?? [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveModelId(
  registry: ModelRegistry,
  primaryCapability: string,
  fallbackCapability: string,
): string {
  const primary = registry.findBest(primaryCapability as import('../ModelRunner').ModelCapability);
  if (primary) return primary.id;

  const fallback = registry.findBest(fallbackCapability as import('../ModelRunner').ModelCapability);
  if (fallback) return fallback.id;

  throw new Error(
    `No model registered for "${primaryCapability}" or "${fallbackCapability}" in the ModelRegistry.`,
  );
}

/** Safely cast an unknown value to a string array. */
function asStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value as string[];
  }
  return undefined;
}

/** Heuristic intent extraction from query text. */
function inferIntents(query: string): string[] {
  const lower = query.toLowerCase();
  const intents: string[] = [];
  if (lower.includes('find') || lower.includes('search') || lower.includes('show')) intents.push('find');
  if (lower.includes('compare')) intents.push('compare');
  if (lower.includes('edit') || lower.includes('cut') || lower.includes('trim')) intents.push('edit');
  if (lower.includes('summarize') || lower.includes('summary')) intents.push('summarize');
  if (intents.length === 0) intents.push('find');
  return intents;
}

/** Heuristic entity extraction from query text. */
function inferEntities(query: string): string[] {
  // Simple heuristic: words that start with uppercase in the middle of a sentence
  const words = query.split(/\s+/);
  return words
    .filter((w, i) => i > 0 && /^[A-Z]/.test(w) && w.length > 1)
    .map((w) => w.replace(/[.,!?;:]$/, ''));
}

/** Heuristic modality detection from query text. */
function inferModalities(query: string): string[] {
  const lower = query.toLowerCase();
  const modalities: string[] = [];
  if (lower.includes('video') || lower.includes('clip') || lower.includes('footage')) modalities.push('video');
  if (lower.includes('audio') || lower.includes('sound') || lower.includes('music')) modalities.push('audio');
  if (lower.includes('image') || lower.includes('photo') || lower.includes('picture')) modalities.push('image');
  if (lower.includes('text') || lower.includes('script') || lower.includes('transcript')) modalities.push('text');
  if (modalities.length === 0) modalities.push('video');
  return modalities;
}
