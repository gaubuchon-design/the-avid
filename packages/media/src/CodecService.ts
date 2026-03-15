// =============================================================================
//  THE AVID — Codec Service Interface
//  Abstract interface for all codec operations. Two implementations:
//  - BrowserCodecService (WebCodecs + HTMLVideoElement, web app)
//  - NativeCodecService (N-API addon wrapping FFmpeg/LibRaw/OpenEXR, desktop)
//
//  Application code imports only this interface. The correct implementation
//  is resolved at runtime via createCodecService().
// =============================================================================

import type {
  ProbeResult,
  DecodedFrameData,
  DecodeConfig,
  EncodeConfig,
  ImageSeqConfig,
  RawDecodeConfig,
  MuxConfig,
  ProgressCallback,
  HWAccelReport,
  CodecVersions,
  CodecCapability,
} from './types';

// ─── Codec Service Interface ────────────────────────────────────────────────

/**
 * Abstract codec service providing decode, encode, probe, mux, and transcode
 * operations. Platform-specific implementations handle the actual codec work.
 */
export interface CodecService {
  /** Service name for diagnostics. */
  readonly name: string;

  /** Whether this is the native (desktop) implementation. */
  readonly isNative: boolean;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /** Initialize the codec service. Call once at startup. */
  init(): Promise<void>;

  /** Dispose resources. Call on shutdown. */
  dispose(): void;

  // ── Probe ─────────────────────────────────────────────────────────────

  /**
   * Probe a media file and return comprehensive metadata.
   * Native: uses FFprobe via libavformat.
   * Browser: uses HTMLVideoElement + File API.
   */
  probe(filePath: string): Promise<ProbeResult>;

  // ── Decode ────────────────────────────────────────────────────────────

  /**
   * Decode a single video frame at a given timestamp.
   * Returns raw pixel data in the requested format.
   */
  decodeFrame(
    filePath: string,
    timestamp: number,
    config?: Partial<DecodeConfig>,
  ): Promise<DecodedFrameData>;

  /**
   * Decode a camera RAW file (ARRIRAW, CR3, NEF, DNG, etc.).
   * Native only — browser implementation returns null.
   */
  decodeRaw(
    filePath: string,
    config?: RawDecodeConfig,
  ): Promise<DecodedFrameData | null>;

  /**
   * Check if a file is a supported camera RAW format.
   */
  isRawSupported(filePath: string): boolean;

  /**
   * Decode a frame from an image sequence (EXR, DPX, TIFF, etc.).
   */
  decodeImageSequenceFrame(
    config: ImageSeqConfig,
    frameNumber: number,
  ): Promise<DecodedFrameData>;

  // ── Encode ────────────────────────────────────────────────────────────

  /**
   * Open an encode session. Returns a session ID.
   * Call writeVideoFrame/writeAudioSamples, then finalizeEncode.
   */
  openEncodeSession(config: EncodeConfig): Promise<string>;

  /**
   * Write a video frame to an encode session.
   */
  writeVideoFrame(
    sessionId: string,
    data: ArrayBuffer,
    width: number,
    height: number,
    pts: number,
  ): Promise<void>;

  /**
   * Write audio samples to an encode session.
   */
  writeAudioSamples(
    sessionId: string,
    samples: Float32Array,
    channels: number,
    sampleRate: number,
  ): Promise<void>;

  /**
   * Finalize and close an encode session.
   */
  finalizeEncode(sessionId: string): Promise<void>;

  // ── Mux / Transcode ───────────────────────────────────────────────────

  /**
   * Remux a file (change container without re-encoding).
   */
  remux(
    inputPath: string,
    config: MuxConfig,
    onProgress?: ProgressCallback,
  ): Promise<void>;

  /**
   * Full transcode (decode + encode in one operation).
   */
  transcode(
    inputPath: string,
    encodeConfig: EncodeConfig,
    onProgress?: ProgressCallback,
  ): Promise<void>;

  // ── Hardware Acceleration ─────────────────────────────────────────────

  /**
   * Query available hardware acceleration devices and capabilities.
   */
  queryHWAccel(): Promise<HWAccelReport>;

  // ── Capabilities ──────────────────────────────────────────────────────

  /**
   * Get the full codec capability matrix for this platform.
   */
  getCapabilities(): CodecCapability[];

  /**
   * Check if a specific codec is supported for decode.
   */
  canDecode(codecId: string): boolean;

  /**
   * Check if a specific codec is supported for encode.
   */
  canEncode(codecId: string): boolean;

  // ── Diagnostics ───────────────────────────────────────────────────────

  /**
   * Get version info for bundled native libraries.
   */
  getVersions(): CodecVersions;
}
