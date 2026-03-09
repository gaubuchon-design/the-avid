// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Video I/O Bridge (Renderer Side)
// ═══════════════════════════════════════════════════════════════════════════
//
// Client-side bridge for communicating with professional video I/O hardware
// (DeckLink, AJA), streaming output (NDI, SRT), and deck control (Sony 9-pin)
// via the Electron preload API.
//
// This module provides typed wrappers around IPC calls and manages
// SharedArrayBuffer frame transport for zero-copy capture delivery.
//
// ═══════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────

interface IOResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface VideoDevice {
  id: string;
  name: string;
  vendor: 'blackmagic' | 'aja';
  supportsCapture: boolean;
  supportsPlayback: boolean;
  displayModes: DisplayMode[];
}

interface DisplayMode {
  name: string;
  width: number;
  height: number;
  frameRate: number;
  interlaced: boolean;
}

interface CaptureConfig {
  deviceId: string;
  displayMode: string;
  pixelFormat: string;
}

interface PlaybackConfig {
  deviceId: string;
  displayMode: string;
  pixelFormat: string;
}

interface StreamConfig {
  protocol: 'ndi' | 'srt';
  ndi?: {
    sourceName: string;
    groups?: string;
    clockVideo: boolean;
    clockAudio: boolean;
  };
  srt?: {
    host: string;
    port: number;
    mode: 'caller' | 'listener' | 'rendezvous';
    latency: number;
    passphrase?: string;
    maxBandwidth?: number;
    streamId?: string;
    payloadSize?: number;
  };
  videoCodec: 'h264' | 'hevc';
  videoBitrate: number;
  width: number;
  height: number;
  frameRate: number;
  audioEnabled: boolean;
  audioSampleRate: number;
  audioChannels: number;
}

interface StreamStats {
  protocol: 'ndi' | 'srt';
  state: 'idle' | 'connecting' | 'streaming' | 'error';
  framesSent: number;
  bytesSent: number;
  bitrate: number;
  rtt?: number;
  packetLoss?: number;
  uptime: number;
}

interface DeckTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  dropFrame: boolean;
}

interface DeckPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
}

type FrameCallback = (event: {
  deviceId: string;
  frameNumber: number;
  timecode: string;
}) => void;

type TimecodeCallback = (event: {
  deckId: string;
  timecode: DeckTimecode;
}) => void;

// ── Electron API access ───────────────────────────────────────────────────

function getAPI(): Record<string, (...args: unknown[]) => unknown> | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.electronAPI as Record<string, (...args: unknown[]) => unknown>) ?? null;
}

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const api = getAPI();
  if (!api) {
    return Promise.reject(new Error('Not running in Electron desktop'));
  }
  const fn = api[channel];
  if (typeof fn === 'function') {
    return fn(...args) as Promise<T>;
  }
  // Fall back to generic invoke pattern
  const invoker = api['invoke'];
  if (typeof invoker === 'function') {
    return invoker(channel, ...args) as Promise<T>;
  }
  return Promise.reject(new Error(`IPC channel not available: ${channel}`));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Video I/O Bridge
// ═══════════════════════════════════════════════════════════════════════════

export class VideoIOBridge {
  private frameCallbacks: FrameCallback[] = [];
  private isDesktop = getAPI() !== null;

  /**
   * Check if running in Electron with video I/O support.
   */
  get available(): boolean {
    return this.isDesktop;
  }

  /**
   * Check which video I/O hardware is available.
   */
  async checkAvailability(): Promise<{ deckLink: boolean; aja: boolean }> {
    if (!this.isDesktop) return { deckLink: false, aja: false };
    try {
      const result = await invoke<IOResult<{ deckLink: boolean; aja: boolean }>>('video-io:available');
      return result.data ?? { deckLink: false, aja: false };
    } catch {
      return { deckLink: false, aja: false };
    }
  }

