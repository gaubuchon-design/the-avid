// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Unified Stream Manager
// ═══════════════════════════════════════════════════════════════════════════
//
// Manages NDI and SRT streaming outputs with a unified interface.
// Handles encoding pipeline configuration and IPC bridge registration.
//
// ═══════════════════════════════════════════════════════════════════════════

import { ipcMain, type BrowserWindow } from 'electron';
import { NDISender } from './NDISender';
import { SRTOutput } from './SRTOutput';
import type { StreamConfig, StreamStats, StreamTarget } from './types';

export class StreamManager {
  private ndiSender = new NDISender();
  private srtOutput = new SRTOutput();
  private activeTargets = new Map<string, StreamTarget>();
  private mainWindow: BrowserWindow | null = null;
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private targetIdCounter = 0;

  /**
   * Initialize streaming subsystems.
   * Loads native modules — failures are non-fatal.
   */
  async init(mainWindow: BrowserWindow): Promise<{
    ndiAvailable: boolean;
    srtAvailable: boolean;
  }> {
    this.mainWindow = mainWindow;

    const [ndiAvailable, srtAvailable] = await Promise.all([
      this.ndiSender.loadModule(),
      this.srtOutput.loadModule(),
    ]);

    console.log(
      `[StreamManager] Initialized — NDI: ${ndiAvailable ? 'available' : 'not available'}, ` +
      `SRT: ${srtAvailable ? 'available' : 'not available'}`,
    );

    return { ndiAvailable, srtAvailable };
  }

