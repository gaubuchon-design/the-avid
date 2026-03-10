// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Unified Video I/O Manager
// ═══════════════════════════════════════════════════════════════════════════
//
// Manages all professional video I/O devices (DeckLink, AJA) through a
// unified interface. Handles device lifecycle, frame transport, and
// IPC bridge registration.
//
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, type BrowserWindow } from 'electron';
import { DeckLinkDevice } from './DeckLinkDevice';
import { AJADevice } from './AJADevice';
import { FrameTransport, createFrameTransport } from './FrameTransport';
import { BYTES_PER_PIXEL, calculateFrameSize } from './types';
import type {
  CaptureConfig,
  CapturedFrame,
  DeviceStatus,
  IOResult,
  PlaybackConfig,
  VideoDevice,
} from './types';

export class VideoIOManager {
  private deckLink = new DeckLinkDevice();
  private aja = new AJADevice();
  private frameTransports = new Map<string, FrameTransport>();
  private mainWindow: BrowserWindow | null = null;
  private initialized = false;

  /**
   * Initialize all video I/O subsystems.
   * Attempts to load native modules — failures are non-fatal.
   */
  async init(mainWindow: BrowserWindow): Promise<{
    deckLinkAvailable: boolean;
    ajaAvailable: boolean;
  }> {
    this.mainWindow = mainWindow;

    const [deckLinkAvailable, ajaAvailable] = await Promise.all([
      this.deckLink.init(),
      this.aja.init(),
    ]);

    this.initialized = true;
    console.log(
      `[VideoIO] Initialized — DeckLink: ${deckLinkAvailable ? 'available' : 'not available'}, ` +
      `AJA: ${ajaAvailable ? 'available' : 'not available'}`,
    );

    return { deckLinkAvailable, ajaAvailable };
  }

  /**
   * Enumerate all connected video I/O devices across all vendors.
   */
  async enumerateDevices(): Promise<VideoDevice[]> {
    const [deckLinkDevices, ajaDevices] = await Promise.all([
      this.deckLink.enumerate(),
      this.aja.enumerate(),
    ]);
    return [...deckLinkDevices, ...ajaDevices];
  }

  /**
   * Start capture from a specific device.
   */
  async startCapture(config: CaptureConfig): Promise<IOResult> {
    try {
      const device = this.getDeviceDriver(config.deviceId);

      // Create frame transport sized for the pixel format
      // Default to UHD (3840x2160) to accommodate any resolution up to 4K
      const bpp = BYTES_PER_PIXEL[config.pixelFormat] ?? 2;
      const transport = createFrameTransport(3840, 2160, bpp, 3);
      this.frameTransports.set(config.deviceId, transport);

      // Wire frame callback to transport
      device.onFrame((frame: CapturedFrame) => {
        const written = transport.writeFrame(
          new Uint8Array(frame.videoData),
          {
            width: frame.width,
            height: frame.height,
            frameNumber: frame.frameNumber,
            timestamp: frame.timestamp,
            timecode: frame.timecode,
          },
        );

        if (!written) {
          // Consumer is too slow — frame dropped
        }

        // Notify renderer of new frame via IPC event
        this.mainWindow?.webContents.send('video-io:frame-available', {
          deviceId: config.deviceId,
          frameNumber: frame.frameNumber,
          timecode: frame.timecode,
        });
      });

      await device.startCapture(config);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Stop capture on a device.
   */
  async stopCapture(deviceId: string): Promise<IOResult> {
    try {
      const device = this.getDeviceDriver(deviceId);
      await device.stopCapture();

      // Clean up transport
      const transport = this.frameTransports.get(deviceId);
      if (transport) {
        transport.reset();
        this.frameTransports.delete(deviceId);
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Start playback to a device output.
   */
  async startPlayback(config: PlaybackConfig): Promise<IOResult> {
    try {
      const device = this.getDeviceDriver(config.deviceId);
      await device.startPlayback(config);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Stop playback on a device.
   */
  async stopPlayback(deviceId: string): Promise<IOResult> {
    try {
      const device = this.getDeviceDriver(deviceId);
      await device.stopPlayback();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Send a rendered frame to a playback device.
   */
  async sendFrame(deviceId: string, frameData: Buffer): Promise<IOResult> {
    try {
      const device = this.getDeviceDriver(deviceId);
      await device.displayFrame(frameData);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Get status for a device.
   */
  getDeviceStatus(deviceId: string): IOResult<DeviceStatus> {
    try {
      const device = this.getDeviceDriver(deviceId);
      return { ok: true, data: device.getStatus() };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Get the SharedArrayBuffer for a device's frame transport.
   * The renderer uses this to read captured frames without IPC copy overhead.
   */
  getFrameTransportBuffer(deviceId: string): SharedArrayBuffer | null {
    return this.frameTransports.get(deviceId)?.getBuffer() ?? null;
  }

  /**
   * Register all IPC handlers for video I/O.
   */
  registerIPCHandlers(): void {
    ipcMain.handle('video-io:enumerate', async () => {
      try {
        const devices = await this.enumerateDevices();
        return { ok: true, data: devices };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    });

    ipcMain.handle('video-io:start-capture', async (_e, config: CaptureConfig) => {
      return this.startCapture(config);
    });

    ipcMain.handle('video-io:stop-capture', async (_e, deviceId: string) => {
      return this.stopCapture(deviceId);
    });

    ipcMain.handle('video-io:start-playback', async (_e, config: PlaybackConfig) => {
      return this.startPlayback(config);
    });

    ipcMain.handle('video-io:stop-playback', async (_e, deviceId: string) => {
      return this.stopPlayback(deviceId);
    });

    ipcMain.handle('video-io:send-frame', async (_e, deviceId: string, frameData: Buffer) => {
      return this.sendFrame(deviceId, frameData);
    });

    ipcMain.handle('video-io:device-status', async (_e, deviceId: string) => {
      return this.getDeviceStatus(deviceId);
    });

    ipcMain.handle('video-io:get-transport-buffer', (_e, deviceId: string) => {
      return this.getFrameTransportBuffer(deviceId);
    });

    ipcMain.handle('video-io:available', () => {
      return {
        ok: true,
        data: {
          deckLink: this.deckLink.isAvailable,
          aja: this.aja.isAvailable,
        },
      };
    });
  }

  /**
   * Clean up all devices and transports.
   */
  async dispose(): Promise<void> {
    await Promise.all([
      this.deckLink.dispose(),
      this.aja.dispose(),
    ]);

    for (const transport of this.frameTransports.values()) {
      transport.reset();
    }
    this.frameTransports.clear();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private getDeviceDriver(deviceId: string): DeckLinkDevice | AJADevice {
    if (deviceId.startsWith('decklink-')) return this.deckLink;
    if (deviceId.startsWith('aja-')) return this.aja;
    throw new Error(`Unknown device: ${deviceId}`);
  }
}