  /**
   * Enumerate connected video I/O devices.
   */
  async enumerateDevices(): Promise<VideoDevice[]> {
    if (!this.isDesktop) return [];
    try {
      const result = await invoke<IOResult<VideoDevice[]>>('video-io:enumerate');
      return result.data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Start capture from a device.
   */
  async startCapture(config: CaptureConfig): Promise<IOResult> {
    return invoke<IOResult>('video-io:start-capture', config);
  }

  /**
   * Stop capture on a device.
   */
  async stopCapture(deviceId: string): Promise<IOResult> {
    return invoke<IOResult>('video-io:stop-capture', deviceId);
  }

  /**
   * Start playback to a device output.
   */
  async startPlayback(config: PlaybackConfig): Promise<IOResult> {
    return invoke<IOResult>('video-io:start-playback', config);
  }

  /**
   * Stop playback on a device.
   */
  async stopPlayback(deviceId: string): Promise<IOResult> {
    return invoke<IOResult>('video-io:stop-playback', deviceId);
  }

  /**
   * Register for frame available events from capture.
   */
  onFrameAvailable(cb: FrameCallback): () => void {
    this.frameCallbacks.push(cb);
    return () => {
      this.frameCallbacks = this.frameCallbacks.filter((c) => c !== cb);
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Streaming Bridge
// ═══════════════════════════════════════════════════════════════════════════

export class StreamingBridge {
  private isDesktop = getAPI() !== null;

  /**
   * Check streaming protocol availability.
   */
  async checkAvailability(): Promise<{ ndi: boolean; srt: boolean }> {
    if (!this.isDesktop) return { ndi: false, srt: false };
    try {
      const result = await invoke<IOResult<{ ndi: boolean; srt: boolean }>>('streaming:available');
      return result.data ?? { ndi: false, srt: false };
    } catch {
      return { ndi: false, srt: false };
    }
  }

  /**
   * Start NDI streaming output.
   */
  async startNDI(config: StreamConfig): Promise<IOResult<{ targetId: string }>> {
    return invoke<IOResult<{ targetId: string }>>('streaming:start-ndi', config);
  }

  /**
   * Start SRT streaming output.
   */
  async startSRT(config: StreamConfig): Promise<IOResult<{ targetId: string }>> {
    return invoke<IOResult<{ targetId: string }>>('streaming:start-srt', config);
  }

  /**
   * Stop a streaming target.
   */
  async stop(targetId: string): Promise<IOResult> {
    return invoke<IOResult>('streaming:stop', targetId);
  }

  /**
   * Stop all streaming targets.
   */
  async stopAll(): Promise<IOResult> {
    return invoke<IOResult>('streaming:stop-all');
  }

  /**
   * Get streaming statistics.
   */
  async getStats(): Promise<StreamStats[]> {
    try {
      const result = await invoke<IOResult<StreamStats[]>>('streaming:stats');
      return result.data ?? [];
    } catch {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Deck Control Bridge
// ═══════════════════════════════════════════════════════════════════════════

export class DeckControlBridge {
  private isDesktop = getAPI() !== null;
  private timecodeCallbacks: TimecodeCallback[] = [];

  /**
   * Check if deck control is available.
   */
  async checkAvailability(): Promise<boolean> {
    if (!this.isDesktop) return false;
    try {
      const result = await invoke<IOResult<boolean>>('deck:available');
      return result.data ?? false;
    } catch {
      return false;
    }
  }

  /**
   * List available serial ports.
   */
  async listPorts(): Promise<DeckPort[]> {
    if (!this.isDesktop) return [];
    try {
      const result = await invoke<IOResult<DeckPort[]>>('deck:list-ports');
      return result.data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Connect to a VTR.
   */
  async connect(portPath: string): Promise<IOResult<{ deckId: string }>> {
    return invoke<IOResult<{ deckId: string }>>('deck:connect', portPath);
  }

  /**
   * Disconnect a VTR.
   */
  async disconnect(deckId: string): Promise<IOResult> {
    return invoke<IOResult>('deck:disconnect', deckId);
  }

  /**
   * Send a transport command.
   */
  async command(
    deckId: string,
    cmd: 'play' | 'stop' | 'record' | 'ff' | 'rew' | 'pause' | 'eject',
  ): Promise<IOResult> {
    return invoke<IOResult>('deck:command', deckId, cmd);
  }

  /**
   * Jog at a given speed (-1.0 to +1.0).
   */
  async jog(deckId: string, speed: number): Promise<IOResult> {
    return invoke<IOResult>('deck:jog', deckId, speed);
  }

  /**
   * Shuttle at a given speed (-1.0 to +1.0).
   */
  async shuttle(deckId: string, speed: number): Promise<IOResult> {
    return invoke<IOResult>('deck:shuttle', deckId, speed);
  }

  /**
   * Request current timecode.
   */
  async getTimecode(deckId: string): Promise<DeckTimecode | null> {
    try {
      const result = await invoke<IOResult<DeckTimecode>>('deck:timecode', deckId);
      return result.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Cue to a specific timecode.
   */
  async goToTimecode(deckId: string, tc: DeckTimecode): Promise<IOResult> {
    return invoke<IOResult>('deck:go-to-tc', deckId, tc);
  }

  /**
   * Register for continuous timecode updates.
   */
  onTimecodeUpdate(cb: TimecodeCallback): () => void {
    this.timecodeCallbacks.push(cb);
    return () => {
      this.timecodeCallbacks = this.timecodeCallbacks.filter((c) => c !== cb);
    };
  }
}
