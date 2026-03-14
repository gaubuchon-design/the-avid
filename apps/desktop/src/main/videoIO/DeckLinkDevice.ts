// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Blackmagic DeckLink Device Wrapper
// ═══════════════════════════════════════════════════════════════════════════
//
// Wraps the `macadam` npm package (Streampunk/macadam) to provide capture
// and playback via Blackmagic DeckLink hardware.
//
// This module runs exclusively in the Electron main process.
// Frame delivery to the renderer happens via FrameTransport (SharedArrayBuffer).
//
// ═══════════════════════════════════════════════════════════════════════════

import type {
  CaptureConfig,
  CapturedFrame,
  DeviceStatus,
  DisplayMode,
  PlaybackConfig,
  VideoDevice,
} from './types';

// Macadam types (loaded dynamically to avoid hard crash when not installed)
interface MacadamCapture {
  frame(): Promise<{ video: Buffer; audio?: Buffer; timecode?: string }>;
  stop(): void;
}

interface MacadamPlayback {
  start(): Promise<void>;
  displayFrame(video: Buffer, audio?: Buffer): Promise<void>;
  stop(): void;
}

interface MacadamModule {
  getDeviceInfo(): Promise<
    Array<{
      id: number;
      name: string;
      displayModes: Array<{
        name: string;
        width: number;
        height: number;
        frameRate: { numerator: number; denominator: number };
        interlaced: boolean;
      }>;
      supportsCapture: boolean;
      supportsPlayback: boolean;
    }>
  >;
  capture(config: Record<string, unknown>): MacadamCapture;
  playback(config: Record<string, unknown>): MacadamPlayback;
}

type FrameCallback = (frame: CapturedFrame) => void;

export class DeckLinkDevice {
  private macadam: MacadamModule | null = null;
  private activeCapture: MacadamCapture | null = null;
  private activePlayback: MacadamPlayback | null = null;
  private captureRunning = false;
  private frameCallbacks: Set<FrameCallback> = new Set();
  private frameCount = 0;
  private droppedFrames = 0;
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
   * Attempt to load the macadam native module.
   * Returns false if DeckLink SDK is not installed.
   */
  async init(): Promise<boolean> {
    try {
      // Keep the DeckLink binding optional so CI/package builds still succeed
      // when the native addon is not installed on the host machine.
      const moduleId = 'macadam';
      this.macadam = (await import(/* @vite-ignore */ moduleId)) as unknown as MacadamModule;
      return true;
    } catch {
      console.warn('[DeckLink] macadam module not available — DeckLink support disabled');
      this.macadam = null;
      return false;
    }
  }

  /** Check if DeckLink SDK is available */
  get isAvailable(): boolean {
    return this.macadam !== null;
  }

  /**
   * Enumerate all connected DeckLink devices.
   */
  async enumerate(): Promise<VideoDevice[]> {
    if (!this.macadam) return [];

    try {
      const devices = await this.macadam.getDeviceInfo();
      return devices.map((dev, index) => ({
        id: `decklink-${index}`,
        name: dev.name,
        vendor: 'blackmagic' as const,
        model: dev.name,
        index,
        supportsCapture: dev.supportsCapture,
        supportsPlayback: dev.supportsPlayback,
        displayModes: dev.displayModes.map((mode, modeIdx) => ({
          id: `bmd-mode-${modeIdx}`,
          name: mode.name,
          width: mode.width,
          height: mode.height,
          frameRateNum: mode.frameRate.numerator,
          frameRateDen: mode.frameRate.denominator,
          interlaced: mode.interlaced,
          pixelFormats: ['8BitYUV', '10BitYUV', '8BitBGRA'] as DisplayMode['pixelFormats'],
        })),
        isActive: false,
      }));
    } catch (err) {
      console.error('[DeckLink] Failed to enumerate devices:', err);
      return [];
    }
  }

  /**
   * Start capturing frames from a DeckLink device.
   */
  async startCapture(config: CaptureConfig): Promise<void> {
    if (!this.macadam) throw new Error('DeckLink SDK not available');
    if (this.captureRunning) throw new Error('Capture already running');

    const macadamConfig: Record<string, unknown> = {
      deviceIndex: this.extractDeviceIndex(config.deviceId),
      displayMode: config.displayModeId,
      pixelFormat: this.mapPixelFormat(config.pixelFormat),
    };

    if (config.audioChannels > 0) {
      macadamConfig['channels'] = config.audioChannels;
      macadamConfig['sampleRate'] = 48000;
      macadamConfig['sampleType'] = config.audioBitDepth;
    }

    this.activeCapture = this.macadam.capture(macadamConfig);
    this.captureRunning = true;
    this.frameCount = 0;
    this.droppedFrames = 0;
    // Resolution will be detected from the first received frame
    this.status = {
      deviceId: config.deviceId,
      state: 'capturing',
      signalDetected: true,
      framesProcessed: 0,
      droppedFrames: 0,
    };

    // Start frame pump
    this.pumpFrames(config);
  }

