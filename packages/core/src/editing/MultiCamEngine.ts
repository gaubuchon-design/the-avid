// =============================================================================
//  THE AVID -- FT-04: Multi-Camera Sync Engine
// =============================================================================
//
//  Manages multi-camera groups: syncing by timecode, audio waveform, or
//  manual slate; switching angles during playback; and providing grid-view
//  monitoring data for up to 16 angles.
// =============================================================================

import type {
  EditorMediaAsset,
  EditorClip,
  EditorTrack,
} from '../project-library';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of angles per multi-cam group. */
export const MAX_MULTICAM_ANGLES = 16;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Method used to sync multi-cam angles. */
export type MultiCamSyncMethod = 'timecode' | 'waveform' | 'manual_slate' | 'marker';

/** Status of a multi-cam group. */
export type MultiCamGroupStatus = 'syncing' | 'ready' | 'error' | 'editing';

/** A single angle in a multi-cam group. */
export interface MultiCamAngle {
  /** Unique angle identifier. */
  id: string;
  /** Display label (e.g. 'Camera A', 'ISO 2'). */
  label: string;
  /** The media asset backing this angle. */
  assetId: string;
  /** Asset name for display. */
  assetName: string;
  /** Sync offset in seconds relative to the group start. */
  syncOffsetSeconds: number;
  /** Whether this angle is enabled for switching. */
  enabled: boolean;
  /** Audio channel assignment for this angle. */
  audioChannel: number;
  /** Color for grid-view border highlight. */
  color: string;
  /** Thumbnail URL for grid view. */
  thumbnailUrl?: string;
  /** Duration of the source media in seconds. */
  durationSeconds?: number;
  /** Source timecode start (if available). */
  timecodeStart?: string;
  /** Waveform peaks for audio sync visualization. */
  waveformPeaks?: number[];
}

/** A multi-cam group containing synced angles. */
export interface MultiCamGroup {
  /** Unique group identifier. */
  id: string;
  /** Display name. */
  name: string;
  /** Sync method used. */
  syncMethod: MultiCamSyncMethod;
  /** Current status. */
  status: MultiCamGroupStatus;
  /** Angles in this group (up to MAX_MULTICAM_ANGLES). */
  angles: MultiCamAngle[];
  /** Index of the currently active angle. */
  activeAngleIndex: number;
  /** Group duration in seconds (determined by the longest angle). */
  durationSeconds: number;
  /** Current playback position in seconds. */
  playheadSeconds: number;
  /** Whether the group is in live-switch mode. */
  isLiveSwitching: boolean;
  /** Audio follows video, or is locked to a specific angle. */
  audioFollowsVideo: boolean;
  /** If audio is locked, which angle index provides audio. */
  audioAngleIndex: number;
  /** Creation timestamp. */
  createdAt: string;
}

/** A recorded angle switch event during playback. */
export interface MultiCamSwitchEvent {
  /** Time on the multicam timeline in seconds. */
  timeSeconds: number;
  /** The angle index that was switched to. */
  angleIndex: number;
  /** The angle label. */
  angleLabel: string;
  /** Duration of this angle segment in seconds (until next switch). */
  durationSeconds: number;
}

/** An edit produced from a multi-cam switch session. */
export interface MultiCamEdit {
  /** The multicam group ID. */
  groupId: string;
  /** Ordered list of switch events. */
  switches: MultiCamSwitchEvent[];
  /** Total duration. */
  totalDuration: number;
  /** Whether this has been committed to the timeline. */
  committed: boolean;
}

/** Grid layout configuration for the multi-cam monitor. */
export interface MultiCamGridLayout {
  /** Number of columns. */
  columns: number;
  /** Number of rows. */
  rows: number;
  /** Cell dimensions. */
  cellWidth: number;
  cellHeight: number;
  /** Gap between cells. */
  gap: number;
}

