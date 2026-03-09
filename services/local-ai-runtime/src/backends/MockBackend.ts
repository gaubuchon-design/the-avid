/**
 * @module MockBackend
 *
 * Full mock backend for CI and development.  `isAvailable()` always returns
 * `true` and `execute()` returns realistic-looking stub results for every
 * supported capability so the rest of the system can be exercised without
 * any GPU hardware or native dependencies.
 */

import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
  ModelOutput,
  ExecutionMetrics,
  TranscriptSegmentOutput,
} from '../ModelRunner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a random integer in [min, max). */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

/** Return a random float in [min, max). */
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Async sleep helper for simulated delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build realistic-looking {@link ExecutionMetrics}. */
function mockMetrics(
  backend: string,
  capability: ModelCapability,
  modelLoadTimeMs?: number,
): ExecutionMetrics {
  const durationMs = randInt(15, 350);
  return {
    durationMs,
    tokensProcessed: capability === 'embedding' ? undefined : randInt(20, 512),
    backend,
    hardware: 'cpu',
    modelLoadTimeMs,
  };
}

// ---------------------------------------------------------------------------
// MockBackend
// ---------------------------------------------------------------------------

/** Maximum number of models to keep in mock memory (prevents unbounded growth). */
const MAX_LOADED_MODELS = 50;

/** Simulated warm-up delay range in milliseconds. */
const WARMUP_MIN_MS = 50;
const WARMUP_MAX_MS = 200;

/**
 * A deterministic (enough) mock backend that supports all capabilities
 * and always reports itself as available.  Designed for unit / integration
 * tests and local development without GPUs.
 *
 * ## Warm-up behaviour
 *
 * The first execution for a given model simulates a cold-start delay to
 * exercise downstream timeout and retry logic.  Subsequent executions
 * for the same model return immediately.
 */
export class MockBackend implements IModelBackend {
  readonly name = 'mock';

  readonly supportedCapabilities: readonly ModelCapability[] = [
    'embedding',
    'stt',
    'translation',
    'text-generation',
    'vision',
    'semantic-analysis',
    'query-rewrite',
  ];

  readonly supportedHardware: readonly HardwarePreference[] = [
    'cpu',
    'auto',
  ];

  private initialized = false;
  private readonly loadedModels: string[] = [];
  /** Tracks total execution count for observability. */
  private executeCount = 0;