  /**
   * Stop the active capture session.
   */
  async stopCapture(): Promise<void> {
    this.captureRunning = false;
    if (this.activeCapture) {
      try {
        this.activeCapture.stop();
      } catch {
        // Ignore stop errors
      }
      this.activeCapture = null;
    }
    this.status.state = 'idle';
  }

  /**
   * Start playback to a DeckLink output.
   */
  async startPlayback(config: PlaybackConfig): Promise<void> {
    if (!this.macadam) throw new Error('DeckLink SDK not available');

    const macadamConfig: Record<string, unknown> = {
      deviceIndex: this.extractDeviceIndex(config.deviceId),
      displayMode: config.displayModeId,
      pixelFormat: this.mapPixelFormat(config.pixelFormat),
    };

    this.activePlayback = this.macadam.playback(macadamConfig);
    await this.activePlayback.start();
    this.status = {
      deviceId: config.deviceId,
      state: 'playing',
      signalDetected: true,
      framesProcessed: 0,
      droppedFrames: 0,
    };
  }

  /**
   * Send a frame to the playback output.
   */
  async displayFrame(videoData: Buffer, audioData?: Buffer): Promise<void> {
    if (!this.activePlayback) throw new Error('Playback not started');
    await this.activePlayback.displayFrame(videoData, audioData);
    this.frameCount++;
    this.status.framesProcessed = this.frameCount;
  }

  /**
   * Stop playback.
   */
  async stopPlayback(): Promise<void> {
    if (this.activePlayback) {
      try {
        this.activePlayback.stop();
      } catch {
        // Ignore
      }
      this.activePlayback = null;
    }
    this.status.state = 'idle';
  }

  /**
   * Register a callback for captured frames.
   */
  onFrame(callback: FrameCallback): () => void {
    this.frameCallbacks.add(callback);
    return () => {
      this.frameCallbacks.delete(callback);
    };
  }

  /** Get current device status */
  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  /** Clean up all resources */
  async dispose(): Promise<void> {
    await this.stopCapture();
    await this.stopPlayback();
    this.frameCallbacks.clear();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async pumpFrames(config: CaptureConfig): Promise<void> {
    while (this.captureRunning && this.activeCapture) {
      try {
        const rawFrame = await this.activeCapture.frame();
        this.frameCount++;
        this.status.framesProcessed = this.frameCount;
        this.status.signalDetected = true;

        // Detect resolution from frame data on first frame using the pixel format's bytes-per-pixel
        // For UYVY (8BitYUV): 2 bytes per pixel, so width = bytesPerRow / 2
        if (this.frameCount === 1 && rawFrame.video.length > 0) {
          const bpp =
            config.pixelFormat === '8BitBGRA' ? 4 : config.pixelFormat === '10BitRGB' ? 4 : 2;
          // Common resolutions to match against
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
          bytesPerRow:
            this.captureHeight > 0
              ? rawFrame.video.length / this.captureHeight
              : rawFrame.video.length,
          timecode: rawFrame.timecode || '00:00:00:00',
          frameNumber: this.frameCount,
          timestamp: performance.now(),
          videoData: rawFrame.video.buffer.slice(
            rawFrame.video.byteOffset,
            rawFrame.video.byteOffset + rawFrame.video.byteLength
          ),
          audioData: rawFrame.audio?.buffer.slice(
            rawFrame.audio.byteOffset,
            rawFrame.audio.byteOffset + rawFrame.audio.byteLength
          ) as ArrayBuffer | undefined,
          audioChannels: config.audioChannels,
          audioSampleRate: 48000,
          dropFrame: false,
        };

        for (const cb of this.frameCallbacks) {
          try {
            cb(frame);
          } catch {
            // Don't let callback errors stop the capture loop
          }
        }
      } catch (err) {
        if (this.captureRunning) {
          this.droppedFrames++;
          this.status.droppedFrames = this.droppedFrames;
          console.warn('[DeckLink] Frame capture error:', err);
        }
      }
    }
  }

  private extractDeviceIndex(deviceId: string): number {
    const match = deviceId.match(/decklink-(\d+)/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  private mapPixelFormat(format: string): string {
    const map: Record<string, string> = {
      '8BitYUV': 'bmdFormat8BitYUV',
      '10BitYUV': 'bmdFormat10BitYUV',
      '8BitBGRA': 'bmdFormat8BitBGRA',
      '10BitRGB': 'bmdFormat10BitRGB',
      '12BitRGB': 'bmdFormat12BitRGB',
    };
    return map[format] || 'bmdFormat8BitYUV';
  }
}
