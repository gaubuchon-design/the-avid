/**
 * @module ONNXBackend
 *
 * ONNX Runtime GenAI backend.  Currently a stub — `isAvailable()` always
 * returns `false` because the native `onnxruntime-node` package is not
 * bundled by default.  Once installed the implementation will delegate to
 * the ONNX Runtime inference session API.
 */

import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
} from '../ModelRunner';

/**
 * Backend wrapping Microsoft ONNX Runtime for cross-platform CPU / GPU
 * inference of ONNX-exported models.
 */
export class ONNXBackend implements IModelBackend {
  readonly name = 'onnxruntime';

  readonly supportedCapabilities: readonly ModelCapability[] = [
    'embedding',
    'stt',
    'text-generation',
    'vision',
  ];

  readonly supportedHardware: readonly HardwarePreference[] = [
    'cpu',
    'cuda',
    'tensorrt',
  ];

  private initialized = false;

  /**
   * Checks whether the `onnxruntime-node` native module is importable.
   *
   * @returns `false` in the current stub implementation.
   */
  async isAvailable(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require.resolve('onnxruntime-node');
      return true;
    } catch {
      return false;
    }
  }

  /** @throws if the native module is not installed. */
  async initialize(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'ONNX Runtime not installed. Install onnxruntime-node to enable this backend.',
      );
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Execute a model request through ONNX Runtime.
   *
   * @throws always in the current stub — the native module is required.
   */
  async execute(_request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      throw new Error(
        'ONNX Runtime not installed. Install onnxruntime-node to enable this backend.',
      );
    }
    // Real implementation would create an InferenceSession, run the model, etc.
    throw new Error('ONNX Runtime execution not yet implemented.');
  }

  getLoadedModels(): string[] {
    return [];
  }
}
