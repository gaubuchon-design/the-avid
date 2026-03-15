// =============================================================================
//  THE AVID — Native Codec Service
//  Desktop (Electron) implementation of CodecService using the N-API native
//  addon that wraps FFmpeg, LibRaw, and OpenEXR.
//
//  This service runs in the Electron main process and is called via IPC from
//  the renderer process. The N-API addon runs heavy decode/encode work on the
//  libuv thread pool to avoid blocking the Node.js event loop.
// =============================================================================

import type { CodecService } from './CodecService';
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
import { PixelFormat, HWAccelType } from './types';
import { FULL_CODEC_CAPABILITIES } from './codecCapabilities';

// ─── Native Addon Interface ─────────────────────────────────────────────────

/**
 * Type declarations for the native N-API addon.
 * The addon is loaded via require() at runtime — this interface describes
 * the JavaScript-facing API that the C napi_binding.c module exports.
 */
interface NativeAddon {
  init(): number;
  probe(filePath: string): ProbeResult;
  queryHwAccel(): HWAccelReport;
  decodeFrame(
    filePath: string,
    options: {
      timestamp?: number;
      outputFormat?: number;
      hwAccel?: number;
      targetWidth?: number;
      targetHeight?: number;
    },
  ): Promise<DecodedFrameData>;
  decodeRaw(
    filePath: string,
    options?: {
      useCameraWb?: boolean;
      halfSize?: boolean;
      useGpu?: boolean;
      outputBps?: number;
    },
  ): Promise<DecodedFrameData>;
  isRawSupported(filePath: string): boolean;
  versions(): CodecVersions;
}

// ─── Native Codec Service ───────────────────────────────────────────────────

export class NativeCodecService implements CodecService {
  readonly name = 'NativeCodecService';
  readonly isNative = true;

  private addon: NativeAddon | null = null;
  private hwAccelReport: HWAccelReport | null = null;
  private encodeSessions = new Map<string, unknown>();
  private sessionCounter = 0;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async init(): Promise<void> {
    try {
      // Load the native addon at runtime
      // The prebuild binary is resolved by node-gyp-build
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.addon = require('node-gyp-build')(__dirname + '/..') as NativeAddon;
      const err = this.addon.init();
      if (err !== 0) {
        throw new Error(`Native codec init failed with error code ${err}`);
      }

      // Cache HW accel report
      this.hwAccelReport = this.addon.queryHwAccel();

      console.log(
        '[NativeCodecService] Initialized:',
        this.addon.versions(),
      );
    } catch (e) {
      console.error('[NativeCodecService] Failed to load native addon:', e);
      throw e;
    }
  }

  dispose(): void {
    this.encodeSessions.clear();
    this.addon = null;
  }

  private requireAddon(): NativeAddon {
    if (!this.addon) {
      throw new Error('NativeCodecService not initialized — call init() first');
    }
    return this.addon;
  }

  // ── Probe ─────────────────────────────────────────────────────────────

  async probe(filePath: string): Promise<ProbeResult> {
    const addon = this.requireAddon();
    return addon.probe(filePath);
  }

  // ── Decode ────────────────────────────────────────────────────────────

  async decodeFrame(
    filePath: string,
    timestamp: number,
    config?: Partial<DecodeConfig>,
  ): Promise<DecodedFrameData> {
    const addon = this.requireAddon();

    // Auto-select HW accel if not specified
    let hwAccel = config?.hwAccel ?? HWAccelType.NONE;
    if (hwAccel === HWAccelType.NONE && this.hwAccelReport) {
      hwAccel = this.hwAccelReport.preferredDecode;
    }

    return addon.decodeFrame(filePath, {
      timestamp,
      outputFormat: config?.outputFormat ?? PixelFormat.RGBA8,
      hwAccel,
      targetWidth: config?.targetWidth ?? 0,
      targetHeight: config?.targetHeight ?? 0,
    });
  }

