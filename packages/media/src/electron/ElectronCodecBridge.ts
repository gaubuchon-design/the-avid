// =============================================================================
//  THE AVID — Electron Codec Bridge (Renderer Process)
//  Implements CodecService by forwarding all calls to the main process via IPC.
//  Runs in the Electron renderer process.
//
//  Usage in renderer:
//    import { ElectronCodecBridge } from '@avid/media/electron/ElectronCodecBridge';
//    const codecService = new ElectronCodecBridge();
//    await codecService.init();
// =============================================================================

import type { CodecService } from '../CodecService';
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
} from '../types';
import { CodecIpcChannel } from './ipc-channels';

/**
 * Get the Electron ipcRenderer from the preload-exposed API.
 * Expects contextBridge.exposeInMainWorld('electronCodec', { invoke, on, off }).
 */
function getIpc(): {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: (...args: unknown[]) => void) => void;
  off: (channel: string, listener: (...args: unknown[]) => void) => void;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = globalThis as any;
  if (w.electronCodec) return w.electronCodec;
  throw new Error(
    'ElectronCodecBridge: electronCodec not found on window. ' +
    'Ensure the preload script exposes it via contextBridge.',
  );
}

/**
 * Renderer-side codec service that bridges to the main process via Electron IPC.
 * All heavy codec work runs in the main process (native N-API addon).
 * Frame data is transferred as ArrayBuffer via structured clone (no JSON overhead).
 */
export class ElectronCodecBridge implements CodecService {
  readonly name = 'ElectronCodecBridge';
  readonly isNative = true; // Backed by native codecs in main process

  private capabilities: CodecCapability[] | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async init(): Promise<void> {
    const ipc = getIpc();
    await ipc.invoke(CodecIpcChannel.INIT);
    // Pre-fetch capabilities
    this.capabilities = (await ipc.invoke(
      CodecIpcChannel.GET_CAPABILITIES,
    )) as CodecCapability[];
    console.log('[ElectronCodecBridge] Connected to main process codec service');
  }

  dispose(): void {
    this.capabilities = null;
  }

  // ── Probe ─────────────────────────────────────────────────────────────

  async probe(filePath: string): Promise<ProbeResult> {
    const ipc = getIpc();
    return (await ipc.invoke(CodecIpcChannel.PROBE, filePath)) as ProbeResult;
  }

  // ── Decode ────────────────────────────────────────────────────────────

  async decodeFrame(
    filePath: string,
    timestamp: number,
    config?: Partial<DecodeConfig>,
  ): Promise<DecodedFrameData> {
    const ipc = getIpc();
    return (await ipc.invoke(
      CodecIpcChannel.DECODE_FRAME,
      filePath,
      timestamp,
      config,
    )) as DecodedFrameData;
  }

  async decodeRaw(
    filePath: string,
    config?: RawDecodeConfig,
  ): Promise<DecodedFrameData | null> {
    const ipc = getIpc();
    return (await ipc.invoke(
      CodecIpcChannel.DECODE_RAW,
      filePath,
      config,
    )) as DecodedFrameData | null;
  }

  isRawSupported(filePath: string): boolean {
    // Synchronous check — we cache capabilities from init()
    const rawFormats = (this.capabilities ?? [])
      .filter((c) => c.category === 'raw' && c.decodeTier !== 'unsupported');
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    return rawFormats.some((c) => c.extensions.includes(ext));
  }

  async decodeImageSequenceFrame(
    config: ImageSeqConfig,
    frameNumber: number,
  ): Promise<DecodedFrameData> {
    const ipc = getIpc();
    return (await ipc.invoke(
      CodecIpcChannel.DECODE_IMAGE_SEQ_FRAME,
      config,
      frameNumber,
    )) as DecodedFrameData;
  }

  // ── Encode ────────────────────────────────────────────────────────────

  async openEncodeSession(config: EncodeConfig): Promise<string> {
    const ipc = getIpc();
    return (await ipc.invoke(
      CodecIpcChannel.OPEN_ENCODE_SESSION,
      config,
    )) as string;
  }

  async writeVideoFrame(
    sessionId: string,
    data: ArrayBuffer,
    width: number,
    height: number,
    pts: number,
  ): Promise<void> {
    const ipc = getIpc();
    await ipc.invoke(
      CodecIpcChannel.WRITE_VIDEO_FRAME,
      sessionId,
      data,
      width,
      height,
      pts,
    );
  }

  async writeAudioSamples(
    sessionId: string,
    samples: Float32Array,
    channels: number,
    sampleRate: number,
  ): Promise<void> {
    const ipc = getIpc();
    await ipc.invoke(
      CodecIpcChannel.WRITE_AUDIO_SAMPLES,
      sessionId,
      samples,
      channels,
      sampleRate,
    );
  }

  async finalizeEncode(sessionId: string): Promise<void> {
    const ipc = getIpc();
    await ipc.invoke(CodecIpcChannel.FINALIZE_ENCODE, sessionId);
  }

  // ── Mux / Transcode ───────────────────────────────────────────────────

  async remux(
    inputPath: string,
    config: MuxConfig,
    _onProgress?: ProgressCallback,
  ): Promise<void> {
    const ipc = getIpc();
    await ipc.invoke(CodecIpcChannel.REMUX, inputPath, config);
  }

  async transcode(
    inputPath: string,
    encodeConfig: EncodeConfig,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const ipc = getIpc();

    // Listen for progress events from main process
    let progressListener: ((...args: unknown[]) => void) | null = null;
    if (onProgress) {
      progressListener = (...args: unknown[]) => {
        const progress = args[1] as {
          progress: number;
          framesDone: number;
          framesTotal: number;
          fps: number;
        };
        onProgress(progress);
      };
      ipc.on(CodecIpcChannel.TRANSCODE_PROGRESS, progressListener);
    }

    try {
      await ipc.invoke(
        CodecIpcChannel.TRANSCODE,
        inputPath,
        encodeConfig,
      );
    } finally {
      if (progressListener) {
        ipc.off(CodecIpcChannel.TRANSCODE_PROGRESS, progressListener);
      }
    }
  }

  // ── Hardware Acceleration ─────────────────────────────────────────────

  async queryHWAccel(): Promise<HWAccelReport> {
    const ipc = getIpc();
    return (await ipc.invoke(
      CodecIpcChannel.QUERY_HW_ACCEL,
    )) as HWAccelReport;
  }

  // ── Capabilities ──────────────────────────────────────────────────────

  getCapabilities(): CodecCapability[] {
    return this.capabilities ?? [];
  }

  canDecode(codecId: string): boolean {
    const cap = (this.capabilities ?? []).find((c) => c.codecId === codecId);
    return cap ? cap.decodeTier !== 'unsupported' : false;
  }

  canEncode(codecId: string): boolean {
    const cap = (this.capabilities ?? []).find((c) => c.codecId === codecId);
    return cap ? cap.encodeTier !== 'unsupported' : false;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────

  getVersions(): CodecVersions {
    // Cached from init or fetched synchronously
    return { ffmpeg: 'via IPC', libraw: 'via IPC', openexr: 'via IPC' };
  }
}
