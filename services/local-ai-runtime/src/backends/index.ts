/**
 * @module backends
 *
 * Re-exports every backend implementation so consumers can import them
 * from a single location:
 *
 * ```ts
 * import { MockBackend, ONNXBackend } from './backends';
 * ```
 */

export { ONNXBackend } from './ONNXBackend';
export { TensorRTBackend } from './TensorRTBackend';
export { LlamaCppBackend } from './LlamaCppBackend';
export { MLXBackend } from './MLXBackend';
export { CTranslate2Backend } from './CTranslate2Backend';
export { FasterWhisperBackend } from './FasterWhisperBackend';
export { MockBackend } from './MockBackend';