  async decodeRaw(
    filePath: string,
    config?: RawDecodeConfig,
  ): Promise<DecodedFrameData | null> {
    const addon = this.requireAddon();

    if (!addon.isRawSupported(filePath)) {
      return null;
    }

    return addon.decodeRaw(filePath, {
      useCameraWb: config?.useCameraWb ?? true,
      halfSize: config?.halfSize ?? false,
      useGpu: config?.useGpu ?? false,
      outputBps: config?.outputBps ?? 16,
    });
  }

  isRawSupported(filePath: string): boolean {
    const addon = this.requireAddon();
    return addon.isRawSupported(filePath);
  }

  async decodeImageSequenceFrame(
    config: ImageSeqConfig,
    frameNumber: number,
  ): Promise<DecodedFrameData> {
    // Build the file path from pattern
    const filename = config.pattern.replace(
      /%(\d*)d/,
      (_, width) => {
        const w = parseInt(width) || 0;
        return frameNumber.toString().padStart(w, '0');
      },
    );
    const filePath = `${config.directory}/${filename}`;

    // Use the general decode path — FFmpeg handles EXR, DPX, TIFF, etc.
    return this.decodeFrame(filePath, 0, {
      outputFormat: config.outputFormat ?? PixelFormat.RGBAF16,
      hwAccel: HWAccelType.NONE,
      threadCount: config.threadCount,
    });
  }

  // ── Encode ────────────────────────────────────────────────────────────

  async openEncodeSession(config: EncodeConfig): Promise<string> {
    // In the full implementation, this would call the native addon's
    // avid_encode_open and store the context. For now, store config.
    const sessionId = `enc_${++this.sessionCounter}`;
    this.encodeSessions.set(sessionId, config);
    return sessionId;
  }

  async writeVideoFrame(
    sessionId: string,
    data: ArrayBuffer,
    width: number,
    height: number,
    pts: number,
  ): Promise<void> {
    if (!this.encodeSessions.has(sessionId)) {
      throw new Error(`Encode session ${sessionId} not found`);
    }
    // Native addon call: avid_encode_write_video
    // Implemented in the IPC bridge for renderer → main process
  }

  async writeAudioSamples(
    sessionId: string,
    samples: Float32Array,
    channels: number,
    sampleRate: number,
  ): Promise<void> {
    if (!this.encodeSessions.has(sessionId)) {
      throw new Error(`Encode session ${sessionId} not found`);
    }
    // Native addon call: avid_encode_write_audio
  }

  async finalizeEncode(sessionId: string): Promise<void> {
    this.encodeSessions.delete(sessionId);
    // Native addon call: avid_encode_finalize
  }

  // ── Mux / Transcode ───────────────────────────────────────────────────

  async remux(
    inputPath: string,
    config: MuxConfig,
    _onProgress?: ProgressCallback,
  ): Promise<void> {
    // Native addon call: avid_remux with progress callback
    // Progress is bridged via napi_threadsafe_function
    void inputPath;
    void config;
  }

  async transcode(
    inputPath: string,
    encodeConfig: EncodeConfig,
    _onProgress?: ProgressCallback,
  ): Promise<void> {
    // Native addon call: avid_transcode with progress callback
    void inputPath;
    void encodeConfig;
  }

  // ── Hardware Acceleration ─────────────────────────────────────────────

  async queryHWAccel(): Promise<HWAccelReport> {
    if (this.hwAccelReport) return this.hwAccelReport;
    const addon = this.requireAddon();
    this.hwAccelReport = addon.queryHwAccel();
    return this.hwAccelReport;
  }

  // ── Capabilities ──────────────────────────────────────────────────────

  getCapabilities(): CodecCapability[] {
    return FULL_CODEC_CAPABILITIES;
  }

  canDecode(codecId: string): boolean {
    const cap = FULL_CODEC_CAPABILITIES.find((c) => c.codecId === codecId);
    return cap ? cap.decodeTier !== 'unsupported' : false;
  }

  canEncode(codecId: string): boolean {
    const cap = FULL_CODEC_CAPABILITIES.find((c) => c.codecId === codecId);
    return cap ? cap.encodeTier !== 'unsupported' : false;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  getVersions(): CodecVersions {
    if (this.addon) {
      return this.addon.versions();
    }
    return { ffmpeg: 'not loaded', libraw: 'not loaded', openexr: 'not loaded' };
  }
}