/** Options for creating a multi-cam group. */
export interface MultiCamCreateOptions {
  name: string;
  syncMethod: MultiCamSyncMethod;
  assets: Array<{
    assetId: string;
    assetName: string;
    label?: string;
    timecodeStart?: string;
    durationSeconds?: number;
    waveformPeaks?: number[];
    thumbnailUrl?: string;
  }>;
  /** Manual sync offsets (only for manual_slate method). */
  manualOffsets?: Record<string, number>;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class MultiCamError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'TOO_MANY_ANGLES'
      | 'NO_ANGLES'
      | 'SYNC_FAILED'
      | 'INVALID_ANGLE'
      | 'NOT_READY'
      | 'ALREADY_SWITCHING',
  ) {
    super(message);
    this.name = 'MultiCamError';
  }
}

// ─── Angle colors ───────────────────────────────────────────────────────────

const ANGLE_COLORS = [
  '#4f63f5', '#25a865', '#e05b8e', '#e8943a',
  '#7c5cfc', '#2bb672', '#c94f84', '#d4873a',
  '#5bbfc7', '#818cf8', '#f59e0b', '#ef4444',
  '#0ea5e9', '#4ade80', '#6bc5e3', '#a78bfa',
];

// ─── Helper: generate ID ────────────────────────────────────────────────────

