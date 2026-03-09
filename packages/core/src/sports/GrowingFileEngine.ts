// ─── Growing File Engine ──────────────────────────────────────────────────────
// SP-02: Monitor files being written by capture servers (EVS, BlackMagic, etc.).
// Supports GXF (EVS native), MXF OP-1a, and MP4 progressive files over
// local, NFS, or SMB mount paths. Targets <500ms latency from write to
// timeline availability.

import type { GrowingFileState, GrowingFileFormat } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimecode(frames: number, fps: number): string {
  const totalSeconds = Math.floor(frames / fps);
  const f = frames % fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':') + ':' + String(f).padStart(2, '0');
}

function detectFormat(filePath: string): GrowingFileFormat {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'gxf') return 'GXF';
  if (ext === 'mxf') return 'MXF_OP1A';
  return 'MP4_PROGRESSIVE';
}

function estimateFrameRate(format: GrowingFileFormat): number {
  switch (format) {
    case 'GXF': return 50;
    case 'MXF_OP1A': return 29.97;
    case 'MP4_PROGRESSIVE': return 59.94;
  }
}

// ─── Event Emitter ────────────────────────────────────────────────────────────

export type GrowingFileEvent =
  | { type: 'FILE_DETECTED'; file: GrowingFileState }
  | { type: 'DURATION_EXTENDED'; fileId: string; newDuration: number; latencyMs: number }
  | { type: 'FILE_CLOSED'; fileId: string; finalDuration: number }
  | { type: 'LATENCY_WARNING'; fileId: string; latencyMs: number }
  | { type: 'ERROR'; fileId: string; error: string };

export type GrowingFileListener = (event: GrowingFileEvent) => void;

// ─── Engine ───────────────────────────────────────────────────────────────────

export interface GrowingFileEngineConfig {
  pollIntervalMs: number;
  latencyThresholdMs: number;
  maxConcurrentFiles: number;
  watchPaths: string[];
  supportedFormats: GrowingFileFormat[];
}

const DEFAULT_CONFIG: GrowingFileEngineConfig = {
  pollIntervalMs: 100,
  latencyThresholdMs: 500,
  maxConcurrentFiles: 16,
  watchPaths: [],
  supportedFormats: ['GXF', 'MXF_OP1A', 'MP4_PROGRESSIVE'],
};

