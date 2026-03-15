// =============================================================================
//  THE AVID — Media Package Entry Point
//  Exports the CodecService interface, implementations, types, and factory.
// =============================================================================

export type { CodecService } from './CodecService';
export { NativeCodecService } from './NativeCodecService';
export { BrowserCodecService } from './BrowserCodecService';
export {
  FULL_CODEC_CAPABILITIES,
  BROWSER_CODEC_CAPABILITIES,
} from './codecCapabilities';

export {
  PixelFormat,
  HWAccelType,
} from './types';

export type {
  ProbeResult,
  DecodedFrameData,
  DecodeConfig,
  EncodeConfig,
  ImageSeqConfig,
  RawDecodeConfig,
  MuxConfig,
  TranscodeProgress,
  ProgressCallback,
  HWAccelReport,
  HWAccelDeviceInfo,
  CodecVersions,
  CodecCapability,
  SupportTier,
} from './types';

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Detect the runtime environment and create the appropriate CodecService.
 *
 * - Electron main process → NativeCodecService (N-API addon)
 * - Browser (including Electron renderer) → BrowserCodecService (WebCodecs)
 *
 * The renderer process uses the ElectronCodecBridge (IPC to main process)
 * which implements the same CodecService interface.
 */
export function createCodecService(): import('./CodecService').CodecService {
  // Check if we're in a Node.js environment with native module support
  const isNode =
    typeof process !== 'undefined' &&
    typeof process.versions?.node !== 'undefined';

  const isElectronMain =
    isNode &&
    typeof process !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!(process as any).type &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).type !== 'renderer';

  if (isElectronMain) {
    return new NativeCodecService();
  }

  return new BrowserCodecService();
}
