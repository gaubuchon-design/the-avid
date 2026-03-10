// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Multicamera Editing Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements Avid Media Composer's multicamera editing workflow:
//  - Group clips by timecode, IN points, aux timecode, or audio waveform
//  - Multi-pane source monitor (quad/nine/sixteen split)
//  - Real-time cut recording during playback (F9-F12 camera keys)
//  - Post-cut angle switching and refinement
//  - Audio-follow-video and independent audio source routing
//  - Multi-group support for combining camera groups
//  - Bank paging when angle count exceeds pane count
//

import {
  useEditorStore,
  type Clip,
  type Bin,
  type MediaAsset,
  makeClip,
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_TIME_REMAP,
} from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Sync method for grouping clips. */
export type MulticamSyncMethod = 'timecode' | 'in-points' | 'aux-timecode' | 'audio-waveform';

/** A single camera angle within a group. */
export interface CameraAngle {
  id: string;
  clipId: string;          // reference to source clip/asset
  assetId: string;
  name: string;            // "Camera 1", "Cam A", etc.
  angleIndex: number;      // 0-based
  syncOffset: number;      // offset in seconds from group sync point
  duration: number;
  thumbnailUrl?: string;
}

/** A group of synced camera angles. */
export interface MulticamGroup {
  id: string;
  name: string;
  angles: CameraAngle[];
  syncMethod: MulticamSyncMethod;
  masterTimecode: number;  // sync reference point (seconds)
  duration: number;        // total group duration (longest angle)
  createdAt: number;
}

/** A multigroup combines multiple groups. */
export interface MultiGroup {
  id: string;
  name: string;
  groupIds: string[];
  totalAngles: number;
}

/** Display mode for the multi-pane monitor. */
export type MulticamDisplayMode = 'quad' | 'nine' | 'sixteen';

/** A cut decision made during multicam editing. */
export interface MulticamCut {
  time: number;            // timeline time of the cut (seconds)
  angleIndex: number;      // which angle was selected
  angleId: string;
  trackId: string;         // target record track
}

/** Bank for paging through angles when > 4, 9, or 16. */
export interface AngleBank {
  bankIndex: number;
  startAngle: number;
  endAngle: number;        // exclusive
  anglesPerBank: number;   // 4 for quad, 9 for nine, 16 for sixteen
}

/** Engine state snapshot. */
export interface MulticamState {
  active: boolean;
  currentGroupId: string | null;
  displayMode: MulticamDisplayMode;
  activeAngleIndex: number;        // currently selected/playing angle
  previewAngleIndex: number | null; // angle being previewed (hover)
  currentBank: number;
  audioFollowVideo: boolean;
  cuts: MulticamCut[];             // cut list built during editing
  isRecording: boolean;            // true during real-time cut recording
}

// ─── Event Types ────────────────────────────────────────────────────────────

type MulticamEventType = 'enter' | 'exit' | 'cut' | 'angleSwitch' | 'bankChange';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- event callback args vary by event type
type MulticamEventCallback = (...args: any[]) => void;

// ─── Helpers ────────────────────────────────────────────────────────────────

let _nextId = 0;
function generateId(prefix: string): string {
  _nextId += 1;
  return `${prefix}_${Date.now()}_${_nextId}`;
}

