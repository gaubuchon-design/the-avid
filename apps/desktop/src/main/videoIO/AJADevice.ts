// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- AJA Video Systems Device Wrapper
// ═══════════════════════════════════════════════════════════════════════════
//
// Skeleton wrapper for AJA capture cards (Corvid, KONA, Io series).
// AJA does not provide official Node.js bindings — this requires a custom
// N-API native addon built against the AJA NTV2 SDK.
//
// Until the native addon is built, all methods throw an error indicating
// the AJA SDK is not installed.
//
// ═══════════════════════════════════════════════════════════════════════════

import type {
  CaptureConfig,
  CapturedFrame,
  DeviceStatus,
  PlaybackConfig,
  VideoDevice,
} from './types';

type FrameCallback = (frame: CapturedFrame) => void;

/**
 * AJA NTV2 native addon interface.
 * This must be compiled from the AJA NTV2 SDK using node-gyp/cmake-js.
 */
interface AJANativeModule {
  enumerate(): Array<{
    index: number;
    name: string;
    model: string;
    serialNumber: string;
    firmwareVersion: string;
    supportsCapture: boolean;
    supportsPlayback: boolean;
    numVideoInputs: number;
    numVideoOutputs: number;
  }>;
  openDevice(index: number): AJADeviceHandle;
}

interface AJADeviceHandle {
  startCapture(config: Record<string, unknown>): void;
  stopCapture(): void;
  startPlayback(config: Record<string, unknown>): void;
  stopPlayback(): void;
  sendFrame(buffer: Buffer): void;
  getFrame(): { video: Buffer; audio?: Buffer; timecode?: string } | null;
  close(): void;
}

export class AJADevice {
  private native: AJANativeModule | null = null;
  private activeHandle: AJADeviceHandle | null = null;
  private captureRunning = false;
  private frameCallbacks: Set<FrameCallback> = new Set();
  private frameCount = 0;
  private captureWidth = 1920;
  private captureHeight = 1080;
  private status: DeviceStatus = {
    deviceId: '',
    state: 'idle',
    signalDetected: false,
    framesProcessed: 0,
    droppedFrames: 0,
  };

  /**
   * Attempt to load the AJA native addon.
   * Returns false if the AJA SDK native module is not installed.
   */
  async init(): Promise<boolean> {
    try {
      // Try to load the native addon
      // This would be a compiled .node file from the AJA NTV2 SDK
      this.native = await import('aja-ntv2') as unknown as AJANativeModule;
      return true;
    } catch {
      console.warn('[AJA] aja-ntv2 native module not available — AJA support disabled');
      console.warn('[AJA] To enable: install AJA NTV2 SDK, build native addon, npm install aja-ntv2');
      this.native = null;
      return false;
    }
  }

  /** Check if AJA SDK is available */
  get isAvailable(): boolean {
    return this.native !== null;
  }

  /**
   * Enumerate all connected AJA devices.
   */
  async enumerate(): Promise<VideoDevice[]> {
    if (!this.native) return [];

    try {
      const devices = this.native.enumerate();
      return devices.map((dev) => ({
        id: `aja-${dev.index}`,
        name: dev.name,
        vendor: 'aja' as const,
        model: dev.model,
        index: dev.index,
        supportsCapture: dev.supportsCapture,
        supportsPlayback: dev.supportsPlayback,
        displayModes: [
          // AJA devices support most standard modes — enumerate from SDK
          { id: 'aja-1080i50', name: '1080i 50', width: 1920, height: 1080, frameRateNum: 25, frameRateDen: 1, interlaced: true, pixelFormats: ['8BitYUV', '10BitYUV'] as const },
          { id: 'aja-1080p25', name: '1080p 25', width: 1920, height: 1080, frameRateNum: 25, frameRateDen: 1, interlaced: false, pixelFormats: ['8BitYUV', '10BitYUV'] as const },
          { id: 'aja-1080p2997', name: '1080p 29.97', width: 1920, height: 1080, frameRateNum: 30000, frameRateDen: 1001, interlaced: false, pixelFormats: ['8BitYUV', '10BitYUV'] as const },
          { id: 'aja-1080p30', name: '1080p 30', width: 1920, height: 1080, frameRateNum: 30, frameRateDen: 1, interlaced: false, pixelFormats: ['8BitYUV', '10BitYUV'] as const },
          { id: 'aja-2160p2997', name: '2160p 29.97', width: 3840, height: 2160, frameRateNum: 30000, frameRateDen: 1001, interlaced: false, pixelFormats: ['8BitYUV', '10BitYUV'] as const },
          { id: 'aja-2160p5994', name: '2160p 59.94', width: 3840, height: 2160, frameRateNum: 60000, frameRateDen: 1001, interlaced: false, pixelFormats: ['8BitYUV', '10BitYUV'] as const },
        ],
        isActive: false,
      }));
    } catch (err) {
      console.error('[AJA] Failed to enumerate devices:', err);
      return [];
    }
  }

