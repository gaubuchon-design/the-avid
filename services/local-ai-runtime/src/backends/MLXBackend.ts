/**
 * @module MLXBackend
 *
 * Apple MLX backend for Apple Silicon Macs.  `isAvailable()` checks that
 * the host is running macOS — the native MLX Swift/Python bridge is not
 * yet bundled so the backend currently remains a stub.
 */

import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
} from '../ModelRunner';

/**
 * Backend targeting Apple's MLX framework for on-device inference on
 * Apple Silicon (M1 / M2 / M3 / M4) hardware.
 */
export class MLXBackend implements IModelBackend {
  readonly name = 'mlx';

  readonly supportedCapabilities: readonly ModelCapability[] = [
    'text-generation',
    'embedding',
    'vision',
    'stt',
  ];

  readonly supportedHardware: readonly HardwarePreference[] = ['metal'];

  private initialized = false;

  /**
   * Returns `true` only on macOS (`process.platform === 'darwin'`).
   * Even then the native MLX bridge must be present — until it is
   * shipped this method returns `false`.
   */
  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') {
      return false;
    }
    // MLX bridge is not yet shipped; always return false until bundled
    return false;
  }

  /** @throws if Apple MLX runtime is not available. */
  async initialize(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'Apple MLX runtime not available. Requires macOS on Apple Silicon with the MLX bridge installed.',
      );
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Execute a model request through Apple MLX.
   *
   * @throws always in the current stub.
   */
  async execute(_request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      throw new Error(
        'Apple MLX runtime not available. Requires macOS on Apple Silicon with the MLX bridge installed.',
      );
    }
    throw new Error('MLX execution not yet implemented.');
  }

  getLoadedModels(): string[] {
    return [];
  }
}
