/**
 * @module capabilities
 *
 * Re-exports all capability pipeline functions.
 */

export { generateEmbeddings } from './embedding';
export type { EmbeddingResult, EmbeddingOptions } from './embedding';

export { transcribe } from './stt';
export type { TranscribeResult, TranscribeOptions } from './stt';

export { translate } from './translation';
export type { TranslationResult, TranslationOptions } from './translation';

export { extractMetadata } from './metadata-extraction';
export type { MediaMetadata } from './metadata-extraction';

export { analyzeQuery, analyzeContent } from './semantic-analysis';
export type {
  QueryAnalysisResult,
  ContentAnalysisResult,
  AnalysisOptions,
} from './semantic-analysis';