export class GrowingFileEngine {
  private config: GrowingFileEngineConfig;
  private files: Map<string, GrowingFileState> = new Map();
  private listeners: Set<GrowingFileListener> = new Set();
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isRunning = false;
  private watchTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<GrowingFileEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // In a production environment, this would use fs.watch / chokidar.
    // For the browser-based demo, we simulate with polling.
    this.watchTimer = setInterval(() => {
      this.pollWatchPaths();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    this.isRunning = false;
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    for (const timer of this.pollTimers.values()) {
      clearInterval(timer);
    }
    this.pollTimers.clear();
  }

  destroy(): void {
    this.stop();
    this.files.clear();
    this.listeners.clear();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  addWatchPath(path: string): void {
    if (!this.config.watchPaths.includes(path)) {
      this.config.watchPaths.push(path);
    }
  }

  removeWatchPath(path: string): void {
    this.config.watchPaths = this.config.watchPaths.filter((p) => p !== path);
  }

  getActiveFiles(): GrowingFileState[] {
    return Array.from(this.files.values()).filter((f) => f.isGrowing);
  }

  getAllFiles(): GrowingFileState[] {
    return Array.from(this.files.values());
  }

  getFile(fileId: string): GrowingFileState | null {
    return this.files.get(fileId) ?? null;
  }

  getLatency(fileId: string): number {
    const file = this.files.get(fileId);
    return file?.latencyMs ?? -1;
  }

  isFileGrowing(fileId: string): boolean {
    return this.files.get(fileId)?.isGrowing ?? false;
  }

  /**
   * Register a growing file manually (e.g., from EVS server notification).
   * Returns the assigned file ID.
   */
  registerFile(filePath: string, options: Partial<Pick<GrowingFileState, 'format' | 'frameRate' | 'resolution' | 'startTimecode' | 'serverName'>> = {}): string {
    if (this.files.size >= this.config.maxConcurrentFiles) {
      const oldest = this.getOldestClosedFile();
      if (oldest) {
        this.files.delete(oldest.id);
      }
    }

    const format = options.format ?? detectFormat(filePath);
    const frameRate = options.frameRate ?? estimateFrameRate(format);
    const now = Date.now();

    const state: GrowingFileState = {
      id: createId('gf'),
      filePath,
      currentDuration: 0,
      isGrowing: true,
      lastFrameTime: now,
      latencyMs: 0,
      format,
      frameRate,
      resolution: options.resolution ?? { width: 1920, height: 1080 },
      startTimecode: options.startTimecode ?? formatTimecode(0, frameRate),
      bytesWritten: 0,
      serverName: options.serverName,
    };

    this.files.set(state.id, state);
    this.emit({ type: 'FILE_DETECTED', file: { ...state } });
    this.startPollingFile(state.id);

    return state.id;
  }

  /**
   * Simulate frame arrival for a growing file (called by file watcher or EVS connector).
   */
  extendFile(fileId: string, newDuration: number, bytesWritten?: number): void {
    const file = this.files.get(fileId);
    if (!file || !file.isGrowing) return;

    const now = Date.now();
    const latencyMs = now - file.lastFrameTime;

    file.currentDuration = newDuration;
    file.lastFrameTime = now;
    file.latencyMs = latencyMs;
    if (bytesWritten !== undefined) {
      file.bytesWritten = bytesWritten;
    }

    this.emit({
      type: 'DURATION_EXTENDED',
      fileId,
      newDuration,
      latencyMs,
    });

    if (latencyMs > this.config.latencyThresholdMs) {
      this.emit({
        type: 'LATENCY_WARNING',
        fileId,
        latencyMs,
      });
    }
  }

  /**
   * Mark a file as no longer growing (recording stopped or file closed).
   */
  closeFile(fileId: string): void {
    const file = this.files.get(fileId);
    if (!file) return;

    file.isGrowing = false;
    this.stopPollingFile(fileId);
    this.emit({
      type: 'FILE_CLOSED',
      fileId,
      finalDuration: file.currentDuration,
    });
  }

  /**
   * Report an error for a growing file.
   */
  reportError(fileId: string, error: string): void {
    const file = this.files.get(fileId);
    if (file) {
      file.error = error;
      file.isGrowing = false;
    }
    this.stopPollingFile(fileId);
    this.emit({ type: 'ERROR', fileId, error });
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: GrowingFileListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: GrowingFileListener): void {
    this.listeners.delete(listener);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: GrowingFileEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors should not crash the engine.
      }
    }
  }

  private pollWatchPaths(): void {
    // In production, this would stat files via fs.stat and detect new/changed files.
    // For the browser demo pipeline, growing files are registered via registerFile().
  }

  private startPollingFile(fileId: string): void {
    if (this.pollTimers.has(fileId)) return;

    const timer = setInterval(() => {
      const file = this.files.get(fileId);
      if (!file || !file.isGrowing) {
        this.stopPollingFile(fileId);
        return;
      }

      // Check for stalled file (no update for 5 seconds)
      const stalledMs = Date.now() - file.lastFrameTime;
      if (stalledMs > 5000) {
        this.reportError(fileId, `File stalled: no new data for ${Math.round(stalledMs / 1000)}s`);
      }
    }, this.config.pollIntervalMs * 10);

    this.pollTimers.set(fileId, timer);
  }

  private stopPollingFile(fileId: string): void {
    const timer = this.pollTimers.get(fileId);
    if (timer) {
      clearInterval(timer);
      this.pollTimers.delete(fileId);
    }
  }

  private getOldestClosedFile(): GrowingFileState | null {
    let oldest: GrowingFileState | null = null;
    let oldestTime = Infinity;
    for (const file of this.files.values()) {
      if (!file.isGrowing && file.lastFrameTime < oldestTime) {
        oldest = file;
        oldestTime = file.lastFrameTime;
      }
    }
    return oldest;
  }
}

/**
 * Create a pre-configured GrowingFileEngine for sports production.
 */
export function createGrowingFileEngine(
  watchPaths: string[] = [],
  options: Partial<GrowingFileEngineConfig> = {},
): GrowingFileEngine {
  return new GrowingFileEngine({
    watchPaths,
    pollIntervalMs: 100,
    latencyThresholdMs: 500,
    maxConcurrentFiles: 16,
    ...options,
  });
}
