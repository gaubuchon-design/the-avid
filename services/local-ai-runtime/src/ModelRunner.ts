/**
 * @module ModelRunner
 *
 * Stable internal API for local AI model inference.  Every backend
 * (ONNX Runtime, TensorRT-LLM, llama.cpp, MLX, CTranslate2, etc.)
 * implements the single {@link IModelBackend} interface so the rest of
 * the system never couples to a specific runtime.
 */

// ---------------------------------------------------------------------------
// Enums / literal unions
// ---------------------------------------------------------------------------

/** Capability that a model can provide. */
export type ModelCapability =
  | 'embedding'
  | 'stt'
  | 'translation'
  | 'text-generation'
  | 'vision'
  | 'semantic-analysis'
  | 'query-rewrite';

/** Hardware preference for model execution. */
export type HardwarePreference = 'cpu' | 'cuda' | 'metal' | 'tensorrt' | 'auto';

/** Quantization level used by a model. */
export type QuantizationLevel =
  | 'fp32'
  | 'fp16'
  | 'int8'
  | 'int4'
  | 'q4_k_m'
  | 'q5_k_m';

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

/** A single model execution request. */
export interface ModelRequest {
  /** Identifier of the model to use (must be registered in the ModelRegistry). */
  readonly modelId: string;
  /** The capability being invoked. */
  readonly capability: ModelCapability;
  /** Input payload — only the fields relevant to `capability` need be set. */
  readonly input: ModelInput;
  /** Optional generation / execution parameters. */
  readonly options?: ModelOptions;
}

/** Union of possible input payloads for a model request. */
export interface ModelInput {
  /** Free-form text input (used by text-generation, semantic-analysis, query-rewrite, etc.). */
  readonly text?: string;
  /** Absolute path to an audio file (used by stt). */
  readonly audioPath?: string;
  /** Absolute path to an image file (used by vision). */
  readonly imagePath?: string;
  /** BCP-47 source language tag (used by translation). */
  readonly sourceLanguage?: string;
  /** BCP-47 target language tag (used by translation). */
  readonly targetLanguage?: string;
  /** Array of texts to embed (used by embedding). */
  readonly embeddingTexts?: readonly string[];
}

/** Optional generation / execution parameters. */
export interface ModelOptions {
  /** Maximum number of tokens to generate. */
  readonly maxTokens?: number;
  /** Sampling temperature (0 = deterministic, 1 = creative). */
  readonly temperature?: number;
  /** Top-K sampling. */
  readonly topK?: number;
  /** Nucleus (top-P) sampling. */
  readonly topP?: number;
  /** Per-request timeout in milliseconds. */
  readonly timeout?: number;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Result returned after model execution. */
export interface ModelResult {
  /** Identifier of the model that produced this result. */
  readonly modelId: string;
  /** Capability that was invoked. */
  readonly capability: ModelCapability;
  /** Output payload. */
  readonly output: ModelOutput;
  /** Runtime performance metrics. */
  readonly metrics: ExecutionMetrics;
}

/** Union of possible output payloads. */
export interface ModelOutput {
  /** Generated or rewritten text. */
  readonly text?: string;
  /** Embedding vectors (one per input text). */
  readonly embeddings?: readonly number[][];
  /** Transcription segments with word-level timestamps. */
  readonly transcriptSegments?: readonly TranscriptSegmentOutput[];
  /** Translated text. */
  readonly translatedText?: string;
  /** Structured analysis output. */
  readonly analysisResult?: Record<string, unknown>;
}

/** A single segment of a speech-to-text transcription. */
export interface TranscriptSegmentOutput {
  /** Segment start time in seconds. */
  readonly startTime: number;
  /** Segment end time in seconds. */
  readonly endTime: number;
  /** Transcribed text for this segment. */
  readonly text: string;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** Optional word-level detail. */
  readonly words?: readonly WordTimestamp[];
}

/** Word-level timestamp within a transcript segment. */
export interface WordTimestamp {
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly confidence: number;
}

/** Performance metrics collected during model execution. */
export interface ExecutionMetrics {
  /** Wall-clock duration of the execution in milliseconds. */
  readonly durationMs: number;
  /** Number of tokens processed (generation) or input tokens (embedding). */
  readonly tokensProcessed?: number;
  /** Name of the backend that handled the request. */
  readonly backend: string;
  /** Hardware device that was used (cpu, cuda:0, metal, etc.). */
  readonly hardware: string;
  /** Time spent loading the model (cold-start), in milliseconds. */
  readonly modelLoadTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

/**
 * The core model-runner interface.
 *
 * Every inference backend implements this contract so the rest of the system
 * can remain agnostic to the underlying runtime.  Backends are discovered at
 * startup, probed with {@link isAvailable}, and registered with the
 * {@link ModelRegistry}.
 */
export interface IModelBackend {
  /** Human-readable name of the backend (e.g. "onnxruntime", "llama.cpp"). */
  readonly name: string;
  /** Capabilities this backend can serve. */
  readonly supportedCapabilities: readonly ModelCapability[];
  /** Hardware devices this backend can target. */
  readonly supportedHardware: readonly HardwarePreference[];

  /**
   * Returns `true` when the backend's native dependencies are present and
   * the required hardware is accessible.
   */
  isAvailable(): Promise<boolean>;

  /** One-time initialisation (load shared libraries, warm caches, etc.). */
  initialize(): Promise<void>;

  /** Graceful shutdown — unload models, release GPU memory. */
  shutdown(): Promise<void>;

  /** Execute a model request and return the result. */
  execute(request: ModelRequest): Promise<ModelResult>;

  /** Return the IDs of models currently loaded in memory. */
  getLoadedModels(): string[];
}