  /**
   * Start an NDI stream output.
   */
  async startNDI(config: StreamConfig): Promise<{ ok: boolean; targetId?: string; error?: string }> {
    if (!this.ndiSender.isAvailable) {
      return { ok: false, error: 'NDI SDK not available' };
    }
    if (!config.ndi) {
      return { ok: false, error: 'NDI configuration required' };
    }

    try {
      await this.ndiSender.init(config.ndi);
      const targetId = `ndi-${++this.targetIdCounter}`;

      this.activeTargets.set(targetId, {
        id: targetId,
        protocol: 'ndi',
        name: config.ndi.sourceName,
        config,
        stats: this.createDefaultStats('ndi'),
      });

      this.ensureStatsPolling();
      return { ok: true, targetId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Start an SRT stream output.
   */
  async startSRT(config: StreamConfig): Promise<{ ok: boolean; targetId?: string; error?: string }> {
    if (!this.srtOutput.isAvailable) {
      return { ok: false, error: 'SRT library not available' };
    }
    if (!config.srt) {
      return { ok: false, error: 'SRT configuration required' };
    }

    try {
      await this.srtOutput.connect(config.srt);
      const targetId = `srt-${++this.targetIdCounter}`;

      this.activeTargets.set(targetId, {
        id: targetId,
        protocol: 'srt',
        name: `${config.srt.host}:${config.srt.port}`,
        config,
        stats: this.createDefaultStats('srt'),
      });

      this.ensureStatsPolling();
      return { ok: true, targetId };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Stop a specific streaming target.
   */
  async stop(targetId: string): Promise<{ ok: boolean; error?: string }> {
    const target = this.activeTargets.get(targetId);
    if (!target) {
      return { ok: false, error: `Unknown target: ${targetId}` };
    }

    try {
      if (target.protocol === 'ndi') {
        await this.ndiSender.dispose();
      } else {
        await this.srtOutput.disconnect();
      }

      this.activeTargets.delete(targetId);

      if (this.activeTargets.size === 0) {
        this.stopStatsPolling();
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Stop all streaming targets.
   */
  async stopAll(): Promise<void> {
    const ids = [...this.activeTargets.keys()];
    await Promise.allSettled(ids.map((id) => this.stop(id)));
  }

  /**
   * Send a video frame to all active NDI targets.
   */
  sendVideoFrame(data: Buffer, width: number, height: number, fps: number): void {
    if (this.ndiSender.isActive) {
      this.ndiSender.sendVideoFrame(data, width, height, fps);
    }
  }

  /**
   * Send audio samples to all active NDI targets.
   */
  sendAudioFrame(data: Buffer, sampleRate: number, channels: number, numSamples: number): void {
    if (this.ndiSender.isActive) {
      this.ndiSender.sendAudioFrame(data, sampleRate, channels, numSamples);
    }
  }

  /**
   * Write raw data to all active SRT targets.
   */
  async sendSRTData(data: Buffer): Promise<number> {
    if (this.srtOutput.isConnected) {
      return this.srtOutput.write(data);
    }
    return 0;
  }

  /**
   * Get stats for all active targets.
   */
  async getStats(): Promise<StreamStats[]> {
    const results: StreamStats[] = [];

    for (const target of this.activeTargets.values()) {
      if (target.protocol === 'ndi') {
        const ndiStats = this.ndiSender.getStats();
        results.push({
          protocol: 'ndi',
          state: this.ndiSender.isActive ? 'streaming' : 'idle',
          framesSent: ndiStats.framesSent,
          bytesSent: ndiStats.bytesSent,
          bitrate: ndiStats.uptime > 0
            ? Math.round((ndiStats.bytesSent * 8) / (ndiStats.uptime * 1000))
            : 0,
          uptime: ndiStats.uptime,
        });
      } else {
        const srtStats = await this.srtOutput.getStats();
        results.push({
          protocol: 'srt',
          state: this.srtOutput.isConnected ? 'streaming' : 'idle',
          framesSent: 0,
          bytesSent: srtStats.bytesSent,
          bitrate: srtStats.uptime > 0
            ? Math.round((srtStats.bytesSent * 8) / (srtStats.uptime * 1000))
            : 0,
          rtt: srtStats.rtt,
          packetLoss: srtStats.packetLoss,
          uptime: srtStats.uptime,
        });
      }
    }

    return results;
  }

  /**
   * Get list of active targets.
   */
  getActiveTargets(): StreamTarget[] {
    return [...this.activeTargets.values()];
  }

  /**
   * Register all IPC handlers for streaming.
   */
  registerIPCHandlers(): void {
    ipcMain.handle('streaming:available', () => ({
      ok: true,
      data: {
        ndi: this.ndiSender.isAvailable,
        srt: this.srtOutput.isAvailable,
      },
    }));

    ipcMain.handle('streaming:start-ndi', async (_e, config: StreamConfig) => {
      return this.startNDI(config);
    });

    ipcMain.handle('streaming:start-srt', async (_e, config: StreamConfig) => {
      return this.startSRT(config);
    });

    ipcMain.handle('streaming:stop', async (_e, targetId: string) => {
      return this.stop(targetId);
    });

    ipcMain.handle('streaming:stop-all', async () => {
      await this.stopAll();
      return { ok: true };
    });

    ipcMain.handle('streaming:stats', async () => {
      try {
        const stats = await this.getStats();
        return { ok: true, data: stats };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    });

    ipcMain.handle('streaming:targets', () => ({
      ok: true,
      data: this.getActiveTargets(),
    }));
  }

  /**
   * Clean up all resources.
   */
  async dispose(): Promise<void> {
    await this.stopAll();
    this.stopStatsPolling();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private createDefaultStats(protocol: 'ndi' | 'srt'): StreamStats {
    return {
      protocol,
      state: 'idle',
      framesSent: 0,
      bytesSent: 0,
      bitrate: 0,
      uptime: 0,
    };
  }

  private ensureStatsPolling(): void {
    if (this.statsInterval) return;

    this.statsInterval = setInterval(async () => {
      try {
        const stats = await this.getStats();
        this.mainWindow?.webContents.send('streaming:stats-update', stats);
      } catch {
        // Stats polling is best-effort
      }
    }, 1000);
  }

  private stopStatsPolling(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }
}
