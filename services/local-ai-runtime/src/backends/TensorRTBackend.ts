/**
 * @module TensorRTBackend
 *
 * NVIDIA TensorRT-LLM backend.  Currently a stub — `isAvailable()` always
 * returns `false` because the native TensorRT-LLM bindings are not bundled
 * by default.  Once deployed on an NVIDIA GPU node the implementation will
 * manage TRT-LLM engine sessions.
 */

import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
} from '../ModelRunner';

/**
 * Backend targeting NVIDIA TensorRT-LLM for high-throughput, low-latency
 * inference on NVIDIA GPUs.
 */
export class TensorRTBackend implements IModelBackend {
  readonly name = 'tensorrt-llm';

  readonly supportedCapabilities: readonly ModelCapability[] = [
    'text-generation',
    'embedding',
    'vision',
  ];

  readonly supportedHardware: readonly HardwarePreference[] = [
    'cuda',
    'tensorrt',
  ];

  private initialized = false;

  /**
   * Checks whether TensorRT-LLM native bindings are available.
   *
   * @returns `false` in the current stub implementation.
   */
  async isAvailable(): Promise<boolean> {
    // TensorRT-LLM requires NVIDIA GPU + CUDA toolkit + TRT-LLM Python/C++ runtime.
    // Until we ship a native addon this will remain unavailable.
    return false;
  }

  /** @throws if the TensorRT-LLM runtime is not installed. */
  async initialize(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'TensorRT-LLM not installed. An NVIDIA GPU with CUDA and TRT-LLM runtime is required.',
      );
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Execute a model request through TensorRT-LLM.
   *
   * @throws always in the current stub — the native runtime is required.
   */
  async execute(_request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      throw new Error(
        'TensorRT-LLM not installed. An NVIDIA GPU with CUDA and TRT-LLM runtime is required.',
      );
    }
    throw new Error('TensorRT-LLM execution not yet implemented.');
  }

  getLoadedModels(): string[] {
    return [];
  }
}
