// =============================================================================
//  THE AVID — Main Process Codec Host
//  Runs in the Electron main process. Hosts the NativeCodecService and exposes
//  it to renderer processes via IPC handlers.
//
//  Usage in main.ts:
//    import { MainProcessCodecHost } from '@avid/media/electron/MainProcessCodecHost';
//    const codecHost = new MainProcessCodecHost();
//    await codecHost.init();
// =============================================================================

import { NativeCodecService } from '../NativeCodecService';
import { CodecIpcChannel } from './ipc-channels';
import type {
  DecodeConfig,
  EncodeConfig,
  ImageSeqConfig,
  RawDecodeConfig,
  MuxConfig,
} from '../types';

/**
 * Main process host for the native codec service.
 * Registers IPC handlers that the renderer process ElectronCodecBridge calls.
 *
 * Frame data is transferred as ArrayBuffer via Electron's structured clone,
 * which avoids JSON serialization overhead for large frame buffers.
 */
export class MainProcessCodecHost {
  private service = new NativeCodecService();

  /**
   * Initialize the native codec service and register all IPC handlers.
   * Call this once in the Electron main process during app.whenReady().
   */
  async init(): Promise<void> {
    await this.service.init();
    this.registerHandlers();
    console.log('[MainProcessCodecHost] Ready — native codecs available');
  }

  dispose(): void {
    this.service.dispose();
  }

  private registerHandlers(): void {
    // Require ipcMain at runtime — only available in Electron main process
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcMain } = require('electron');

    // ── Probe ───────────────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.PROBE,
      async (_event: unknown, filePath: string) => {
        return this.service.probe(filePath);
      },
    );

    // ── Decode Frame ────────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.DECODE_FRAME,
      async (
        _event: unknown,
        filePath: string,
        timestamp: number,
        config?: Partial<DecodeConfig>,
      ) => {
        return this.service.decodeFrame(filePath, timestamp, config);
      },
    );

    // ── Decode RAW ──────────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.DECODE_RAW,
      async (_event: unknown, filePath: string, config?: RawDecodeConfig) => {
        return this.service.decodeRaw(filePath, config);
      },
    );

    // ── Is RAW Supported ────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.IS_RAW_SUPPORTED,
      (_event: unknown, filePath: string) => {
        return this.service.isRawSupported(filePath);
      },
    );

    // ── Decode Image Sequence Frame ─────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.DECODE_IMAGE_SEQ_FRAME,
      async (_event: unknown, config: ImageSeqConfig, frameNumber: number) => {
        return this.service.decodeImageSequenceFrame(config, frameNumber);
      },
    );

    // ── Open Encode Session ─────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.OPEN_ENCODE_SESSION,
      async (_event: unknown, config: EncodeConfig) => {
        return this.service.openEncodeSession(config);
      },
    );

    // ── Write Video Frame ───────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.WRITE_VIDEO_FRAME,
      async (
        _event: unknown,
        sessionId: string,
        data: ArrayBuffer,
        width: number,
        height: number,
        pts: number,
      ) => {
        return this.service.writeVideoFrame(sessionId, data, width, height, pts);
      },
    );

    // ── Write Audio Samples ─────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.WRITE_AUDIO_SAMPLES,
      async (
        _event: unknown,
        sessionId: string,
        samples: Float32Array,
        channels: number,
        sampleRate: number,
      ) => {
        return this.service.writeAudioSamples(sessionId, samples, channels, sampleRate);
      },
    );

    // ── Finalize Encode ─────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.FINALIZE_ENCODE,
      async (_event: unknown, sessionId: string) => {
        return this.service.finalizeEncode(sessionId);
      },
    );

    // ── Remux ───────────────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.REMUX,
      async (_event: unknown, inputPath: string, config: MuxConfig) => {
        // Progress is sent via separate IPC event (not part of invoke return)
        return this.service.remux(inputPath, config);
      },
    );

    // ── Transcode ───────────────────────────────────────────────────────
    ipcMain.handle(
      CodecIpcChannel.TRANSCODE,
      async (
        event: { sender: { send: (channel: string, data: unknown) => void } },
        inputPath: string,
        encodeConfig: EncodeConfig,
      ) => {
        return this.service.transcode(inputPath, encodeConfig, (progress) => {
          // Send progress to renderer
          event.sender.send(CodecIpcChannel.TRANSCODE_PROGRESS, progress);
        });
      },
    );

    // ── HW Accel Query ──────────────────────────────────────────────────
    ipcMain.handle(CodecIpcChannel.QUERY_HW_ACCEL, async () => {
      return this.service.queryHWAccel();
    });

    // ── Capabilities ────────────────────────────────────────────────────
    ipcMain.handle(CodecIpcChannel.GET_CAPABILITIES, () => {
      return this.service.getCapabilities();
    });

    ipcMain.handle(
      CodecIpcChannel.CAN_DECODE,
      (_event: unknown, codecId: string) => {
        return this.service.canDecode(codecId);
      },
    );

    ipcMain.handle(
      CodecIpcChannel.CAN_ENCODE,
      (_event: unknown, codecId: string) => {
        return this.service.canEncode(codecId);
      },
    );

    // ── Diagnostics ─────────────────────────────────────────────────────
    ipcMain.handle(CodecIpcChannel.GET_VERSIONS, () => {
      return this.service.getVersions();
    });
  }
}