  async startCapture(config: CaptureConfig): Promise<void> {
    if (!this.native) throw new Error('AJA SDK not available');
    if (this.captureRunning) throw new Error('Capture already running');

    const deviceIndex = this.extractDeviceIndex(config.deviceId);
    this.activeHandle = this.native.openDevice(deviceIndex);
    this.activeHandle.startCapture({
      displayMode: config.displayModeId,
      pixelFormat: config.pixelFormat,
      audioChannels: config.audioChannels,
    });

    this.captureRunning = true;
    this.frameCount = 0;
    this.status = {
      deviceId: config.deviceId,
      state: 'capturing',
      signalDetected: true,
      framesProcessed: 0,
      droppedFrames: 0,
    };

    this.pumpFrames(config);
  }

  async stopCapture(): Promise<void> {
    this.captureRunning = false;
    if (this.activeHandle) {
      try {
        this.activeHandle.stopCapture();
        this.activeHandle.close();
      } catch {
        // Ignore
      }
      this.activeHandle = null;
    }
    this.status.state = 'idle';
  }

  async startPlayback(config: PlaybackConfig): Promise<void> {
    if (!this.native) throw new Error('AJA SDK not available');

    const deviceIndex = this.extractDeviceIndex(config.deviceId);
    this.activeHandle = this.native.openDevice(deviceIndex);
    this.activeHandle.startPlayback({
      displayMode: config.displayModeId,
      pixelFormat: config.pixelFormat,
      audioChannels: config.audioChannels,
    });
    this.status = {
      deviceId: config.deviceId,
      state: 'playing',
      signalDetected: true,
      framesProcessed: 0,
      droppedFrames: 0,
    };
  }

  async displayFrame(videoData: Buffer): Promise<void> {
    if (!this.activeHandle) throw new Error('Playback not started');
    this.activeHandle.sendFrame(videoData);
    this.frameCount++;
    this.status.framesProcessed = this.frameCount;
  }

  async stopPlayback(): Promise<void> {
    if (this.activeHandle) {
      try {
        this.activeHandle.stopPlayback();
        this.activeHandle.close();
      } catch {
        // Ignore
      }
      this.activeHandle = null;
    }
    this.status.state = 'idle';
  }

  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback);
    return () => { this.frameCallbacks.delete(callback); };
  }

  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  async dispose(): Promise<void> {
    await this.stopCapture();
    await this.stopPlayback();
    this.frameCallbacks.clear();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async pumpFrames(config: CaptureConfig): Promise<void> {
    while (this.captureRunning && this.activeHandle) {
      try {
        const rawFrame = this.activeHandle.getFrame();
        if (!rawFrame) {
          await new Promise((r) => setTimeout(r, 1));
          continue;
        }

        this.frameCount++;
        this.status.framesProcessed = this.frameCount;

        // Detect resolution from frame data on first frame
        if (this.frameCount === 1 && rawFrame.video.length > 0) {
          const bpp = config.pixelFormat === '8BitBGRA' ? 4 : config.pixelFormat === '10BitRGB' ? 4 : 2;
          const knownHeights = [480, 576, 720, 1080, 2160];
          for (const h of knownHeights) {
            const rowBytes = rawFrame.video.length / h;
            const w = Math.round(rowBytes / bpp);
            if (Number.isInteger(rawFrame.video.length / h) && w > 0 && w <= 7680) {
              this.captureWidth = w;
              this.captureHeight = h;
              break;
            }
          }
        }

        const frame: CapturedFrame = {
          width: this.captureWidth,
          height: this.captureHeight,
          pixelFormat: config.pixelFormat,
          bytesPerRow: this.captureHeight > 0 ? rawFrame.video.length / this.captureHeight : rawFrame.video.length,
          timecode: rawFrame.timecode || '00:00:00:00',
          frameNumber: this.frameCount,
          timestamp: performance.now(),
          videoData: rawFrame.video.buffer.slice(
            rawFrame.video.byteOffset,
            rawFrame.video.byteOffset + rawFrame.video.byteLength,
          ),
          audioData: rawFrame.audio?.buffer.slice(
            rawFrame.audio.byteOffset,
            rawFrame.audio.byteOffset + rawFrame.audio.byteLength,
          ),
          audioChannels: config.audioChannels,
          audioSampleRate: 48000,
          dropFrame: false,
        };

        for (const cb of this.frameCallbacks) {
          try { cb(frame); } catch { /* ignore */ }
        }
      } catch {
        if (this.captureRunning) {
          this.status.droppedFrames++;
        }
      }
    }
  }

  private extractDeviceIndex(deviceId: string): number {
    const match = deviceId.match(/aja-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