  /** Always returns `true`. */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.loadedModels.length = 0;
    this.executeCount = 0;
    this.initialized = false;
  }

  /**
   * Return realistic mock results for the requested capability.
   *
   * On the first call for a given model ID a simulated warm-up delay
   * is introduced. Subsequent calls for the same model skip the delay.
   */
  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    let modelLoadTimeMs: number | undefined;

    if (!this.loadedModels.includes(request.modelId)) {
      // Simulate cold-start warm-up
      const warmupMs = randInt(WARMUP_MIN_MS, WARMUP_MAX_MS);
      await sleep(warmupMs);
      modelLoadTimeMs = warmupMs;

      this.loadedModels.push(request.modelId);

      // Prevent unbounded growth of loaded model list
      if (this.loadedModels.length > MAX_LOADED_MODELS) {
        this.loadedModels.shift();
      }
    }

    this.executeCount++;

    const output = this.buildOutput(request);
    const metrics = mockMetrics(this.name, request.capability, modelLoadTimeMs);

    return {
      modelId: request.modelId,
      capability: request.capability,
      output,
      metrics,
    };
  }

  getLoadedModels(): string[] {
    return [...this.loadedModels];
  }

  /** Return total number of execute() calls since initialization. */
  getExecuteCount(): number {
    return this.executeCount;
  }

  /**
   * Pre-warm a model so the first real `execute()` call does not incur
   * the simulated cold-start delay.
   *
   * @param modelId - The model identifier to warm up.
   */
  async warmUp(modelId: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.loadedModels.includes(modelId)) {
      const warmupMs = randInt(WARMUP_MIN_MS, WARMUP_MAX_MS);
      await sleep(warmupMs);
      this.loadedModels.push(modelId);

      if (this.loadedModels.length > MAX_LOADED_MODELS) {
        this.loadedModels.shift();
      }
    }
  }

  /**
   * Unload a specific model from mock memory.
   *
   * @param modelId - The model to unload.
   * @returns `true` if the model was found and removed.
   */
  unloadModel(modelId: string): boolean {
    const idx = this.loadedModels.indexOf(modelId);
    if (idx === -1) return false;
    this.loadedModels.splice(idx, 1);
    return true;
  }

  // -----------------------------------------------------------------------
  // Private output builders
  // -----------------------------------------------------------------------

  private buildOutput(request: ModelRequest): ModelOutput {
    switch (request.capability) {
      case 'embedding':
        return this.mockEmbedding(request);
      case 'stt':
        return this.mockSTT();
      case 'translation':
        return this.mockTranslation(request);
      case 'text-generation':
        return this.mockTextGeneration(request);
      case 'vision':
        return this.mockVision();
      case 'semantic-analysis':
        return this.mockSemanticAnalysis(request);
      case 'query-rewrite':
        return this.mockQueryRewrite(request);
    }
  }

  /** Return random 384-dimensional unit vectors, one per input text. */
  private mockEmbedding(request: ModelRequest): ModelOutput {
    const texts = request.input.embeddingTexts ?? [request.input.text ?? ''];
    const embeddings = texts.map(() => {
      const vec = Array.from({ length: 384 }, () => Math.random() * 2 - 1);
      // L2-normalise so consumers can use cosine similarity directly.
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      return vec.map((v) => v / (norm || 1));
    });
    return { embeddings };
  }

  /** Return a plausible multi-segment transcription. */
  private mockSTT(): ModelOutput {
    const segments: TranscriptSegmentOutput[] = [
      {
        startTime: 0.0,
        endTime: 3.2,
        text: 'Welcome to the local AI runtime.',
        confidence: 0.97,
        words: [
          { text: 'Welcome', startTime: 0.0, endTime: 0.45, confidence: 0.98 },
          { text: 'to', startTime: 0.45, endTime: 0.6, confidence: 0.99 },
          { text: 'the', startTime: 0.6, endTime: 0.72, confidence: 0.99 },
          { text: 'local', startTime: 0.72, endTime: 1.1, confidence: 0.96 },
          { text: 'AI', startTime: 1.1, endTime: 1.45, confidence: 0.95 },
          { text: 'runtime.', startTime: 1.45, endTime: 3.2, confidence: 0.97 },
        ],
      },
      {
        startTime: 3.4,
        endTime: 7.1,
        text: 'This is a mock transcription segment for testing.',
        confidence: 0.94,
        words: [
          { text: 'This', startTime: 3.4, endTime: 3.6, confidence: 0.95 },
          { text: 'is', startTime: 3.6, endTime: 3.72, confidence: 0.98 },
          { text: 'a', startTime: 3.72, endTime: 3.8, confidence: 0.99 },
          { text: 'mock', startTime: 3.8, endTime: 4.15, confidence: 0.92 },
          { text: 'transcription', startTime: 4.15, endTime: 5.0, confidence: 0.91 },
          { text: 'segment', startTime: 5.0, endTime: 5.6, confidence: 0.93 },
          { text: 'for', startTime: 5.6, endTime: 5.8, confidence: 0.97 },
          { text: 'testing.', startTime: 5.8, endTime: 7.1, confidence: 0.96 },
        ],
      },
      {
        startTime: 7.5,
        endTime: 11.0,
        text: 'Each segment includes word-level timestamps and confidence scores.',
        confidence: 0.95,
      },
    ];
    return { transcriptSegments: segments };
  }

  /** Return a prefixed "translation". */
  private mockTranslation(request: ModelRequest): ModelOutput {
    const targetLang = request.input.targetLanguage ?? 'en';
    const sourceText = request.input.text ?? '';
    return { translatedText: `[TRANSLATED:${targetLang}] ${sourceText}` };
  }

  /** Return a short mock generation. */
  private mockTextGeneration(request: ModelRequest): ModelOutput {
    const prompt = request.input.text ?? '';
    return {
      text: `[MockBackend] Generated response for: "${prompt.slice(0, 80)}". ` +
        'This is a placeholder from the mock inference backend. ' +
        'In production this would be generated by a real LLM.',
    };
  }

  /** Return a mock scene-analysis result for vision. */
  private mockVision(): ModelOutput {
    return {
      analysisResult: {
        description: 'A video frame showing two people in a newsroom setting with a desk and monitors.',
        objects: [
          { label: 'person', confidence: 0.96, boundingBox: { x: 120, y: 80, width: 200, height: 400 } },
          { label: 'person', confidence: 0.93, boundingBox: { x: 400, y: 90, width: 180, height: 380 } },
          { label: 'monitor', confidence: 0.89, boundingBox: { x: 600, y: 50, width: 160, height: 120 } },
          { label: 'desk', confidence: 0.87, boundingBox: { x: 50, y: 350, width: 700, height: 150 } },
        ],
        tags: ['newsroom', 'studio', 'broadcast', 'two-shot', 'indoor'],
        dominantColors: ['#1a1a2e', '#e94560', '#f5f5f5'],
        sceneType: 'studio-interview',
      },
    };
  }

  /** Return mock semantic-analysis output. */
  private mockSemanticAnalysis(request: ModelRequest): ModelOutput {
    const text = request.input.text ?? '';
    return {
      analysisResult: {
        summary: `Mock semantic summary of: "${text.slice(0, 60)}"`,
        keywords: ['mock', 'analysis', 'local-ai'],
        sentiment: Math.random() > 0.5 ? 'positive' : 'neutral',
        topics: ['technology', 'artificial-intelligence'],
        confidence: roundTo(randFloat(0.8, 0.99), 2),
      },
    };
  }

  /** Return a mock rewritten query. */
  private mockQueryRewrite(request: ModelRequest): ModelOutput {
    const query = request.input.text ?? '';
    return {
      text: `(${query}) OR (related clips) OR (similar content)`,
    };
  }
}

/** Round a number to `decimals` places. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