/** Number of panes per display mode. */
function panesForMode(mode: MulticamDisplayMode): number {
  switch (mode) {
    case 'quad': return 4;
    case 'nine': return 9;
    case 'sixteen': return 16;
  }
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Multicamera editing engine.
 *
 * Models Avid Media Composer's multicam workflow: clips are grouped and
 * synced, a multi-pane monitor shows all angles simultaneously, and the
 * editor cuts between angles in real time during playback. After the
 * initial pass, individual cuts can be refined by switching angles.
 */
export class MulticamEngine {
  // ── Private state ───────────────────────────────────────────────────────

  /** All multicam groups. */
  private groups = new Map<string, MulticamGroup>();

  /** All multi-groups. */
  private multiGroups = new Map<string, MultiGroup>();

  /** Current engine state. */
  private state: MulticamState = {
    active: false,
    currentGroupId: null,
    displayMode: 'quad',
    activeAngleIndex: 0,
    previewAngleIndex: null,
    currentBank: 0,
    audioFollowVideo: true,
    cuts: [],
    isRecording: false,
  };

  /** Audio source angle when audio-follow-video is off. */
  private audioSourceAngle: number = 0;

  /** Generic change subscribers. */
  private listeners = new Set<() => void>();

  /** Typed event subscribers. */
  private eventListeners = new Map<MulticamEventType, Set<MulticamEventCallback>>();

  constructor() {
    // Pre-populate event listener sets.
    const events: MulticamEventType[] = ['enter', 'exit', 'cut', 'angleSwitch', 'bankChange'];
    for (const event of events) {
      this.eventListeners.set(event, new Set());
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Group Management
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a multicam group from a list of clip (asset) IDs.
   *
   * Each clip becomes a camera angle. Angles are synced according to the
   * specified method and the group duration is set to the longest angle.
   *
   * @param name       Human-readable group name.
   * @param clipIds    Asset/clip IDs to include as angles.
   * @param syncMethod How to calculate sync offsets between angles.
   * @returns The newly created group.
   *
   * @example
   * const group = multicamEngine.createGroup('Interview', ['clip-1', 'clip-2'], 'timecode');
   */
  createGroup(
    name: string,
    clipIds: string[],
    syncMethod: MulticamSyncMethod,
  ): MulticamGroup {
    const groupId = generateId('mcg');
    const store = useEditorStore.getState();

    // Build camera angles from clip IDs.
    const angles: CameraAngle[] = clipIds.map((clipId, index) => {
      // Try to find a matching asset for metadata.
      const asset = this.findAsset(store, clipId);
      return {
        id: generateId('angle'),
        clipId,
        assetId: asset?.id ?? clipId,
        name: asset?.name ?? `Camera ${index + 1}`,
        angleIndex: index,
        syncOffset: 0,
        duration: asset?.duration ?? 0,
        thumbnailUrl: asset?.thumbnailUrl,
      };
    });

    // Calculate sync offsets.
    const syncedAngles = this.applySyncMethod(angles, syncMethod);

    // Group duration = max extent of any angle (accounting for offset).
    const duration = syncedAngles.reduce((max, a) => {
      const extent = a.syncOffset + a.duration;
      return extent > max ? extent : max;
    }, 0);

    // Master timecode: use the earliest sync offset as the reference.
    const masterTimecode = syncedAngles.reduce((min, a) => {
      return a.syncOffset < min ? a.syncOffset : min;
    }, 0);

    const group: MulticamGroup = {
      id: groupId,
      name,
      angles: syncedAngles,
      syncMethod,
      masterTimecode,
      duration,
      createdAt: Date.now(),
    };

    this.groups.set(groupId, group);
    this.notify();
    return group;
  }

  /**
   * Create a multicam group from all assets in a bin.
   *
   * @param binId      Bin identifier.
   * @param syncMethod Sync method.
   * @returns The newly created group.
   *
   * @example
   * const group = multicamEngine.createGroupFromBin('bin-1', 'timecode');
   */
  createGroupFromBin(binId: string, syncMethod: MulticamSyncMethod): MulticamGroup {
    const store = useEditorStore.getState();
    const bin = this.findBin(store.bins, binId);

    if (!bin) {
      console.warn(`[MulticamEngine] Bin "${binId}" not found.`);
      // Return a minimal empty group rather than throwing.
      return this.createGroup(`Bin Group (${binId})`, [], syncMethod);
    }

    const clipIds = bin.assets
      .filter((a) => a.type === 'VIDEO' || a.type === 'AUDIO')
      .map((a) => a.id);

    return this.createGroup(bin.name, clipIds, syncMethod);
  }

  /**
   * Delete a multicam group.
   *
   * If the deleted group is the active group, multicam mode is exited.
   *
   * @param groupId Group identifier.
   */
  deleteGroup(groupId: string): void {
    if (this.state.currentGroupId === groupId) {
      this.exitMulticamMode();
    }
    this.groups.delete(groupId);

    // Remove from any multi-groups.
    for (const [, mg] of this.multiGroups) {
      const idx = mg.groupIds.indexOf(groupId);
      if (idx !== -1) {
        mg.groupIds.splice(idx, 1);
        mg.totalAngles = this.countMultiGroupAngles(mg.groupIds);
      }
    }

    this.notify();
  }

  /**
   * Retrieve a group by ID.
   *
   * @param groupId Group identifier.
   * @returns The group, or `null` if not found.
   */
  getGroup(groupId: string): MulticamGroup | null {
    return this.groups.get(groupId) ?? null;
  }

  /**
   * Return all multicam groups.
   *
   * @returns Array of all groups (snapshot copies).
   */
  getAllGroups(): MulticamGroup[] {
    return Array.from(this.groups.values()).map((g) => ({ ...g, angles: [...g.angles] }));
  }

  /**
   * Combine multiple groups into a multi-group.
   *
   * In Avid, this is used when you have more camera angles than a single
   * group allows, or when you want to combine different shooting days.
   *
   * @param name     Multi-group name.
   * @param groupIds Array of group IDs to combine.
   * @returns The newly created multi-group.
   */
  createMultiGroup(name: string, groupIds: string[]): MultiGroup {
    const id = generateId('mmg');
    const validGroupIds = groupIds.filter((gid) => this.groups.has(gid));

    if (validGroupIds.length === 0) {
      console.warn('[MulticamEngine] No valid groups for multi-group creation.');
    }

    const multiGroup: MultiGroup = {
      id,
      name,
      groupIds: validGroupIds,
      totalAngles: this.countMultiGroupAngles(validGroupIds),
    };

    this.multiGroups.set(id, multiGroup);
    this.notify();
    return multiGroup;
  }

  /**
   * Add a new camera angle to an existing group.
   *
   * @param groupId Group identifier.
   * @param clipId  Clip/asset ID for the new angle.
   * @param assetId Asset ID (may differ from clipId in linked workflows).
   */
  addAngleToGroup(groupId: string, clipId: string, assetId: string): void {
    const group = this.groups.get(groupId);
    if (!group) {
      console.warn(`[MulticamEngine] Group "${groupId}" not found.`);
      return;
    }

    const store = useEditorStore.getState();
    const asset = this.findAsset(store, assetId) ?? this.findAsset(store, clipId);
    const angleIndex = group.angles.length;

    const angle: CameraAngle = {
      id: generateId('angle'),
      clipId,
      assetId,
      name: asset?.name ?? `Camera ${angleIndex + 1}`,
      angleIndex,
      syncOffset: 0,
      duration: asset?.duration ?? 0,
      thumbnailUrl: asset?.thumbnailUrl,
    };

    group.angles.push(angle);

    // Re-sync all angles.
    group.angles = this.applySyncMethod(group.angles, group.syncMethod);

    // Recalculate group duration.
    group.duration = group.angles.reduce((max, a) => {
      const extent = a.syncOffset + a.duration;
      return extent > max ? extent : max;
    }, 0);

    this.notify();
  }

  /**
   * Remove a camera angle from a group.
   *
   * @param groupId Group identifier.
   * @param angleId Angle identifier.
   */
  removeAngleFromGroup(groupId: string, angleId: string): void {
    const group = this.groups.get(groupId);
    if (!group) {
      console.warn(`[MulticamEngine] Group "${groupId}" not found.`);
      return;
    }

    const idx = group.angles.findIndex((a) => a.id === angleId);
    if (idx === -1) {
      console.warn(`[MulticamEngine] Angle "${angleId}" not found in group "${groupId}".`);
      return;
    }

    group.angles.splice(idx, 1);

    // Re-index remaining angles.
    group.angles.forEach((a, i) => {
      a.angleIndex = i;
    });

    // Recalculate group duration.
    group.duration = group.angles.reduce((max, a) => {
      const extent = a.syncOffset + a.duration;
      return extent > max ? extent : max;
    }, 0);

    // If the active angle was removed, fall back to 0.
    if (this.state.active && this.state.currentGroupId === groupId) {
      if (this.state.activeAngleIndex >= group.angles.length) {
        this.state.activeAngleIndex = Math.max(0, group.angles.length - 1);
      }
    }

    this.notify();
  }

  /**
   * Reorder angles within a group.
   *
   * @param groupId  Group identifier.
   * @param newOrder Array of angle IDs in the desired order.
   */
  reorderAngles(groupId: string, newOrder: string[]): void {
    const group = this.groups.get(groupId);
    if (!group) {
      console.warn(`[MulticamEngine] Group "${groupId}" not found.`);
      return;
    }

    const angleMap = new Map(group.angles.map((a) => [a.id, a]));
    const reordered: CameraAngle[] = [];

    for (const id of newOrder) {
      const angle = angleMap.get(id);
      if (angle) {
        reordered.push(angle);
        angleMap.delete(id);
      }
    }

    // Append any angles not in newOrder (defensive).
    for (const [, remaining] of angleMap) {
      reordered.push(remaining);
    }

    // Re-index.
    reordered.forEach((a, i) => {
      a.angleIndex = i;
    });

    group.angles = reordered;
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sync
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Calculate sync offsets from source timecode.
   *
   * In Avid, clips shot on the same day with matching timecode will align
   * automatically. The earliest timecode becomes the reference (offset 0),
   * and all other angles are offset relative to it.
   *
   * @param angles Camera angles to sync.
   * @returns New angle array with calculated syncOffset values.
   */
  syncByTimecode(angles: CameraAngle[]): CameraAngle[] {
    if (angles.length === 0) return [];

    // Use clipId hash as a stand-in for timecode metadata.
    // In a real implementation, timecode would come from the media file header.
    const timecodes = angles.map((a) => this.extractTimecodeFromClip(a.clipId));
    const minTimecode = Math.min(...timecodes);

    return angles.map((a, i) => ({
      ...a,
      syncOffset: timecodes[i]! - minTimecode,
    }));
  }

  /**
   * Calculate sync from IN marks.
   *
   * All angles' IN points are aligned to the same timeline position (offset 0).
   * This is the simplest sync method: the user marks an IN point on each clip
   * at a common reference event (e.g., a clapperboard).
   *
   * @param angles Camera angles to sync.
   * @returns New angle array with syncOffset = 0 for all angles.
   */
  syncByInPoints(angles: CameraAngle[]): CameraAngle[] {
    // IN-point sync: all offsets are 0 because the user has already aligned them.
    return angles.map((a) => ({
      ...a,
      syncOffset: 0,
    }));
  }

  /**
   * Calculate sync via audio waveform cross-correlation.
   *
   * This is the most accurate automatic sync method. It works by finding
   * the peak cross-correlation between audio waveforms to determine the
   * time offset between clips.
   *
   * The actual DSP (FFT-based cross-correlation) is stubbed; the interface
   * is fully wired for future implementation with Web Audio or WASM.
   *
   * @param angles Camera angles to sync.
   * @returns Promise resolving to angles with calculated sync offsets.
   */
  async syncByAudioWaveform(angles: CameraAngle[]): Promise<CameraAngle[]> {
    if (angles.length <= 1) {
      return angles.map((a) => ({ ...a, syncOffset: 0 }));
    }

    // ── Stub: in production, this would:
    //  1. Decode audio from each clip's asset URL via OfflineAudioContext.
    //  2. Downsample to ~8kHz mono.
    //  3. Compute FFT-based cross-correlation between the reference (angle 0)
    //     and every other angle.
    //  4. The lag at peak correlation gives the sync offset in samples,
    //     which we convert to seconds.

    // For now, simulate with a small async delay to represent processing time.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Use deterministic pseudo-offsets based on angle index for predictability.
    // A real implementation would produce actual offsets from waveform analysis.
    const reference = angles[0];
    return angles.map((a, i) => ({
      ...a,
      syncOffset: i === 0 ? 0 : this.simulateWaveformOffset(reference!, a),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Multicam Mode Activation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Enter multicam editing mode for a group.
   *
   * The source monitor switches to multi-pane view showing all angles
   * in the current bank. Playback will play all angles simultaneously.
   *
   * @param groupId Group identifier to activate.
   *
   * @example
   * multicamEngine.enterMulticamMode('mcg_123');
   */
  enterMulticamMode(groupId: string): void {
    const group = this.groups.get(groupId);
    if (!group) {
      console.warn(`[MulticamEngine] Cannot enter multicam mode: group "${groupId}" not found.`);
      return;
    }

    if (group.angles.length === 0) {
      console.warn(`[MulticamEngine] Cannot enter multicam mode: group "${groupId}" has no angles.`);
      return;
    }

    this.state = {
      ...this.state,
      active: true,
      currentGroupId: groupId,
      activeAngleIndex: 0,
      previewAngleIndex: null,
      currentBank: 0,
      cuts: [],
      isRecording: false,
    };

    // Auto-select display mode based on angle count.
    const angleCount = group.angles.length;
    if (angleCount <= 4) {
      this.state.displayMode = 'quad';
    } else if (angleCount <= 9) {
      this.state.displayMode = 'nine';
    } else {
      this.state.displayMode = 'sixteen';
    }

    this.notify();
    this.emitEvent('enter', groupId);
  }

  /**
   * Exit multicam editing mode.
   *
   * If recording is in progress, it is stopped and cuts are preserved
   * in the state for later retrieval.
   */
  exitMulticamMode(): void {
    if (!this.state.active) return;

    if (this.state.isRecording) {
      this.stopRecording();
    }

    const previousGroupId = this.state.currentGroupId;

    this.state = {
      ...this.state,
      active: false,
      currentGroupId: null,
      previewAngleIndex: null,
      isRecording: false,
    };

    this.notify();
    this.emitEvent('exit', previousGroupId);
  }

  /**
   * Whether multicam mode is currently active.
   *
   * @returns `true` if in multicam editing mode.
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Return a snapshot of the current multicam state.
   *
   * @returns Shallow copy of the state object.
   */
  getState(): MulticamState {
    return {
      ...this.state,
      cuts: [...this.state.cuts],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Display
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set the multi-pane display mode.
   *
   * Changing mode resets the bank to 0.
   *
   * @param mode 'quad' (2x2), 'nine' (3x3), or 'sixteen' (4x4).
   */
  setDisplayMode(mode: MulticamDisplayMode): void {
    if (this.state.displayMode === mode) return;

    this.state.displayMode = mode;
    this.state.currentBank = 0;
    this.notify();
  }

  /**
   * Get the current display mode.
   *
   * @returns Current MulticamDisplayMode.
   */
  getDisplayMode(): MulticamDisplayMode {
    return this.state.displayMode;
  }

  /**
   * Get the current bank descriptor.
   *
   * A bank represents a page of angles visible in the multi-pane monitor.
   * For example, in quad mode with 12 angles: bank 0 shows angles 0-3,
   * bank 1 shows 4-7, bank 2 shows 8-11.
   *
   * @returns The current AngleBank.
   */
  getCurrentBank(): AngleBank {
    const anglesPerBank = panesForMode(this.state.displayMode);
    const startAngle = this.state.currentBank * anglesPerBank;
    const totalAngles = this.getActiveGroupAngleCount();
    const endAngle = Math.min(startAngle + anglesPerBank, totalAngles);

    return {
      bankIndex: this.state.currentBank,
      startAngle,
      endAngle,
      anglesPerBank,
    };
  }

  /**
   * Page to the next bank of angles.
   *
   * Wraps around to bank 0 if at the last bank.
   */
  nextBank(): void {
    const total = this.getTotalBanks();
    if (total <= 1) return;

    const previousBank = this.state.currentBank;
    this.state.currentBank = (this.state.currentBank + 1) % total;

    this.notify();
    this.emitEvent('bankChange', previousBank, this.state.currentBank);
  }

  /**
   * Page to the previous bank of angles.
   *
   * Wraps around to the last bank if at bank 0.
   */
  prevBank(): void {
    const total = this.getTotalBanks();
    if (total <= 1) return;

    const previousBank = this.state.currentBank;
    this.state.currentBank = (this.state.currentBank - 1 + total) % total;

    this.notify();
    this.emitEvent('bankChange', previousBank, this.state.currentBank);
  }

  /**
   * Get the total number of banks for the current group and display mode.
   *
   * @returns Number of banks (at least 1, even for empty groups).
   */
  getTotalBanks(): number {
    const totalAngles = this.getActiveGroupAngleCount();
    const anglesPerBank = panesForMode(this.state.displayMode);
    return Math.max(1, Math.ceil(totalAngles / anglesPerBank));
  }

  /**
   * Get the angles visible in the current bank.
   *
   * @returns Array of CameraAngle objects for the current bank.
   */
  getVisibleAngles(): CameraAngle[] {
    const group = this.getActiveGroup();
    if (!group) return [];

    const bank = this.getCurrentBank();
    return group.angles.slice(bank.startAngle, bank.endAngle);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cutting (Real-time editing)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Begin real-time cut recording.
   *
   * During recording, the timeline plays back and camera key presses
   * (via `cutToAngle`) create cut decisions at the current playhead time.
   * This models the "play + cut" workflow in Avid's multicam mode.
   *
   * @example
   * multicamEngine.startRecording();
   * // During playback, user presses F9/F10/F11/F12:
   * multicamEngine.cutToAngle(0); // Cut to Camera 1 at current time
   */
  startRecording(): void {
    if (!this.state.active) {
      console.warn('[MulticamEngine] Cannot start recording: multicam mode not active.');
      return;
    }

    this.state.isRecording = true;
    // Do not clear existing cuts -- user may be adding to a previous pass.
    this.notify();
  }

  /**
   * Stop real-time cut recording.
   *
   * Cuts made during the session are preserved in state and can be
   * retrieved via `getCuts()` or applied via `applyCutsToTimeline()`.
   */
  stopRecording(): void {
    this.state.isRecording = false;
    this.notify();
  }

  /**
   * Record a cut to the specified angle at the current playhead position.
   *
   * This is the primary cutting method, mapped to F9-F12 (or 1-9 keys)
   * during multicam playback. Each call creates a new cut decision.
   *
   * If a cut already exists at the exact same time, it is replaced.
   *
   * @param angleIndex 0-based angle index within the current group.
   *
   * @example
   * // F9 = Camera 1, F10 = Camera 2, etc.
   * multicamEngine.cutToAngle(0); // F9 pressed
   */
  cutToAngle(angleIndex: number): void {
    if (!this.state.active) {
      console.warn('[MulticamEngine] Cannot cut: multicam mode not active.');
      return;
    }

    const group = this.getActiveGroup();
    if (!group) return;

    // Validate angle index.
    if (angleIndex < 0 || angleIndex >= group.angles.length) {
      console.warn(
        `[MulticamEngine] Angle index ${angleIndex} out of range (0-${group.angles.length - 1}).`,
      );
      return;
    }

    const angle = group.angles[angleIndex];
    const playheadTime = useEditorStore.getState().playheadTime;

    // Determine target track: use the first video track by default.
    const tracks = useEditorStore.getState().tracks;
    const videoTrack = tracks.find((t) => t.type === 'VIDEO');
    const trackId = videoTrack?.id ?? 'v1';

    const cut: MulticamCut = {
      time: playheadTime,
      angleIndex,
      angleId: angle!.id!,
      trackId,
    };

    // Replace existing cut at this time, or append.
    const existingIdx = this.state.cuts.findIndex(
      (c) => Math.abs(c.time - playheadTime) < 0.001,
    );
    if (existingIdx !== -1) {
      this.state.cuts[existingIdx] = cut;
    } else {
      this.state.cuts.push(cut);
      // Keep cuts sorted by time.
      this.state.cuts.sort((a, b) => a.time - b.time);
    }

    // Update active angle.
    const previousAngle = this.state.activeAngleIndex;
    this.state.activeAngleIndex = angleIndex;

    this.notify();
    this.emitEvent('cut', cut);

    if (previousAngle !== angleIndex) {
      this.emitEvent('angleSwitch', previousAngle, angleIndex);
    }
  }

  /**
   * Cut to an angle by clicking its pane in the multi-pane monitor.
   *
   * Functionally identical to `cutToAngle`, but accounts for the current
   * bank offset. The angle index is absolute (within the group), not
   * relative to the bank.
   *
   * @param angleIndex Absolute 0-based angle index.
   */
  cutToAngleByClick(angleIndex: number): void {
    this.cutToAngle(angleIndex);
  }

  /**
   * Get all cuts made during the current or most recent recording session.
   *
   * @returns Array of MulticamCut objects sorted by time.
   */
  getCuts(): MulticamCut[] {
    return [...this.state.cuts];
  }

  /**
   * Clear all recorded cuts.
   */
  clearCuts(): void {
    this.state.cuts = [];
    this.notify();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Post-Cut Refinement
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Switch the angle of an existing cut segment.
   *
   * In Avid, after performing the initial multicam cut pass, you can park
   * the playhead on any segment and press Up/Down arrow to change which
   * camera angle that segment shows.
   *
   * @param clipId        The timeline clip ID at the current position.
   * @param newAngleIndex The new angle to assign.
   */
  switchAngle(clipId: string, newAngleIndex: number): void {
    const group = this.getActiveGroup();
    if (!group) return;

    if (newAngleIndex < 0 || newAngleIndex >= group.angles.length) {
      console.warn(
        `[MulticamEngine] Angle index ${newAngleIndex} out of range (0-${group.angles.length - 1}).`,
      );
      return;
    }

    const playheadTime = useEditorStore.getState().playheadTime;
    const angle = group.angles[newAngleIndex];

    // Find the cut segment that contains the current playhead.
    const cutIdx = this.findCutIndexAtTime(playheadTime);
    if (cutIdx !== -1) {
      const previousAngle = this.state.cuts[cutIdx]!.angleIndex;
      this.state.cuts[cutIdx] = {
        ...this.state.cuts[cutIdx]!,
        angleIndex: newAngleIndex,
        angleId: angle!.id!,
      };

      this.state.activeAngleIndex = newAngleIndex;
      this.notify();
      this.emitEvent('angleSwitch', previousAngle, newAngleIndex);
    } else {
      // No cut at this time -- insert one.
      this.cutToAngle(newAngleIndex);
    }
  }

  /**
   * Cycle to the next angle (Up arrow) for the segment at the playhead.
   *
   * @param clipId The timeline clip ID (used for context; angle is
   *               determined by playhead position in the cut list).
   */
  cycleAngleForward(clipId: string): void {
    const group = this.getActiveGroup();
    if (!group || group.angles.length === 0) return;

    const currentAngle = this.getAngleAtPlayhead();
    const nextAngle = (currentAngle + 1) % group.angles.length;
    this.switchAngle(clipId, nextAngle);
  }

  /**
   * Cycle to the previous angle (Down arrow) for the segment at the playhead.
   *
   * @param clipId The timeline clip ID.
   */
  cycleAngleBackward(clipId: string): void {
    const group = this.getActiveGroup();
    if (!group || group.angles.length === 0) return;

    const currentAngle = this.getAngleAtPlayhead();
    const prevAngle = (currentAngle - 1 + group.angles.length) % group.angles.length;
    this.switchAngle(clipId, prevAngle);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Audio Follow Video
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Toggle audio-follow-video mode.
   *
   * When enabled (default), cutting to a new video angle also switches
   * the audio source to that angle's audio. When disabled, the audio
   * source remains fixed and must be set manually.
   */
  toggleAudioFollowVideo(): void {
    this.state.audioFollowVideo = !this.state.audioFollowVideo;
    this.notify();
  }

  /**
   * Whether audio-follow-video is currently enabled.
   *
   * @returns `true` if audio follows video cuts.
   */
  isAudioFollowVideo(): boolean {
    return this.state.audioFollowVideo;
  }

  /**
   * Manually set the audio source angle, independent of video.
   *
   * Only effective when audio-follow-video is disabled. This allows the
   * editor to keep a single camera's audio (e.g., a boom mic) while
   * cutting between video angles.
   *
   * @param angleIndex 0-based angle index for audio source.
   */
  setAudioSourceAngle(angleIndex: number): void {
    const group = this.getActiveGroup();
    if (group && (angleIndex < 0 || angleIndex >= group.angles.length)) {
      console.warn(
        `[MulticamEngine] Audio angle index ${angleIndex} out of range.`,
      );
      return;
    }

    this.audioSourceAngle = angleIndex;
    this.notify();
  }

  /**
   * Get the current audio source angle index.
   *
   * Returns the active video angle index if audio-follow-video is on,
   * or the manually set audio source angle if off.
   *
   * @returns 0-based angle index.
   */
  getAudioSourceAngle(): number {
    if (this.state.audioFollowVideo) {
      return this.state.activeAngleIndex;
    }
    return this.audioSourceAngle;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Apply to Timeline
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Apply the recorded cuts to the timeline, creating actual clips.
   *
   * Processes the cut list into contiguous clip segments on the target
   * track. Each cut boundary becomes a clip boundary, and each segment
   * references the selected angle's source media.
   *
   * @param targetTrackId The timeline track to populate with cuts.
   * @returns Object with the IDs of the created clips.
   *
   * @example
   * const { clipIds } = multicamEngine.applyCutsToTimeline('t-v1');
   */
  applyCutsToTimeline(targetTrackId: string): { clipIds: string[] } {
    const group = this.getActiveGroup();
    if (!group) {
      console.warn('[MulticamEngine] No active group; cannot apply cuts.');
      return { clipIds: [] };
    }

    const cuts = this.getSortedCuts();
    if (cuts.length === 0) {
      console.warn('[MulticamEngine] No cuts to apply.');
      return { clipIds: [] };
    }

    const store = useEditorStore.getState();
    const createdClipIds: string[] = [];

    for (let i = 0; i < cuts.length; i++) {
      const cut = cuts[i];
      const nextCut = cuts[i + 1];
      const angle = group.angles[cut!.angleIndex!];

      if (!angle) continue;

      // Segment boundaries.
      const segmentStart = cut!.time!;
      const segmentEnd = nextCut ? nextCut.time : group.duration;

      // Don't create zero-length segments.
      if (segmentEnd <= segmentStart) continue;

      const clipId = generateId('mc-clip');

      const clip = makeClip({
        id: clipId,
        trackId: targetTrackId,
        name: `${angle.name} [MC]`,
        startTime: segmentStart,
        endTime: segmentEnd,
        trimStart: angle.syncOffset + segmentStart,
        trimEnd: 0,
        type: 'video',
        assetId: angle.assetId,
      });

      store.addClip(clip);
      createdClipIds.push(clipId);
    }

    return { clipIds: createdClipIds };
  }

  /**
   * Flatten a multicam sequence to regular (non-multicam) clips.
   *
   * This converts the current multicam group's cuts into permanent
   * timeline clips and exits multicam mode. After flattening, the
   * clips behave like normal timeline clips and can be trimmed, slipped,
   * etc. without multicam context.
   */
  flattenMulticamToTimeline(): void {
    if (!this.state.active) {
      console.warn('[MulticamEngine] Cannot flatten: multicam mode not active.');
      return;
    }

    const tracks = useEditorStore.getState().tracks;
    const videoTrack = tracks.find((t) => t.type === 'VIDEO');
    if (!videoTrack) {
      console.warn('[MulticamEngine] No video track found for flattening.');
      return;
    }

    this.applyCutsToTimeline(videoTrack.id);
    this.exitMulticamMode();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to any state change.
   *
   * @param cb Callback invoked on state change.
   * @returns An unsubscribe function.
   *
   * @example
   * const unsub = multicamEngine.subscribe(() => updateUI());
   * // later: unsub();
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Subscribe to a specific multicam event.
   *
   * @param event Event type: 'enter', 'exit', 'cut', 'angleSwitch', or 'bankChange'.
   * @param cb    Callback. Arguments depend on the event:
   *              - `enter`: (groupId: string)
   *              - `exit`: (previousGroupId: string | null)
   *              - `cut`: (cut: MulticamCut)
   *              - `angleSwitch`: (previousIndex: number, newIndex: number)
   *              - `bankChange`: (previousBank: number, newBank: number)
   * @returns An unsubscribe function.
   *
   * @example
   * const unsub = multicamEngine.on('cut', (cut) => {
   *   console.log(`Cut to angle ${cut.angleIndex} at ${cut.time}s`);
   * });
   */
  on(
    event: 'enter' | 'exit' | 'cut' | 'angleSwitch' | 'bankChange',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event callback args vary by event type
    cb: (...args: any[]) => void,
  ): () => void {
    const set = this.eventListeners.get(event);
    if (!set) {
      console.warn(`[MulticamEngine] Unknown event type "${event}".`);
      return () => {};
    }

    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Reset / Dispose
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Reset all engine state. Exits multicam mode if active.
   */
  reset(): void {
    if (this.state.active) {
      this.exitMulticamMode();
    }
    this.groups.clear();
    this.multiGroups.clear();
    this.state = {
      active: false,
      currentGroupId: null,
      displayMode: 'quad',
      activeAngleIndex: 0,
      previewAngleIndex: null,
      currentBank: 0,
      audioFollowVideo: true,
      cuts: [],
      isRecording: false,
    };
    this.audioSourceAngle = 0;
    this.notify();
  }

  /**
   * Dispose the engine, clearing all state and listeners.
   */
  dispose(): void {
    this.reset();
    this.listeners.clear();
    for (const [, set] of this.eventListeners) {
      set.clear();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Private Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /** Notify all generic subscribers. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[MulticamEngine] Subscriber error:', err);
      }
    });
  }

  /** Emit a typed event to registered listeners. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event args vary by event type
  private emitEvent(event: MulticamEventType, ...args: any[]): void {
    const set = this.eventListeners.get(event);
    if (!set) return;
    set.forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[MulticamEngine] Event listener error (${event}):`, err);
      }
    });
  }

  /** Get the currently active multicam group, or null. */
  private getActiveGroup(): MulticamGroup | null {
    if (!this.state.currentGroupId) return null;
    return this.groups.get(this.state.currentGroupId) ?? null;
  }

  /** Get the angle count for the active group. */
  private getActiveGroupAngleCount(): number {
    const group = this.getActiveGroup();
    return group ? group.angles.length : 0;
  }

  /** Count total angles across groups in a multi-group. */
  private countMultiGroupAngles(groupIds: string[]): number {
    let total = 0;
    for (const gid of groupIds) {
      const group = this.groups.get(gid);
      if (group) total += group.angles.length;
    }
    return total;
  }

  /** Apply the appropriate sync method to a set of angles. */
  private applySyncMethod(
    angles: CameraAngle[],
    method: MulticamSyncMethod,
  ): CameraAngle[] {
    switch (method) {
      case 'timecode':
      case 'aux-timecode':
        return this.syncByTimecode(angles);
      case 'in-points':
        return this.syncByInPoints(angles);
      case 'audio-waveform':
        // Audio waveform sync is async; for the synchronous createGroup path,
        // we fall back to timecode and the caller can re-sync with the
        // async method afterward.
        return this.syncByTimecode(angles);
    }
  }

  /**
   * Extract a pseudo-timecode from a clip ID.
   *
   * In a real implementation, this would read the clip's embedded
   * timecode from the media file header via TAMS or the media pipeline.
   * Here we derive a deterministic value for consistent behaviour.
   */
  private extractTimecodeFromClip(clipId: string): number {
    // Simple hash to produce a deterministic "timecode" value.
    let hash = 0;
    for (let i = 0; i < clipId.length; i++) {
      const ch = clipId.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    // Normalise to a small positive range (0-10 seconds).
    return Math.abs(hash % 10000) / 1000;
  }

  /**
   * Simulate a waveform-based sync offset.
   *
   * Produces a small deterministic offset for testing. A real
   * implementation would use FFT cross-correlation.
   */
  private simulateWaveformOffset(reference: CameraAngle, target: CameraAngle): number {
    // Deterministic pseudo-offset based on the angle IDs.
    let hash = 0;
    const combined = reference.id + target.id;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
    }
    // Small offset in range [-0.5, 0.5] seconds.
    return (Math.abs(hash) % 1000) / 1000 - 0.5;
  }

  /**
   * Find a MediaAsset by ID across all bins and the active bin assets.
   */
  private findAsset(
    store: ReturnType<typeof useEditorStore.getState>,
    assetId: string,
  ): MediaAsset | null {
    // Check active bin assets first.
    const activeAsset = store.activeBinAssets.find((a) => a.id === assetId);
    if (activeAsset) return activeAsset;

    // Search all bins recursively.
    return this.findAssetInBins(store.bins, assetId);
  }

  /** Recursively search bins for an asset. */
  private findAssetInBins(bins: Bin[], assetId: string): MediaAsset | null {
    for (const bin of bins) {
      const found = bin.assets.find((a) => a.id === assetId);
      if (found) return found;
      if (bin.children.length > 0) {
        const child = this.findAssetInBins(bin.children, assetId);
        if (child) return child;
      }
    }
    return null;
  }

  /** Recursively search for a bin by ID. */
  private findBin(bins: Bin[], binId: string): Bin | null {
    for (const bin of bins) {
      if (bin.id === binId) return bin;
      if (bin.children.length > 0) {
        const child = this.findBin(bin.children, binId);
        if (child) return child;
      }
    }
    return null;
  }

  /** Get cuts sorted by time. */
  private getSortedCuts(): MulticamCut[] {
    return [...this.state.cuts].sort((a, b) => a.time - b.time);
  }

  /**
   * Find the cut index whose segment contains the given time.
   *
   * A cut's segment spans from its time to the next cut's time
   * (or to infinity for the last cut).
   */
  private findCutIndexAtTime(time: number): number {
    const cuts = this.state.cuts;
    if (cuts.length === 0) return -1;

    // Cuts are sorted by time. Find the last cut whose time <= the given time.
    let result = -1;
    for (let i = 0; i < cuts.length; i++) {
      if (cuts[i]!.time <= time + 0.001) {
        result = i;
      } else {
        break;
      }
    }
    return result;
  }

  /**
   * Get the angle index at the current playhead position.
   *
   * Returns the angle from the most recent cut at or before the playhead,
   * or the active angle index if no cuts exist.
   */
  private getAngleAtPlayhead(): number {
    const playheadTime = useEditorStore.getState().playheadTime;
    const cutIdx = this.findCutIndexAtTime(playheadTime);
    if (cutIdx !== -1) {
      return this.state.cuts[cutIdx]!.angleIndex;
    }
    return this.state.activeAngleIndex;
  }
}

/** Singleton multicam engine instance. */
export const multicamEngine = new MulticamEngine();
