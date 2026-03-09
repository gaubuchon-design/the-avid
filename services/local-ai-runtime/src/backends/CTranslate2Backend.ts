/**
 * @module CTranslate2Backend
 *
 * CTranslate2 backend for optimised CPU / GPU inference of Transformer
 * models, particularly translation and speech-to-text models converted to
 * the CT2 format.  Currently a stub — `isAvailable()` returns `false`.
 */

import type {
  IModelBackend,
  ModelCapability,
  HardwarePreference,
  ModelRequest,
  ModelResult,
} from '../ModelRunner';

/**
 * Backend wrapping OpenNMT's CTranslate2 library for efficient inference
 * of translation and STT models.
 */
export class CTranslate2Backend implements IModelBackend {
  readonly name = 'ctranslate2';

  readonly supportedCapabilities: readonly ModelCapability[] = [
    'translation',
    'stt',
    'text-generation',
  ];

  readonly supportedHardware: readonly HardwarePreference[] = [
    'cpu',
    'cuda',
  ];

  private initialized = false;

  /**
   * Checks whether the CTranslate2 native bindings are available.
   *
   * @returns `false` in the current stub implementation.
   */
  async isAvailable(): Promise<boolean> {
    // CTranslate2 requires a native addon or a Python subprocess.
    // Until we ship one of these the backend remains unavailable.
    return false;
  }

  /** @throws if CTranslate2 is not installed. */
  async initialize(): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'CTranslate2 not installed. Install the native ctranslate2 bindings to enable this backend.',
      );
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Execute a model request through CTranslate2.
   *
   * @throws always in the current stub.
   */
  async execute(_request: ModelRequest): Promise<ModelResult> {
    if (!this.initialized) {
      throw new Error(
        'CTranslate2 not installed. Install the native ctranslate2 bindings to enable this backend.',
      );
    }
    throw new Error('CTranslate2 execution not yet implemented.');
  }

  getLoadedModels(): string[] {
    return [];
  }
}