function generateId(prefix: string): string {
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto?.randomUUID) {
    return `${prefix}-${(globalThis as any).crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── MultiCamEngine ─────────────────────────────────────────────────────────

/**
 * Manages multi-camera groups, synchronization, angle switching, and
 * conversion of switch sessions into timeline edits.
 *
 * Usage:
 * ```ts
 * const engine = new MultiCamEngine();
 * const group = engine.createGroup({
 *   name: 'Scene 1 Multicam',
 *   syncMethod: 'timecode',
 *   assets: [...],
 * });
 * engine.startLiveSwitch(group.id);
 * engine.switchAngle(group.id, 2);
 * const edit = engine.stopLiveSwitch(group.id);
 * const tracks = engine.commitToTimeline(edit);
 * ```
 */
export class MultiCamEngine {
  private groups: Map<string, MultiCamGroup> = new Map();
  private edits: Map<string, MultiCamEdit> = new Map();
  private switchHistory: Map<string, MultiCamSwitchEvent[]> = new Map();
  private switchStartTime: Map<string, number> = new Map();
  private listeners = new Set<() => void>();

  // ── Group management ────────────────────────────────────────────────────

  /**
   * Create a new multi-cam group from a set of media assets.
   */
  createGroup(options: MultiCamCreateOptions): MultiCamGroup {
    if (options.assets.length === 0) {
      throw new MultiCamError('At least one angle is required', 'NO_ANGLES');
    }
    if (options.assets.length > MAX_MULTICAM_ANGLES) {
      throw new MultiCamError(
        `Maximum ${MAX_MULTICAM_ANGLES} angles allowed`,
        'TOO_MANY_ANGLES',
      );
    }

    const groupId = generateId('mcg');
    const angles: MultiCamAngle[] = options.assets.map((asset, idx) => {
      const offset = options.syncMethod === 'manual_slate'
        ? (options.manualOffsets?.[asset.assetId] ?? 0)
        : this.calculateSyncOffset(asset, options.syncMethod, idx);

      return {
        id: generateId('mca'),
        label: asset.label ?? `Camera ${String.fromCharCode(65 + idx)}`,
        assetId: asset.assetId,
        assetName: asset.assetName,
        syncOffsetSeconds: offset,
        enabled: true,
        audioChannel: idx,
        color: ANGLE_COLORS[idx % ANGLE_COLORS.length],
        thumbnailUrl: asset.thumbnailUrl,
        durationSeconds: asset.durationSeconds,
        timecodeStart: asset.timecodeStart,
        waveformPeaks: asset.waveformPeaks,
      };
    });

    const duration = Math.max(
      ...angles.map((a) => (a.durationSeconds ?? 0) + a.syncOffsetSeconds),
      0,
    );

    const group: MultiCamGroup = {
      id: groupId,
      name: options.name,
      syncMethod: options.syncMethod,
      status: 'ready',
      angles,
      activeAngleIndex: 0,
      durationSeconds: duration,
      playheadSeconds: 0,
      isLiveSwitching: false,
      audioFollowsVideo: true,
      audioAngleIndex: 0,
      createdAt: new Date().toISOString(),
    };

    this.groups.set(groupId, group);
    this.notify();
    return { ...group };
  }

  /**
   * Get a multi-cam group by ID.
   */
  getGroup(groupId: string): MultiCamGroup | undefined {
    const group = this.groups.get(groupId);
    return group ? { ...group, angles: group.angles.map((a) => ({ ...a })) } : undefined;
  }

  /**
   * Get all multi-cam groups.
   */
  getAllGroups(): MultiCamGroup[] {
    return Array.from(this.groups.values()).map((g) => ({
      ...g,
      angles: g.angles.map((a) => ({ ...a })),
    }));
  }

  /**
   * Remove a multi-cam group.
   */
  removeGroup(groupId: string): void {
    this.groups.delete(groupId);
    this.edits.delete(groupId);
    this.switchHistory.delete(groupId);
    this.switchStartTime.delete(groupId);
    this.notify();
  }

  /**
   * Add an angle to an existing group.
   */
  addAngle(groupId: string, asset: {
    assetId: string;
    assetName: string;
    label?: string;
    durationSeconds?: number;
    timecodeStart?: string;
    thumbnailUrl?: string;
    waveformPeaks?: number[];
  }): MultiCamAngle {
    const group = this.groups.get(groupId);
    if (!group) throw new MultiCamError('Group not found', 'INVALID_ANGLE');
    if (group.angles.length >= MAX_MULTICAM_ANGLES) {
      throw new MultiCamError(`Maximum ${MAX_MULTICAM_ANGLES} angles reached`, 'TOO_MANY_ANGLES');
    }

    const idx = group.angles.length;
    const angle: MultiCamAngle = {
      id: generateId('mca'),
      label: asset.label ?? `Camera ${String.fromCharCode(65 + idx)}`,
      assetId: asset.assetId,
      assetName: asset.assetName,
      syncOffsetSeconds: 0,
      enabled: true,
      audioChannel: idx,
      color: ANGLE_COLORS[idx % ANGLE_COLORS.length],
      thumbnailUrl: asset.thumbnailUrl,
      durationSeconds: asset.durationSeconds,
      timecodeStart: asset.timecodeStart,
      waveformPeaks: asset.waveformPeaks,
    };

    group.angles.push(angle);
    group.durationSeconds = Math.max(
      group.durationSeconds,
      (angle.durationSeconds ?? 0) + angle.syncOffsetSeconds,
    );
    this.notify();
    return { ...angle };
  }

  /**
   * Remove an angle from a group.
   */
  removeAngle(groupId: string, angleId: string): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.angles = group.angles.filter((a) => a.id !== angleId);
    if (group.activeAngleIndex >= group.angles.length) {
      group.activeAngleIndex = Math.max(0, group.angles.length - 1);
    }
    this.notify();
  }

  /**
   * Set the sync offset for an angle.
   */
  setAngleOffset(groupId: string, angleId: string, offsetSeconds: number): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    const angle = group.angles.find((a) => a.id === angleId);
    if (angle) {
      angle.syncOffsetSeconds = offsetSeconds;
      group.durationSeconds = Math.max(
        ...group.angles.map((a) => (a.durationSeconds ?? 0) + a.syncOffsetSeconds),
        0,
      );
      this.notify();
    }
  }

  // ── Angle switching ─────────────────────────────────────────────────────

  /**
   * Switch to a specific angle (by index).
   */
  switchAngle(groupId: string, angleIndex: number): void {
    const group = this.groups.get(groupId);
    if (!group) throw new MultiCamError('Group not found', 'INVALID_ANGLE');
    if (angleIndex < 0 || angleIndex >= group.angles.length) {
      throw new MultiCamError(`Invalid angle index: ${angleIndex}`, 'INVALID_ANGLE');
    }
    if (!group.angles[angleIndex].enabled) {
      throw new MultiCamError(`Angle ${angleIndex} is disabled`, 'INVALID_ANGLE');
    }

    const prevIndex = group.activeAngleIndex;
    group.activeAngleIndex = angleIndex;

    // Record switch event during live switching
    if (group.isLiveSwitching) {
      const history = this.switchHistory.get(groupId) ?? [];
      const lastEvent = history.length > 0 ? history[history.length - 1] : null;

      if (lastEvent) {
        lastEvent.durationSeconds = group.playheadSeconds - lastEvent.timeSeconds;
      }

      history.push({
        timeSeconds: group.playheadSeconds,
        angleIndex,
        angleLabel: group.angles[angleIndex].label,
        durationSeconds: 0, // Will be calculated on next switch or stop
      });

      this.switchHistory.set(groupId, history);
    }

    if (group.audioFollowsVideo) {
      group.audioAngleIndex = angleIndex;
    }

    this.notify();
  }

  /**
   * Start live-switch recording mode.
   */
  startLiveSwitch(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) throw new MultiCamError('Group not found', 'NOT_READY');
    if (group.status !== 'ready' && group.status !== 'editing') {
      throw new MultiCamError('Group is not ready for live switching', 'NOT_READY');
    }
    if (group.isLiveSwitching) {
      throw new MultiCamError('Already in live-switch mode', 'ALREADY_SWITCHING');
    }

    group.isLiveSwitching = true;
    group.status = 'editing';
    this.switchHistory.set(groupId, [{
      timeSeconds: group.playheadSeconds,
      angleIndex: group.activeAngleIndex,
      angleLabel: group.angles[group.activeAngleIndex].label,
      durationSeconds: 0,
    }]);
    this.switchStartTime.set(groupId, group.playheadSeconds);
    this.notify();
  }

  /**
   * Stop live-switch recording and produce an edit.
   */
  stopLiveSwitch(groupId: string): MultiCamEdit {
    const group = this.groups.get(groupId);
    if (!group) throw new MultiCamError('Group not found', 'NOT_READY');

    group.isLiveSwitching = false;
    group.status = 'ready';

    const history = this.switchHistory.get(groupId) ?? [];

    // Close the last event's duration
    if (history.length > 0) {
      const last = history[history.length - 1];
      last.durationSeconds = group.playheadSeconds - last.timeSeconds;
    }

    // Remove zero-duration events at the end
    const cleanedHistory = history.filter((e) => e.durationSeconds > 0 || history.indexOf(e) === 0);

    const totalDuration = cleanedHistory.reduce((sum, e) => sum + e.durationSeconds, 0);

    const edit: MultiCamEdit = {
      groupId,
      switches: cleanedHistory,
      totalDuration,
      committed: false,
    };

    this.edits.set(groupId, edit);
    this.notify();
    return { ...edit, switches: cleanedHistory.map((s) => ({ ...s })) };
  }

  /**
   * Update the playhead position for a group.
   */
  setPlayhead(groupId: string, seconds: number): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.playheadSeconds = Math.max(0, Math.min(seconds, group.durationSeconds));
    this.notify();
  }

  /**
   * Set audio source mode.
   */
  setAudioMode(groupId: string, followsVideo: boolean, audioAngleIndex?: number): void {
    const group = this.groups.get(groupId);
    if (!group) return;
    group.audioFollowsVideo = followsVideo;
    if (!followsVideo && audioAngleIndex !== undefined) {
      group.audioAngleIndex = audioAngleIndex;
    }
    this.notify();
  }

  // ── Timeline integration ────────────────────────────────────────────────

  /**
   * Convert a multi-cam edit into timeline tracks and clips.
   */
  commitToTimeline(edit: MultiCamEdit): {
    videoTrack: { name: string; clips: Array<Omit<EditorClip, 'id' | 'trackId'>> };
    audioTrack: { name: string; clips: Array<Omit<EditorClip, 'id' | 'trackId'>> };
  } {
    const group = this.groups.get(edit.groupId);
    if (!group) throw new MultiCamError('Group not found', 'NOT_READY');

    const videoClips: Array<Omit<EditorClip, 'id' | 'trackId'>> = [];
    const audioClips: Array<Omit<EditorClip, 'id' | 'trackId'>> = [];

    for (const sw of edit.switches) {
      if (sw.durationSeconds <= 0) continue;
      const angle = group.angles[sw.angleIndex];
      if (!angle) continue;

      // Calculate source offset accounting for sync
      const sourceStart = sw.timeSeconds - angle.syncOffsetSeconds;

      videoClips.push({
        name: `${group.name} - ${angle.label}`,
        startTime: sw.timeSeconds,
        endTime: sw.timeSeconds + sw.durationSeconds,
        trimStart: Math.max(0, sourceStart),
        trimEnd: 0,
        type: 'video',
        assetId: angle.assetId,
        color: angle.color,
      });

      // Audio clip (might come from a different angle if audio is locked)
      const audioAngle = group.audioFollowsVideo ? angle : group.angles[group.audioAngleIndex];
      if (audioAngle) {
        const audioSourceStart = sw.timeSeconds - audioAngle.syncOffsetSeconds;
        audioClips.push({
          name: `${group.name} - ${audioAngle.label} (Audio)`,
          startTime: sw.timeSeconds,
          endTime: sw.timeSeconds + sw.durationSeconds,
          trimStart: Math.max(0, audioSourceStart),
          trimEnd: 0,
          type: 'audio',
          assetId: audioAngle.assetId,
        });
      }
    }

    edit.committed = true;
    this.edits.set(edit.groupId, edit);
    this.notify();

    return {
      videoTrack: { name: `${group.name} - Video`, clips: videoClips },
      audioTrack: { name: `${group.name} - Audio`, clips: audioClips },
    };
  }

  // ── Grid layout ─────────────────────────────────────────────────────────

  /**
   * Calculate optimal grid layout for a given number of angles and viewport.
   */
  getGridLayout(angleCount: number, viewportWidth: number, viewportHeight: number, gap = 4): MultiCamGridLayout {
    const count = Math.max(1, Math.min(angleCount, MAX_MULTICAM_ANGLES));

    // Determine optimal grid dimensions
    let cols: number;
    let rows: number;

    if (count <= 1) { cols = 1; rows = 1; }
    else if (count <= 4) { cols = 2; rows = 2; }
    else if (count <= 6) { cols = 3; rows = 2; }
    else if (count <= 9) { cols = 3; rows = 3; }
    else if (count <= 12) { cols = 4; rows = 3; }
    else { cols = 4; rows = 4; }

    const cellWidth = Math.floor((viewportWidth - gap * (cols + 1)) / cols);
    const cellHeight = Math.floor((viewportHeight - gap * (rows + 1)) / rows);

    return { columns: cols, rows, cellWidth, cellHeight, gap };
  }

  // ── Subscriptions ───────────────────────────────────────────────────────

  /**
   * Subscribe to engine state changes.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  // ── Private sync helpers ────────────────────────────────────────────────

  private calculateSyncOffset(
    asset: { timecodeStart?: string; waveformPeaks?: number[] },
    method: MultiCamSyncMethod,
    index: number,
  ): number {
    if (method === 'timecode' && asset.timecodeStart) {
      return this.parseTimecodeToSeconds(asset.timecodeStart);
    }

    if (method === 'waveform' && asset.waveformPeaks) {
      // In a real implementation this would do cross-correlation.
      // For now, return 0 (aligned) or a small deterministic offset.
      return 0;
    }

    // Marker or fallback: no offset
    return 0;
  }

  private parseTimecodeToSeconds(tc: string): number {
    const match = tc.match(/^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/);
    if (!match) return 0;
    const [, h, m, s, f] = match.map(Number);
    return h * 3600 + m * 60 + s + f / 30;
  }
}
