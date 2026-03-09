// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- NDI Network Video Output
// ═══════════════════════════════════════════════════════════════════════════
//
// Sends video and audio frames over NDI protocol using the grandiose package
// (Streampunk/grandiose — native Node.js bindings to NewTek NDI SDK).
//
// NDI enables low-latency video transport over standard Ethernet.
//
// ═══════════════════════════════════════════════════════════════════════════

import type { NDIConfig } from './types';

interface GrandioseModule {
  find(opts?: { showLocalSources?: boolean; timeout?: number }): Promise<NDISource[]>;
  receive(opts: { source: NDISource }): Promise<NDIReceiver>;
  send?(opts: { name: string; groups?: string; clockVideo?: boolean; clockAudio?: boolean }): NDISenderHandle;
}

interface NDISource {
  name: string;
  urlAddress: string;
}

interface NDIReceiverInterface {
  video(): Promise<NDIVideoFrame>;
  audio(): Promise<NDIAudioFrame>;
  metadata(): Promise<{ data: string }>;
  data(): Promise<NDIVideoFrame | NDIAudioFrame>;
}

interface NDISenderHandle {
  video(frame: {
    xres: number;
    yres: number;
    frameRateN: number;
    frameRateD: number;
    fourCC: string;
    data: Buffer;
  }): void;
  audio(frame: {
    sampleRate: number;
    numChannels: number;
    numSamples: number;
    data: Buffer;
  }): void;
  destroy(): void;
}

interface NDIVideoFrame {
  type: 'video';
  xres: number;
  yres: number;
  frameRateN: number;
  frameRateD: number;
  timecode: number;
  video: Buffer;
}

interface NDIAudioFrame {
  type: 'audio';
  sampleRate: number;
  numChannels: number;
  numSamples: number;
  timecode: number;
  data: Buffer[];
}

export class NDISender {
  private grandiose: GrandioseModule | null = null;
  private sender: NDISenderHandle | null = null;
  private _isActive = false;
  private framesSent = 0;
  private bytesSent = 0;
  private startTime = 0;

  /**
   * Load the grandiose native module.
   */
  async loadModule(): Promise<boolean> {
    try {
      this.grandiose = await import('grandiose') as unknown as GrandioseModule;
      return true;
    } catch {
      console.warn('[NDI] grandiose module not available — NDI output disabled');
      return false;
    }
  }

  get isAvailable(): boolean {
    return this.grandiose !== null;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Initialize an NDI sender with the given configuration.
   */
  async init(config: NDIConfig): Promise<void> {
    if (!this.grandiose) throw new Error('NDI SDK not available');
    if (!this.grandiose.send) throw new Error('NDI sender not supported in this version of grandiose');

    this.sender = this.grandiose.send({
      name: config.sourceName,
      groups: config.groups,
      clockVideo: config.clockVideo,
      clockAudio: config.clockAudio,
    });

    this._isActive = true;
    this.framesSent = 0;
    this.bytesSent = 0;
    this.startTime = Date.now();
  }

  /**
   * Send a video frame over NDI.
   */
  sendVideoFrame(
    data: Buffer,
    width: number,
    height: number,
    frameRateNum: number,
    frameRateDen = 1,
  ): void {
    if (!this.sender || !this._isActive) return;

    this.sender.video({
      xres: width,
      yres: height,
      frameRateN: frameRateNum,
      frameRateD: frameRateDen,
      fourCC: 'UYVY',
      data,
    });

    this.framesSent++;
    this.bytesSent += data.length;
  }

  /**
   * Send audio samples over NDI.
   */
  sendAudioFrame(
    data: Buffer,
    sampleRate: number,
    channels: number,
    numSamples: number,
  ): void {
    if (!this.sender || !this._isActive) return;

    this.sender.audio({
      sampleRate,
      numChannels: channels,
      numSamples,
      data,
    });
  }

  /**
   * Get current streaming statistics.
   */
  getStats(): { framesSent: number; bytesSent: number; uptime: number } {
    return {
      framesSent: this.framesSent,
      bytesSent: this.bytesSent,
      uptime: this._isActive ? (Date.now() - this.startTime) / 1000 : 0,
    };
  }

  /**
   * Stop sending and clean up.
   */
  async dispose(): Promise<void> {
    this._isActive = false;
    if (this.sender) {
      try {
        this.sender.destroy();
      } catch {
        // Ignore
      }
      this.sender = null;
    }
  }
}

/**
 * NDI Receiver for discovering and receiving NDI sources.
 */
export class NDIReceiver {
  private grandiose: GrandioseModule | null = null;
  private receiver: NDIReceiverInterface | null = null;

  async loadModule(): Promise<boolean> {
    try {
      this.grandiose = await import('grandiose') as unknown as GrandioseModule;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Discover NDI sources on the network.
   */
  async findSources(timeoutMs = 2000): Promise<Array<{ name: string; url: string }>> {
    if (!this.grandiose) return [];

    try {
      const sources = await this.grandiose.find({
        showLocalSources: true,
        timeout: timeoutMs,
      });
      return sources.map((s) => ({ name: s.name, url: s.urlAddress }));
    } catch (err) {
      console.error('[NDI] Source discovery failed:', err);
      return [];
    }
  }

  async dispose(): Promise<void> {
    this.receiver = null;
  }
}
