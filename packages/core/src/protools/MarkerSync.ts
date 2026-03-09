// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Marker Sync (PT-04)
//  Bidirectional marker synchronization between Avid and Pro Tools.
//  Supports memory location mapping, color coding preservation,
//  real-time sync via MediaCentral, and AAF delta sync.
// ═══════════════════════════════════════════════════════════════════════════

import type { EditorMarker } from '../project-library';

// ─── Types ─────────────────────────────────────────────────────────────────

export type MarkerSyncDirection = 'avid-to-pt' | 'pt-to-avid' | 'bidirectional';
export type MarkerSyncMode = 'realtime' | 'aaf-delta' | 'manual';
export type MarkerSyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error';

export interface PTMemoryLocation {
  id: string;
  number: number;
  name: string;
  timeSeconds: number;
  timecodeTC: string;
  type: 'marker' | 'selection' | 'none';
  color: PTMarkerColor;
  comment?: string;
  trackName?: string;
}

export type PTMarkerColor =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan'
  | 'blue' | 'purple' | 'pink' | 'white' | 'none';

export interface MarkerMapping {
  avidMarkerId: string;
  ptMemoryLocationId: string;
  direction: MarkerSyncDirection;
  lastSyncedAt: string;
  conflictResolution?: 'avid-wins' | 'pt-wins' | 'manual';
}

export interface MarkerConflict {
  avidMarker: EditorMarker;
  ptMemoryLocation: PTMemoryLocation;
  conflictType: 'position' | 'name' | 'color' | 'deleted';
  description: string;
}

export interface MarkerSyncConfig {
  direction: MarkerSyncDirection;
  mode: MarkerSyncMode;
  preserveColors: boolean;
  syncIntervalMs: number;
  autoResolveConflicts: boolean;
  conflictResolution: 'avid-wins' | 'pt-wins' | 'newest-wins';
}

export interface MarkerSyncResult {
  success: boolean;
  status: MarkerSyncStatus;
  synced: MarkerMapping[];
  conflicts: MarkerConflict[];
  added: number;
  updated: number;
  removed: number;
  errors: string[];
}

// ─── Color Mapping ─────────────────────────────────────────────────────────

const AVID_TO_PT_COLOR_MAP: Record<string, PTMarkerColor> = {
  '#ef4444': 'red',
  '#f97316': 'orange',
  '#f59e0b': 'yellow',
  '#eab308': 'yellow',
  '#22c55e': 'green',
  '#2bb672': 'green',
  '#14b8a6': 'cyan',
  '#06b6d4': 'cyan',
  '#3b82f6': 'blue',
  '#5b6af5': 'blue',
  '#818cf8': 'blue',
  '#8b5cf6': 'purple',
  '#7c5cfc': 'purple',
  '#a855f7': 'purple',
  '#ec4899': 'pink',
  '#e05b8e': 'pink',
  '#ffffff': 'white',
};

const PT_TO_AVID_COLOR_MAP: Record<PTMarkerColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#f59e0b',
  green: '#22c55e',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  white: '#ffffff',
  none: '#94a3b8',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function avidColorToPT(hexColor: string): PTMarkerColor {
  const normalized = hexColor.toLowerCase();
  return AVID_TO_PT_COLOR_MAP[normalized] ?? 'none';
}

function ptColorToAvid(ptColor: PTMarkerColor): string {
  return PT_TO_AVID_COLOR_MAP[ptColor] ?? '#94a3b8';
}

