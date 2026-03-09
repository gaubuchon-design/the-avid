// ─── Partial Exporter ─────────────────────────────────────────────────────────
// SP-09: Export in/out region while editing continues. Re-export flag if
// exported region is revised. Auto-send to playout destination.

import type {
  PartialExport,
  PartialExportStatus,
  DeliveryTarget,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Simple hash for detecting timeline changes in the exported region.
 * In production, this would hash the actual timeline data (clips, effects, etc.).
 */
function computeRegionHash(inPoint: number, outPoint: number, salt: number): string {
  const raw = `${inPoint}:${outPoint}:${salt}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type PartialExportEvent =
  | { type: 'EXPORT_QUEUED'; exportItem: PartialExport }
  | { type: 'EXPORT_STARTED'; exportId: string }
  | { type: 'EXPORT_PROGRESS'; exportId: string; progress: number }
  | { type: 'EXPORT_COMPLETE'; exportId: string; outputPath: string }
  | { type: 'EXPORT_STALE'; exportId: string; reason: string }
  | { type: 'EXPORT_FAILED'; exportId: string; error: string }
  | { type: 'AUTO_SEND_STARTED'; exportId: string; targetName: string }
  | { type: 'AUTO_SEND_COMPLETE'; exportId: string; targetName: string }
  | { type: 'ERROR'; error: string };

export type PartialExportListener = (event: PartialExportEvent) => void;

// ─── Configuration ────────────────────────────────────────────────────────────

export interface PartialExporterConfig {
  outputDirectory: string;
  defaultFormat: string;
  defaultResolution: { width: number; height: number };
  defaultFrameRate: number;
  autoSendEnabled: boolean;
  autoReExportOnStale: boolean;
  staleCheckIntervalMs: number;
}

const DEFAULT_CONFIG: PartialExporterConfig = {
  outputDirectory: '/media/partial_exports/',
  defaultFormat: 'MXF OP-1a',
  defaultResolution: { width: 1920, height: 1080 },
  defaultFrameRate: 50,
  autoSendEnabled: true,
  autoReExportOnStale: false,
  staleCheckIntervalMs: 5000,
};

// ─── Partial Exporter ─────────────────────────────────────────────────────────

export class PartialExporter {
  private config: PartialExporterConfig;
  private exports: Map<string, PartialExport> = new Map();
  private listeners: Set<PartialExportListener> = new Set();
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private simulationTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private timelineVersion = 0;

  constructor(config: Partial<PartialExporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.staleCheckTimer) return;
    this.staleCheckTimer = setInterval(() => {
      this.checkForStaleExports();
    }, this.config.staleCheckIntervalMs);
  }

  stop(): void {
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
    for (const timer of this.simulationTimers.values()) {
      clearInterval(timer);
    }
    this.simulationTimers.clear();
  }

  destroy(): void {
    this.stop();
    this.exports.clear();
    this.listeners.clear();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Queue a partial export for a timeline region.
   */
  queueExport(
    name: string,
    inPoint: number,
    outPoint: number,
    options: {
      format?: string;
      resolution?: { width: number; height: number };
      frameRate?: number;
      deliveryTarget?: DeliveryTarget;
    } = {},
  ): string {
    const hash = computeRegionHash(inPoint, outPoint, this.timelineVersion);

    const exportItem: PartialExport = {
      id: createId('pexport'),
      name,
      inPoint,
      outPoint,
      status: 'PENDING',
      progress: 0,
      isStale: false,
      originalHash: hash,
      currentHash: hash,
      format: options.format ?? this.config.defaultFormat,
      resolution: options.resolution ?? this.config.defaultResolution,
      frameRate: options.frameRate ?? this.config.defaultFrameRate,
      deliveryTarget: options.deliveryTarget,
    };

    this.exports.set(exportItem.id, exportItem);
    this.emit({ type: 'EXPORT_QUEUED', exportItem });

    // Start the export process
    this.startExport(exportItem.id);

    return exportItem.id;
  }

  /**
   * Get all exports.
   */
  getAllExports(): PartialExport[] {
    return Array.from(this.exports.values()).sort(
      (a, b) => (b.exportedAt ?? '').localeCompare(a.exportedAt ?? ''),
    );
  }

  /**
   * Get a specific export.
   */
  getExport(id: string): PartialExport | null {
    return this.exports.get(id) ?? null;
  }

  /**
   * Get exports that are stale (timeline has changed since export).
   */
  getStaleExports(): PartialExport[] {
    return Array.from(this.exports.values()).filter((e) => e.isStale);
  }

  /**
   * Get exports currently in progress.
   */
  getActiveExports(): PartialExport[] {
    return Array.from(this.exports.values()).filter(
      (e) => e.status === 'PENDING' || e.status === 'EXPORTING',
    );
  }

  /**
   * Cancel an in-progress export.
   */
  cancelExport(id: string): boolean {
    const exportItem = this.exports.get(id);
    if (!exportItem) return false;
    if (exportItem.status !== 'PENDING' && exportItem.status !== 'EXPORTING') return false;

    exportItem.status = 'FAILED';
    const timer = this.simulationTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.simulationTimers.delete(id);
    }

    return true;
  }

  /**
   * Re-export a stale or completed export.
   */
  reExport(id: string): string | null {
    const original = this.exports.get(id);
    if (!original) return null;

    return this.queueExport(
      original.name,
      original.inPoint,
      original.outPoint,
      {
        format: original.format,
        resolution: original.resolution,
        frameRate: original.frameRate,
        deliveryTarget: original.deliveryTarget,
      },
    );
  }

  /**
   * Notify the exporter that the timeline has been modified.
   * This will mark any exports that overlap the modified region as stale.
   */
  notifyTimelineChange(changedStart: number, changedEnd: number): void {
    this.timelineVersion++;

    for (const exportItem of this.exports.values()) {
      if (exportItem.status !== 'COMPLETED') continue;

      // Check if the changed region overlaps this export
      const overlaps =
        changedStart < exportItem.outPoint && changedEnd > exportItem.inPoint;

      if (overlaps) {
        this.markStale(exportItem.id, 'Timeline modified in exported region');
      }
    }
  }

  /**
   * Notify the exporter that the entire timeline has been modified.
   */
  notifyFullTimelineChange(): void {
    this.timelineVersion++;

    for (const exportItem of this.exports.values()) {
      if (exportItem.status === 'COMPLETED' && !exportItem.isStale) {
        this.markStale(exportItem.id, 'Timeline modified');
      }
    }
  }

  /**
   * Remove an export from tracking.
   */
  removeExport(id: string): void {
    this.cancelExport(id);
    this.exports.delete(id);
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  on(listener: PartialExportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: PartialExportListener): void {
    this.listeners.delete(listener);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private emit(event: PartialExportEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors
      }
    }
  }

  private startExport(exportId: string): void {
    const exportItem = this.exports.get(exportId);
    if (!exportItem) return;

    exportItem.status = 'EXPORTING';
    this.emit({ type: 'EXPORT_STARTED', exportId });

    // Simulate export progress
    let progress = 0;
    const duration = exportItem.outPoint - exportItem.inPoint;
    const stepSize = Math.max(2, Math.min(10, 100 / (duration / 2)));

    const timer = setInterval(() => {
      progress += stepSize;

      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        this.simulationTimers.delete(exportId);
        this.completeExport(exportId);
      } else {
        exportItem.progress = progress;
        this.emit({ type: 'EXPORT_PROGRESS', exportId, progress });
      }
    }, 200);

    this.simulationTimers.set(exportId, timer);
  }

  private completeExport(exportId: string): void {
    const exportItem = this.exports.get(exportId);
    if (!exportItem) return;

    const outputPath = `${this.config.outputDirectory}${exportItem.name.replace(/\s+/g, '_')}_${exportId}.mxf`;

    exportItem.status = 'COMPLETED';
    exportItem.progress = 100;
    exportItem.outputPath = outputPath;
    exportItem.exportedAt = new Date().toISOString();

    this.emit({ type: 'EXPORT_COMPLETE', exportId, outputPath });

    // Auto-send to playout if configured
    if (this.config.autoSendEnabled && exportItem.deliveryTarget) {
      this.autoSend(exportId);
    }
  }

  private markStale(exportId: string, reason: string): void {
    const exportItem = this.exports.get(exportId);
    if (!exportItem) return;

    exportItem.isStale = true;
    exportItem.status = 'STALE';
    exportItem.currentHash = computeRegionHash(
      exportItem.inPoint,
      exportItem.outPoint,
      this.timelineVersion,
    );

    this.emit({ type: 'EXPORT_STALE', exportId, reason });

    if (this.config.autoReExportOnStale) {
      this.reExport(exportId);
    }
  }

  private async autoSend(exportId: string): Promise<void> {
    const exportItem = this.exports.get(exportId);
    if (!exportItem?.deliveryTarget || !exportItem.outputPath) return;

    const targetName = exportItem.deliveryTarget.name;
    this.emit({ type: 'AUTO_SEND_STARTED', exportId, targetName });

    // In production, this would initiate an FTP/SCP/API transfer to the playout server.
    // Simulate the transfer.
    setTimeout(() => {
      this.emit({ type: 'AUTO_SEND_COMPLETE', exportId, targetName });
    }, 1000);
  }

  private checkForStaleExports(): void {
    // In a production environment, this would compare current timeline state
    // hashes against the stored hashes for each completed export.
    // For the demo, staleness is detected via notifyTimelineChange().
  }
}

/**
 * Create a pre-configured PartialExporter for sports production.
 */
export function createPartialExporter(
  config: Partial<PartialExporterConfig> = {},
): PartialExporter {
  return new PartialExporter(config);
}
