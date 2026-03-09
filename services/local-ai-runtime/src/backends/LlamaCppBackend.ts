/**
 * @module LlamaCppBackend
 *
 * llama.cpp backend via the `node-llama-cpp` npm package.  `isAvailable()`
 * dynamically checks whether the optional dependency is resolvable.  When
 * available, this backend supports GGUF model files with CPU, CUDA, and
 * Metal acceleration.
 */

import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
} from '../ModelRunner';

/**
 * Backend wrapping llama.cpp through the `node-llama-cpp` Node.js bindings.
 * Supports quantised GGUF models on CPU, CUDA, and Apple Metal.
 */
export class LlamaCppBackend implements IModelBackend {
  readonly name = 'llama.cpp';

  readonly supportedCapabilities: readonly ModelCapability[] = [
    'text-generation',
    'embedding',
    'semantic-analysis',
    'query-rewrite',
  ];

  readonly supportedHardware: readonly HardwarePreference[] = [
    'cpu',
    'cuda',
    'metal',
  ];

  private initialized = false;
  private readonly loadedModels: string[] = [];

  /**
   * Checks whether the `node-llama-cpp` module can be resolved.
   *
   * Uses a dynamic `require.resolve` wrapped in a try/catch so the check
   * succeeds only when the optional dependency has been installed.
   */
  async isAvailable(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require.resolve('node-llama-cpp');
      return true;
    } catch {
      return false;
    }
  }

  /** @throws if `node-llama-cpp` is not installed. */
  async initialize(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'node-llama-cpp not installed. Run `npm install node-llama-cpp` to enable this backend.',
      );
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.loadedModels.length = 0;
    this.initialized = false;
  }

  /**
   * Execute a model request through llama.cpp.
   *
   * Currently returns stub results — the real implementation would load
   * GGUF files, create a context, and run token generation.
   */
  async execute(request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      throw new Error(
        'LlamaCppBackend not initialized. Call initialize() first.',
      );
    }

    const start = Date.now();

    // Stub: return placeholder output depending on capability
    const output = (() => {
      switch (request.capability) {
        case 'text-generation':
          return { text: `[llama.cpp stub] Response to: ${request.input.text ?? ''}` };
        case 'embedding':
          return {
            embeddings: (request.input.embeddingTexts ?? []).map(() =>
              Array.from({ length: 384 }, () => Math.random() * 2 - 1),
            ),
          };
        case 'semantic-analysis':
          return {
            analysisResult: {
              summary: `[stub] Analysis of: ${request.input.text ?? ''}`,
              keywords: ['stub'],
              sentiment: 'neutral',
            },
          };
        case 'query-rewrite':
          return { text: `[rewritten] ${request.input.text ?? ''}` };
        default:
          return { text: '[llama.cpp stub] unsupported capability' };
      }
    })();

    if (!this.loadedModels.includes(request.modelId)) {
      this.loadedModels.push(request.modelId);
    }

    return {
      modelId: request.modelId,
      capability: request.capability,
      output,
      metrics: {
        durationMs: Date.now() - start,
        tokensProcessed: 0,
        backend: this.name,
        hardware: 'cpu',
      },
    };
  }

  getLoadedModels(): string[] {
    return [...this.loadedModels];
  }
}
