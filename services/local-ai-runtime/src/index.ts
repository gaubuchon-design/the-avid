/**
 * @module @mcua/local-ai-runtime
 *
 * Local AI inference service with a pluggable backend architecture.
 *
 * This package exposes:
 * - **Core types** — {@link ModelRequest}, {@link ModelResult}, {@link IModelBackend}
 * - **Model registry** — {@link ModelRegistry} and {@link ModelRegistryEntry}
 * - **Backend implementations** — Mock, ONNX, TensorRT, llama.cpp, MLX, CTranslate2
 * - **Capability pipelines** — embedding, STT, translation, metadata extraction, semantic analysis
 * - **Health & benchmarking** — {@link getHealthInfo}, {@link runBenchmark}
 */

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------

export const SERVICE_NAME = 'local-ai-runtime';
export const SERVICE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Core types (ModelRunner)
// ---------------------------------------------------------------------------

export type {
  ModelCapability,
  HardwarePreference,
  QuantizationLevel,
  ModelRequest,
  ModelInput,
  ModelOptions,
  ModelResult,
  ModelOutput,
  TranscriptSegmentOutput,
  WordTimestamp,
  ExecutionMetrics,
  IModelBackend,
} from './ModelRunner';

// ---------------------------------------------------------------------------
// Model Registry
// ---------------------------------------------------------------------------

export { ModelRegistry } from './ModelRegistry';
export type { ModelRegistryEntry, ModelLoadState } from './ModelRegistry';

// ---------------------------------------------------------------------------
// Registry seed
// ---------------------------------------------------------------------------

export { seedRegistry, createSeededRegistry } from './registry-seed';

// ---------------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------------

export { ONNXBackend } from './backends/ONNXBackend';
export { TensorRTBackend } from './backends/TensorRTBackend';
export { LlamaCppBackend } from './backends/LlamaCppBackend';
export { MLXBackend } from './backends/MLXBackend';
export { CTranslate2Backend } from './backends/CTranslate2Backend';
export { MockBackend } from './backends/MockBackend';

// ---------------------------------------------------------------------------
// Capability pipelines
// ---------------------------------------------------------------------------

export { generateEmbeddings } from './capabilities/embedding';
export type { EmbeddingResult, EmbeddingOptions } from './capabilities/embedding';

export { transcribe } from './capabilities/stt';
export type { TranscribeResult, TranscribeOptions } from './capabilities/stt';

export { translate } from './capabilities/translation';
export type { TranslationResult, TranslationOptions } from './capabilities/translation';

export { extractMetadata } from './capabilities/metadata-extraction';
export type { MediaMetadata } from './capabilities/metadata-extraction';

export { analyzeQuery, analyzeContent } from './capabilities/semantic-analysis';
export type {
  QueryAnalysisResult,
  ContentAnalysisResult,
  AnalysisOptions,
} from './capabilities/semantic-analysis';

// ---------------------------------------------------------------------------
// Health & benchmarking
// ---------------------------------------------------------------------------

export { getHealthInfo, runBenchmark } from './health';
export type {
  HealthInfo,
  BackendStatus,
  MemorySnapshot,
  BenchmarkResult,
} from './health';