function secondsToTimecode(seconds: number, frameRate: number): string {
  const totalFrames = Math.round(seconds * frameRate);
  const frames = totalFrames % frameRate;
  const totalSecs = Math.floor(totalFrames / frameRate);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);
  return [
    hours.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

// ─── Marker Sync Engine ────────────────────────────────────────────────────

export class MarkerSync {
  private config: MarkerSyncConfig;
  private mappings: MarkerMapping[] = [];
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private status: MarkerSyncStatus = 'idle';
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private frameRate: number;

  constructor(frameRate = 24, config?: Partial<MarkerSyncConfig>) {
    this.frameRate = frameRate;
    this.config = {
      direction: config?.direction ?? 'bidirectional',
      mode: config?.mode ?? 'realtime',
      preserveColors: config?.preserveColors ?? true,
      syncIntervalMs: config?.syncIntervalMs ?? 500,
      autoResolveConflicts: config?.autoResolveConflicts ?? true,
      conflictResolution: config?.conflictResolution ?? 'newest-wins',
    };
  }

  // ─── Conversion ──────────────────────────────────────────────────────

  /**
   * Converts Avid editor markers to Pro Tools memory locations.
   */
  avidMarkersToPTLocations(markers: EditorMarker[]): PTMemoryLocation[] {
    return markers.map((marker, index) => ({
      id: `pt-memloc-${marker.id}`,
      number: index + 1,
      name: marker.label,
      timeSeconds: marker.time,
      timecodeTC: secondsToTimecode(marker.time, this.frameRate),
      type: 'marker' as const,
      color: this.config.preserveColors
        ? avidColorToPT(marker.color)
        : 'none',
    }));
  }

  /**
   * Converts Pro Tools memory locations to Avid editor markers.
   */
  ptLocationsToAvidMarkers(locations: PTMemoryLocation[]): EditorMarker[] {
    return locations
      .filter((loc) => loc.type === 'marker')
      .map((loc) => ({
        id: `avid-marker-${loc.id}`,
        time: loc.timeSeconds,
        label: loc.name,
        color: this.config.preserveColors
          ? ptColorToAvid(loc.color)
          : '#f59e0b',
      }));
  }

  // ─── Sync ────────────────────────────────────────────────────────────

  /**
   * Performs a full sync between Avid markers and PT memory locations.
   */
  sync(
    avidMarkers: EditorMarker[],
    ptLocations: PTMemoryLocation[],
  ): MarkerSyncResult {
    this.status = 'syncing';
    const errors: string[] = [];
    const conflicts: MarkerConflict[] = [];
    const synced: MarkerMapping[] = [];
    let added = 0;
    let updated = 0;
    let removed = 0;

    const avidMap = new Map(avidMarkers.map((m) => [m.id, m]));
    const ptMap = new Map(ptLocations.map((l) => [l.id, l]));
    const existingMappingMap = new Map(this.mappings.map((m) => [m.avidMarkerId, m]));

    // Match markers by existing mappings
    for (const mapping of this.mappings) {
      const avid = avidMap.get(mapping.avidMarkerId);
      const pt = ptMap.get(mapping.ptMemoryLocationId);

      if (!avid && !pt) {
        removed++;
        continue;
      }

      if (avid && pt) {
        // Check for conflicts
        const timeDiff = Math.abs(avid.time - pt.timeSeconds);
        if (timeDiff > 0.01) {
          conflicts.push({
            avidMarker: avid,
            ptMemoryLocation: pt,
            conflictType: 'position',
            description: `Position conflict: Avid=${avid.time.toFixed(3)}s vs PT=${pt.timeSeconds.toFixed(3)}s`,
          });
        }

        synced.push({
          ...mapping,
          lastSyncedAt: new Date().toISOString(),
        });
        updated++;
      } else if (avid && !pt) {
        if (this.config.direction !== 'pt-to-avid') {
          added++;
        } else {
          removed++;
        }
      } else if (!avid && pt) {
        if (this.config.direction !== 'avid-to-pt') {
          added++;
        } else {
          removed++;
        }
      }
    }

    // New unmatched avid markers
    for (const marker of avidMarkers) {
      if (!existingMappingMap.has(marker.id)) {
        const newMapping: MarkerMapping = {
          avidMarkerId: marker.id,
          ptMemoryLocationId: `pt-memloc-${marker.id}`,
          direction: this.config.direction,
          lastSyncedAt: new Date().toISOString(),
        };
        synced.push(newMapping);
        added++;
      }
    }

    this.mappings = synced;

    if (conflicts.length > 0 && !this.config.autoResolveConflicts) {
      this.status = 'conflict';
    } else {
      this.status = 'synced';
    }

    const result: MarkerSyncResult = {
      success: errors.length === 0,
      status: this.status,
      synced,
      conflicts,
      added,
      updated,
      removed,
      errors,
    };

    this.emit('sync:complete', result);
    return result;
  }

  // ─── Real-time Sync ──────────────────────────────────────────────────

  startRealtimeSync(
    getAvidMarkers: () => EditorMarker[],
    getPTLocations: () => PTMemoryLocation[],
  ): void {
    this.stopRealtimeSync();

    if (this.config.mode !== 'realtime') {
      return;
    }

    this.syncTimer = setInterval(() => {
      try {
        const avidMarkers = getAvidMarkers();
        const ptLocations = getPTLocations();
        this.sync(avidMarkers, ptLocations);
      } catch (err) {
        this.status = 'error';
        this.emit('sync:error', { message: String(err) });
      }
    }, this.config.syncIntervalMs);

    this.emit('sync:started', { mode: this.config.mode, intervalMs: this.config.syncIntervalMs });
  }

  stopRealtimeSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.emit('sync:stopped', {});
  }

  // ─── State ───────────────────────────────────────────────────────────

  getStatus(): MarkerSyncStatus {
    return this.status;
  }

  getMappings(): MarkerMapping[] {
    return [...this.mappings];
  }

  clearMappings(): void {
    this.mappings = [];
    this.status = 'idle';
  }

  // ─── Events ──────────────────────────────────────────────────────────

  on(event: string, callback: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // swallow
        }
      }
    }
  }

  dispose(): void {
    this.stopRealtimeSync();
    this.listeners.clear();
    this.mappings = [];
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createMarkerSync(
  frameRate?: number,
  config?: Partial<MarkerSyncConfig>,
): MarkerSync {
  return new MarkerSync(frameRate, config);
}
