import { useEditorStore, type Clip, type Track } from '../store/editor.store';

// ─── Enums ──────────────────────────────────────────────────────────────────────

export enum TrimMode {
  /** Dual-roller. Moves edit point; adds frames to one side, subtracts from other. Combined duration unchanged. */
  ROLL = 'ROLL',
  /** Single-roller. Trims one side of the edit, changing sequence duration. Downstream content ripples. */
  RIPPLE = 'RIPPLE',
  /** Changes source IN/OUT of a clip while keeping its timeline duration and position fixed. */
  SLIP = 'SLIP',
  /** Moves a clip earlier/later. Selected clip content unchanged; neighbor clips grow/shrink to compensate. */
  SLIDE = 'SLIDE',
  /** Different rollers on different tracks at same edit point (L-cuts / split edits). */
  ASYMMETRIC = 'ASYMMETRIC',
}

export enum TrimSide {
  /** Outgoing (left) clip. */
  A_SIDE = 'A_SIDE',
  /** Incoming (right) clip. */
  B_SIDE = 'B_SIDE',
  /** Dual roller (Roll). */
  BOTH = 'BOTH',
}

// ─── Interfaces ─────────────────────────────────────────────────────────────────

export interface TrimRoller {
  trackId: string;
  editPointTime: number;
  side: TrimSide;
  clipAId: string | null;
  clipBId: string | null;
}

export interface TrimState {
  active: boolean;
  mode: TrimMode;
  rollers: TrimRoller[];
  originalState: Map<string, { startTime: number; endTime: number; trimStart: number; trimEnd: number }>;
  totalDelta: number;
  linkedSelection: boolean;
}

export interface TrimResult {
  success: boolean;
  delta: number;
  affectedClipIds: string[];
  durationChange: number;
}

export interface SlipState {
  clipId: string;
  trackId: string;
  originalTrimStart: number;
  originalTrimEnd: number;
  maxSlipLeft: number;
  maxSlipRight: number;
}

export interface SlideState {
  clipId: string;
  trackId: string;
  leftNeighborId: string | null;
  rightNeighborId: string | null;
  originalPositions: Map<string, { startTime: number; endTime: number }>;
  maxSlideLeft: number;
  maxSlideRight: number;
}

export interface TrimRollerDiagnostics {
  trackId: string;
  editPointTime: number;
  side: TrimSide;
  locked: boolean;
  missingSides: Array<'A' | 'B'>;
  availableTrimLeftFrames: number;
  availableTrimRightFrames: number;
}

export interface TrimSessionDiagnostics {
  active: boolean;
  mode: TrimMode;
  linkedSelection: boolean;
  hasLockedRollers: boolean;
  constrainedTrimLeftFrames: number;
  constrainedTrimRightFrames: number;
  rollers: TrimRollerDiagnostics[];
}

interface TrimConfigurationSnapshot {
  trackIds: string[];
  editPointTime: number;
  mode: TrimMode;
  linkedSelection: boolean;
  overwriteTrim: boolean;
  rollers: Array<{
    trackId: string;
    side: TrimSide;
    editPointTime: number;
  }>;
}

// ─── Event Types ────────────────────────────────────────────────────────────────

type TrimEventType = 'enter' | 'exit' | 'cancel' | 'trim' | 'modeChange';
type TrimEventCallback = (...args: unknown[]) => void;

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Minimum clip duration in seconds to prevent zero-length clips. */
const MIN_CLIP_DURATION = 1 / 120; // ~0.008s, well below a single frame at 60fps

/**
 * Epsilon for floating-point time comparisons. Two times within this threshold
 * are treated as coincident.
 */
const TIME_EPSILON = 1e-6;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function secondsToFrames(seconds: number, frameRate: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || frameRate <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor((seconds * frameRate) + TIME_EPSILON));
}

/** Returns the clip's visible (timeline) duration. */
function clipDuration(clip: Clip): number {
  return clip.endTime - clip.startTime;
}

/**
 * Returns the total source duration consumed by a clip, including trims.
 * For media-backed clips this represents how much source media is available.
 */
function clipSourceDuration(clip: Clip): number {
  return clipDuration(clip) + clip.trimStart + clip.trimEnd;
}

/** Sort clips in a track by startTime (ascending). */
function sortedClips(track: Track): Clip[] {
  return [...track.clips].sort((a, b) => a.startTime - b.startTime);
}

/**
 * Find the clip at a specific time on a track.  Prefers exact boundary matches
 * for edit-point identification.
 */
function findClipAt(track: Track, time: number): Clip | undefined {
  return track.clips.find(
    (c) => c.startTime <= time + TIME_EPSILON && c.endTime >= time - TIME_EPSILON,
  );
}

/**
 * Find the edit point nearest to `time` on the given track.
 * Returns the exact time of the nearest clip boundary.
 */
function findNearestEditPoint(track: Track, time: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;

  for (const clip of track.clips) {
    for (const edge of [clip.startTime, clip.endTime]) {
      const dist = Math.abs(edge - time);
      if (dist < bestDist) {
        bestDist = dist;
        best = edge;
      }
    }
  }

  return best;
}

/**
 * Identify A-side (outgoing) and B-side (incoming) clips at an edit point.
 */
function getEditPointClips(
  track: Track,
  editPointTime: number,
): { clipA: Clip | null; clipB: Clip | null } {
  const sorted = sortedClips(track);
  let clipA: Clip | null = null;
  let clipB: Clip | null = null;

  for (const clip of sorted) {
    if (Math.abs(clip.endTime - editPointTime) < TIME_EPSILON) {
      clipA = clip;
    }
    if (Math.abs(clip.startTime - editPointTime) < TIME_EPSILON) {
      clipB = clip;
    }
  }

  return { clipA, clipB };
}

/**
 * Get the left and right neighbors of a clip on its track.
 */
function getNeighbors(
  track: Track,
  clipId: string,
): { left: Clip | null; right: Clip | null } {
  const sorted = sortedClips(track);
  const idx = sorted.findIndex((c) => c.id === clipId);
  if (idx < 0) return { left: null, right: null };

  return {
    left: idx! > 0 ? sorted[idx - 1]! : null,
    right: idx! < sorted.length - 1 ? sorted[idx + 1]! : null,
  };
}

// ─── TrimEngine ─────────────────────────────────────────────────────────────────

/**
 * Production-grade trim engine modeled after Avid Media Composer's trim system.
 *
 * Supports Roll, Ripple, Slip, Slide, and Asymmetric trim modes with full
 * handle-limit checking, locked-track awareness, and undo-friendly state
 * snapshots.
 *
 * Reads and writes clip/track state through the Zustand editor store.
 */
export class TrimEngine {
  // ── State ───────────────────────────────────────────────────────────────────

  private state: TrimState = {
    active: false,
    mode: TrimMode.ROLL,
    rollers: [],
    originalState: new Map(),
    totalDelta: 0,
    linkedSelection: true,
  };

  private slipState: SlipState | null = null;
  private slideState: SlideState | null = null;
  private overwriteTrim = false;
  private lastConfiguration: TrimConfigurationSnapshot | null = null;

  // ── Events ──────────────────────────────────────────────────────────────────

  private subscribers = new Set<() => void>();
  private eventListeners = new Map<TrimEventType, Set<TrimEventCallback>>();

  // ── Store Access ────────────────────────────────────────────────────────────

  private getStore() {
    return useEditorStore.getState();
  }

  private updateStore(
    updater: (state: ReturnType<typeof useEditorStore.getState>) => void,
  ): void {
    useEditorStore.setState((s) => {
      updater(s);
      return s;
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private findClipById(clipId: string): { clip: Clip; track: Track } | null {
    const { tracks } = this.getStore();
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { clip, track };
    }
    return null;
  }

  private findTrackById(trackId: string): Track | null {
    return this.getStore().tracks.find((t) => t.id === trackId) ?? null;
  }

  private isTrackLocked(trackId: string): boolean {
    const track = this.findTrackById(trackId);
    return track?.locked ?? false;
  }

  /**
   * Snapshot the current clip positions so we can revert on cancel.
   */
  private snapshotOriginalState(): void {
    const { tracks } = this.getStore();
    this.state.originalState.clear();

    for (const track of tracks) {
      for (const clip of track.clips) {
        this.state.originalState.set(clip.id, {
          startTime: clip.startTime,
          endTime: clip.endTime,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
        });
      }
    }
  }

  private snapshotLastConfiguration(): void {
    if (!this.state.active || this.state.rollers.length === 0) {
      return;
    }

    this.lastConfiguration = {
      trackIds: this.state.rollers.map((roller) => roller.trackId),
      editPointTime: this.state.rollers[0]!.editPointTime,
      mode: this.state.mode,
      linkedSelection: this.state.linkedSelection,
      overwriteTrim: this.overwriteTrim,
      rollers: this.state.rollers.map((roller) => ({
        trackId: roller.trackId,
        side: roller.side,
        editPointTime: roller.editPointTime,
      })),
    };
  }

  private deriveModeFromRollers(rollers: TrimRoller[]): TrimMode {
    const sides = new Set(rollers.map((roller) => roller.side));
    if (sides.size > 1) {
      return TrimMode.ASYMMETRIC;
    }

    const [side] = sides;
    return side === TrimSide.BOTH ? TrimMode.ROLL : TrimMode.RIPPLE;
  }

  private activateTrimMode(rollers: TrimRoller[]): TrimState {
    if (rollers.length === 0) {
      return this.state;
    }

    this.state = {
      active: true,
      mode: this.deriveModeFromRollers(rollers),
      rollers,
      originalState: new Map(),
      totalDelta: 0,
      linkedSelection: true,
    };

    this.snapshotOriginalState();
    this.notify();
    this.emit('enter', this.state);

    return { ...this.state };
  }

  /**
   * Restore every clip to its snapshotted position.
   */
  private restoreOriginalState(): void {
    this.updateStore((s) => {
      for (const track of s.tracks) {
        for (const clip of track.clips) {
          const orig = this.state.originalState.get(clip.id);
          if (orig) {
            clip.startTime = orig.startTime;
            clip.endTime = orig.endTime;
            clip.trimStart = orig.trimStart;
            clip.trimEnd = orig.trimEnd;
          }
        }
      }
    });
  }

  /**
   * Compute the maximum handle (available source media beyond the current
   * trim) on each side of a clip.
   *
   * For the A-side (outgoing clip), the right handle is how much further
   * the endTime can be extended (i.e. trimEnd).
   *
   * For the B-side (incoming clip), the left handle is how much further
   * the startTime can be pulled earlier (i.e. trimStart).
   */
  private getClipHandles(clip: Clip): { leftHandle: number; rightHandle: number } {
    return {
      leftHandle: clip.trimStart,
      rightHandle: clip.trimEnd,
    };
  }

  // ── Notification ────────────────────────────────────────────────────────────

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch (err) {
        console.error('[TrimEngine] Subscriber error:', err);
      }
    }
  }

  private emit(event: TrimEventType, ...args: unknown[]): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const fn of listeners) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[TrimEngine] Event listener error (${event}):`, err);
      }
    }
  }

  // ── Entry / Exit ────────────────────────────────────────────────────────────

  /**
   * Enter trim mode at the nearest edit point on the given tracks.
   *
   * @param trackIds  Tracks to engage.
   * @param editPointTime  Approximate time of the desired edit point.
   * @param side  Which side of the edit to engage. Defaults to BOTH (Roll).
   * @returns The current TrimState.
   */
  enterTrimMode(
    trackIds: string[],
    editPointTime: number,
    side: TrimSide = TrimSide.BOTH,
  ): TrimState {
    if (this.state.active) {
      this.exitTrimMode();
    }

    const rollers: TrimRoller[] = [];

    for (const trackId of trackIds) {
      if (this.isTrackLocked(trackId)) continue;

      const track = this.findTrackById(trackId);
      if (!track) continue;

      const nearestTime = findNearestEditPoint(track, editPointTime);
      if (nearestTime === null) continue;

      const { clipA, clipB } = getEditPointClips(track, nearestTime);
      if (!clipA && !clipB) continue;

      rollers.push({
        trackId,
        editPointTime: nearestTime,
        side,
        clipAId: clipA?.id ?? null,
        clipBId: clipB?.id ?? null,
      });
    }

    return this.activateTrimMode(rollers);
  }

  enterTrimModeWithSelections(
    selections: Array<{ trackId: string; editPointTime: number; side: TrimSide }>,
  ): TrimState {
    if (this.state.active) {
      this.exitTrimMode();
    }

    const rollers: TrimRoller[] = [];

    for (const selection of selections) {
      if (this.isTrackLocked(selection.trackId)) continue;

      const track = this.findTrackById(selection.trackId);
      if (!track) continue;

      const nearestTime = findNearestEditPoint(track, selection.editPointTime);
      if (nearestTime === null) continue;

      const { clipA, clipB } = getEditPointClips(track, nearestTime);
      if (!clipA && !clipB) continue;

      rollers.push({
        trackId: selection.trackId,
        editPointTime: nearestTime,
        side: selection.side,
        clipAId: clipA?.id ?? null,
        clipBId: clipB?.id ?? null,
      });
    }

    return this.activateTrimMode(rollers);
  }

  /**
   * Exit trim mode, finalizing all edits.
   */
  exitTrimMode(): void {
    if (!this.state.active) return;

    this.snapshotLastConfiguration();
    this.slipState = null;
    this.slideState = null;

    this.state = {
      active: false,
      mode: TrimMode.ROLL,
      rollers: [],
      originalState: new Map(),
      totalDelta: 0,
      linkedSelection: true,
    };

    this.notify();
    this.emit('cancel');
    this.emit('exit');
  }

  /**
   * Cancel the current trim, reverting all clips to their original positions.
   */
  cancelTrim(): void {
    if (!this.state.active) return;

    this.snapshotLastConfiguration();
    this.restoreOriginalState();
    this.slipState = null;
    this.slideState = null;

    this.state = {
      active: false,
      mode: TrimMode.ROLL,
      rollers: [],
      originalState: new Map(),
      totalDelta: 0,
      linkedSelection: true,
    };

    this.notify();
    this.emit('exit');
  }

  // ── Mode Switching ──────────────────────────────────────────────────────────

  /**
   * Switch all rollers to A-side (single roller on outgoing clip).
   * Maps to Avid's P key behavior.
   */
  selectASide(): void {
    if (!this.state.active) return;

    this.state.mode = TrimMode.RIPPLE;
    for (const roller of this.state.rollers) {
      roller.side = TrimSide.A_SIDE;
    }

    this.slipState = null;
    this.slideState = null;
    this.notify();
    this.emit('modeChange', TrimMode.RIPPLE, TrimSide.A_SIDE);
  }

  /**
   * Switch all rollers to B-side (single roller on incoming clip).
   * Maps to Avid's ] key behavior.
   */
  selectBSide(): void {
    if (!this.state.active) return;

    this.state.mode = TrimMode.RIPPLE;
    for (const roller of this.state.rollers) {
      roller.side = TrimSide.B_SIDE;
    }

    this.slipState = null;
    this.slideState = null;
    this.notify();
    this.emit('modeChange', TrimMode.RIPPLE, TrimSide.B_SIDE);
  }

  /**
   * Switch all rollers to dual-roller (Roll) mode.
   * Maps to Avid's [ key behavior.
   */
  selectBothSides(): void {
    if (!this.state.active) return;

    this.state.mode = TrimMode.ROLL;
    for (const roller of this.state.rollers) {
      roller.side = TrimSide.BOTH;
    }

    this.slipState = null;
    this.slideState = null;
    this.notify();
    this.emit('modeChange', TrimMode.ROLL, TrimSide.BOTH);
  }

  /**
   * Cycle through trim modes: Roll -> Slip -> Slide -> Roll.
   *
   * Slip and Slide require that a single clip is identifiable from the
   * current rollers. If they cannot be determined, the mode skips to the
   * next viable option.
   */
  cycleTrimMode(): void {
    if (!this.state.active) return;

    const order: TrimMode[] = [TrimMode.ROLL, TrimMode.SLIP, TrimMode.SLIDE];
    const currentIdx = order.indexOf(this.state.mode);
    let nextIdx = (currentIdx + 1) % order.length;

    // Try each mode in sequence; skip if it cannot be activated
    for (let attempts = 0; attempts < order.length; attempts++) {
      const candidate = order[nextIdx];

      if (candidate === TrimMode.SLIP) {
        // Slip needs a B-side clip (or A-side) from the first roller
        const roller = this.state.rollers[0];
        const clipId = roller?.clipBId ?? roller?.clipAId;
        if (clipId) {
          const found = this.findClipById(clipId);
          if (found) {
            this.state.mode = TrimMode.SLIP;
            this.enterSlip(clipId, found.track.id);
            this.notify();
            this.emit('modeChange', TrimMode.SLIP);
            return;
          }
        }
      } else if (candidate === TrimMode.SLIDE) {
        const roller = this.state.rollers[0];
        const clipId = roller?.clipBId ?? roller?.clipAId;
        if (clipId) {
          const found = this.findClipById(clipId);
          if (found) {
            this.state.mode = TrimMode.SLIDE;
            this.enterSlide(clipId, found.track.id);
            this.notify();
            this.emit('modeChange', TrimMode.SLIDE);
            return;
          }
        }
      } else {
        // Roll: always possible if we have rollers
        this.selectBothSides();
        return;
      }

      nextIdx = (nextIdx + 1) % order.length;
    }
  }

  // ── Roll Trim (Dual Roller) ─────────────────────────────────────────────────

  /**
   * Perform a Roll trim by `delta` seconds.
   *
   * A.endTime += delta, B.startTime += delta. Total duration unchanged.
   * Limited by available handles on both sides.
   */
  private applyRollTrim(delta: number): TrimResult {
    const affectedClipIds: string[] = [];
    let actualDelta = delta;

    // First pass: compute the tightest constraint across all rollers
    for (const roller of this.state.rollers) {
      if (this.isTrackLocked(roller.trackId)) continue;

      if (roller.clipAId) {
        const found = this.findClipById(roller.clipAId);
        if (found) {
          const { rightHandle } = this.getClipHandles(found.clip);
          if (delta > 0) {
            // Extending A: limited by A's right handle
            actualDelta = Math.min(actualDelta, rightHandle);
          } else {
            // Shortening A: limited by minimum clip duration
            const maxShrink = clipDuration(found.clip) - MIN_CLIP_DURATION;
            actualDelta = Math.max(actualDelta, -maxShrink);
          }
        }
      }

      if (roller.clipBId) {
        const found = this.findClipById(roller.clipBId);
        if (found) {
          const { leftHandle } = this.getClipHandles(found.clip);
          if (delta > 0) {
            // Shortening B: limited by minimum clip duration
            const maxShrink = clipDuration(found.clip) - MIN_CLIP_DURATION;
            actualDelta = Math.min(actualDelta, maxShrink);
          } else {
            // Extending B: limited by B's left handle
            actualDelta = Math.max(actualDelta, -leftHandle);
          }
        }
      }
    }

    if (Math.abs(actualDelta) < TIME_EPSILON) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    // Second pass: apply the constrained delta
    this.updateStore((s) => {
      for (const roller of this.state.rollers) {
        if (this.isTrackLocked(roller.trackId)) continue;

        const track = s.tracks.find((t) => t.id === roller.trackId);
        if (!track) continue;

        if (roller.clipAId) {
          const clipA = track.clips.find((c) => c.id === roller.clipAId);
          if (clipA) {
            clipA.endTime += actualDelta;
            // Adjust the trim values: extending endTime consumes trimEnd
            clipA.trimEnd = Math.max(0, clipA.trimEnd - actualDelta);
            affectedClipIds.push(clipA.id);
          }
        }

        if (roller.clipBId) {
          const clipB = track.clips.find((c) => c.id === roller.clipBId);
          if (clipB) {
            clipB.startTime += actualDelta;
            // Adjust the trim values: moving startTime later adds to trimStart
            clipB.trimStart = Math.max(0, clipB.trimStart + actualDelta);
            affectedClipIds.push(clipB.id);
          }
        }
      }
    });

    return {
      success: true,
      delta: actualDelta,
      affectedClipIds: [...new Set(affectedClipIds)],
      durationChange: 0, // Roll never changes duration
    };
  }

  // ── Ripple Trim (Single Roller) ─────────────────────────────────────────────

  /**
   * Perform a Ripple trim by `delta` seconds.
   *
   * A-side: changes A.endTime, ripples all downstream clips.
   * B-side: changes B.startTime, ripples all downstream clips.
   * Sequence duration changes by `delta`.
   */
  private applyRippleTrim(delta: number): TrimResult {
    const affectedClipIds: string[] = [];
    let actualDelta = delta;

    // First pass: find the tightest constraint
    for (const roller of this.state.rollers) {
      if (this.isTrackLocked(roller.trackId)) continue;

      if (roller.side === TrimSide.A_SIDE && roller.clipAId) {
        const found = this.findClipById(roller.clipAId);
        if (found) {
          if (delta > 0) {
            // Extending A: limited by right handle
            const { rightHandle } = this.getClipHandles(found.clip);
            actualDelta = Math.min(actualDelta, rightHandle);
          } else {
            // Shortening A: limited by minimum duration
            const maxShrink = clipDuration(found.clip) - MIN_CLIP_DURATION;
            actualDelta = Math.max(actualDelta, -maxShrink);
          }
          // Also: A endTime cannot go below 0
          const minEnd = found.clip.startTime + MIN_CLIP_DURATION;
          if (found.clip.endTime + actualDelta < minEnd) {
            actualDelta = minEnd - found.clip.endTime;
          }
        }
      }

      if (roller.side === TrimSide.B_SIDE && roller.clipBId) {
        const found = this.findClipById(roller.clipBId);
        if (found) {
          if (delta < 0) {
            // Extending B to the left: limited by left handle
            const { leftHandle } = this.getClipHandles(found.clip);
            actualDelta = Math.max(actualDelta, -leftHandle);
          } else {
            // Shortening B from the left: limited by minimum duration
            const maxShrink = clipDuration(found.clip) - MIN_CLIP_DURATION;
            actualDelta = Math.min(actualDelta, maxShrink);
          }
          // B startTime cannot go below 0
          if (found.clip.startTime + actualDelta < 0) {
            actualDelta = -found.clip.startTime;
          }
        }
      }
    }

    if (Math.abs(actualDelta) < TIME_EPSILON) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    // Second pass: apply
    this.updateStore((s) => {
      for (const roller of this.state.rollers) {
        if (this.isTrackLocked(roller.trackId)) continue;

        const track = s.tracks.find((t) => t.id === roller.trackId);
        if (!track) continue;

        if (roller.side === TrimSide.A_SIDE && roller.clipAId) {
          const clipA = track.clips.find((c) => c.id === roller.clipAId);
          if (clipA) {
            const oldEnd = clipA.endTime;
            clipA.endTime += actualDelta;
            clipA.trimEnd = Math.max(0, clipA.trimEnd - actualDelta);
            affectedClipIds.push(clipA.id);

            if (!this.overwriteTrim) {
              // Ripple: shift all downstream clips on this track
              for (const c of track.clips) {
                if (c.id !== clipA.id && c.startTime >= oldEnd - TIME_EPSILON) {
                  c.startTime += actualDelta;
                  c.endTime += actualDelta;
                  affectedClipIds.push(c.id);
                }
              }
            }
          }
        }

        if (roller.side === TrimSide.B_SIDE && roller.clipBId) {
          const clipB = track.clips.find((c) => c.id === roller.clipBId);
          if (clipB) {
            const oldStart = clipB.startTime;
            clipB.startTime += actualDelta;
            clipB.trimStart = Math.max(0, clipB.trimStart + actualDelta);
            affectedClipIds.push(clipB.id);

            if (!this.overwriteTrim) {
              // Ripple: shift this clip and all downstream clips
              for (const c of track.clips) {
                if (c.id !== clipB.id && c.startTime >= oldStart + TIME_EPSILON) {
                  c.startTime += actualDelta;
                  c.endTime += actualDelta;
                  affectedClipIds.push(c.id);
                }
              }
            }
          }
        }
      }
    });

    const durationChange = this.overwriteTrim ? 0 : actualDelta;

    return {
      success: true,
      delta: actualDelta,
      affectedClipIds: [...new Set(affectedClipIds)],
      durationChange,
    };
  }

  // ── Trim Operations (Public) ────────────────────────────────────────────────

  /**
   * Trim by a time delta in seconds.
   *
   * Positive delta moves the edit point right (later in time).
   * Negative delta moves the edit point left (earlier in time).
   *
   * Used for keyboard shortcuts (M / , / . / /) and mouse drag.
   */
  trimByDelta(delta: number): TrimResult {
    if (!this.state.active) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    if (Math.abs(delta) < TIME_EPSILON) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    let result: TrimResult;

    switch (this.state.mode) {
      case TrimMode.ROLL:
        result = this.applyRollTrim(delta);
        break;

      case TrimMode.RIPPLE:
        result = this.applyRippleTrim(delta);
        break;

      case TrimMode.SLIP:
        this.slipByDelta(delta);
        result = {
          success: true,
          delta,
          affectedClipIds: this.slipState ? [this.slipState.clipId] : [],
          durationChange: 0,
        };
        break;

      case TrimMode.SLIDE:
        this.slideByDelta(delta);
        result = {
          success: true,
          delta,
          affectedClipIds: this.slideState
            ? [
                this.slideState.clipId,
                this.slideState.leftNeighborId,
                this.slideState.rightNeighborId,
              ].filter((id): id is string => id !== null)
            : [],
          durationChange: 0,
        };
        break;

      case TrimMode.ASYMMETRIC:
        // Asymmetric applies per-roller: each roller may be A or B side
        result = this.applyAsymmetricTrim(delta);
        break;

      default:
        result = { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    if (result.success) {
      this.state.totalDelta += result.delta;
      this.notify();
      this.emit('trim', result);
    }

    return result;
  }

  /**
   * Trim by a number of frames.
   *
   * @param frames   Number of frames (positive = right/later, negative = left/earlier).
   * @param frameRate  The project frame rate (e.g. 23.976, 24, 29.97, 30, 60).
   */
  trimByFrames(frames: number, frameRate: number): TrimResult {
    if (frameRate <= 0) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }
    const delta = frames / frameRate;
    return this.trimByDelta(delta);
  }

  /**
   * Trim to an absolute timeline position.
   * Computes the delta from the current edit point and delegates to trimByDelta.
   *
   * Primarily used for mouse-drag trimming where the cursor position maps to
   * an absolute time.
   */
  trimToPosition(time: number): TrimResult {
    if (!this.state.active || this.state.rollers.length === 0) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    // Use the first roller's edit point as the reference
    const currentEditTime = this.state.rollers[0]!.editPointTime + this.state.totalDelta;
    const delta = time - currentEditTime;

    return this.trimByDelta(delta);
  }

  /**
   * Parse a numeric entry string like "+15", "-30", "10" and apply as a frame
   * trim.
   *
   * Uses the project frame rate from the editor store.
   *
   * @param entry  A string representing a signed or unsigned frame count.
   */
  trimByNumericEntry(entry: string): TrimResult {
    const trimmed = entry.trim();
    if (!trimmed) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    const frames = parseInt(trimmed, 10);
    if (isNaN(frames)) {
      return { success: false, delta: 0, affectedClipIds: [], durationChange: 0 };
    }

    const { projectSettings } = this.getStore();
    const frameRate = projectSettings.frameRate || 24;

    return this.trimByFrames(frames, frameRate);
  }

  // ── Slip Operations ─────────────────────────────────────────────────────────

  /**
   * Enter slip mode for a specific clip.
   *
   * Slip changes which portion of the source media is visible without
   * changing the clip's position or duration on the timeline.
   *
   * @param clipId  The clip to slip.
   * @param trackId The track containing the clip.
   * @returns The computed SlipState with available handles.
   */
  enterSlip(clipId: string, trackId: string): SlipState {
    if (this.isTrackLocked(trackId)) {
      this.slipState = {
        clipId,
        trackId,
        originalTrimStart: 0,
        originalTrimEnd: 0,
        maxSlipLeft: 0,
        maxSlipRight: 0,
      };
      return { ...this.slipState };
    }

    const found = this.findClipById(clipId);
    if (!found) {
      this.slipState = {
        clipId,
        trackId,
        originalTrimStart: 0,
        originalTrimEnd: 0,
        maxSlipLeft: 0,
        maxSlipRight: 0,
      };
      return { ...this.slipState };
    }

    const { clip } = found;

    this.slipState = {
      clipId,
      trackId,
      originalTrimStart: clip.trimStart,
      originalTrimEnd: clip.trimEnd,
      maxSlipLeft: clip.trimStart,   // How far left we can slip (limited by available head handle)
      maxSlipRight: clip.trimEnd,    // How far right we can slip (limited by available tail handle)
    };

    if (this.state.active) {
      this.state.mode = TrimMode.SLIP;
    }

    return { ...this.slipState };
  }

  /**
   * Slip the source by `delta` seconds.
   *
   * Positive delta shifts the visible window later in the source (trimStart
   * increases, trimEnd decreases). Negative shifts it earlier.
   *
   * The clip's timeline position and duration remain unchanged.
   */
  slipByDelta(delta: number): void {
    if (!this.slipState) return;
    if (this.isTrackLocked(this.slipState.trackId)) return;

    const found = this.findClipById(this.slipState.clipId);
    if (!found) return;

    // Clamp delta to available handles
    const clampedDelta = clamp(
      delta,
      -this.slipState.maxSlipLeft,
      this.slipState.maxSlipRight,
    );

    if (Math.abs(clampedDelta) < TIME_EPSILON) return;

    this.updateStore((s) => {
      for (const track of s.tracks) {
        const clip = track.clips.find((c) => c.id === this.slipState!.clipId);
        if (clip) {
          clip.trimStart = Math.max(0, clip.trimStart + clampedDelta);
          clip.trimEnd = Math.max(0, clip.trimEnd - clampedDelta);
          break;
        }
      }
    });

    // Update remaining slip limits
    this.slipState.maxSlipLeft = Math.max(0, this.slipState.maxSlipLeft - clampedDelta);
    this.slipState.maxSlipRight = Math.max(0, this.slipState.maxSlipRight + clampedDelta);
  }

  /**
   * Get the current slip limits (how far can we slip in each direction).
   */
  getSlipLimits(): { left: number; right: number } {
    if (!this.slipState) return { left: 0, right: 0 };
    return {
      left: this.slipState.maxSlipLeft,
      right: this.slipState.maxSlipRight,
    };
  }

  getSlipState(): SlipState | null {
    return this.slipState ? { ...this.slipState } : null;
  }

  // ── Slide Operations ────────────────────────────────────────────────────────

  /**
   * Enter slide mode for a specific clip.
   *
   * Slide moves the clip earlier or later in the timeline. The clip's
   * content stays the same; its left and right neighbor clips grow or
   * shrink to fill the space.
   *
   * @param clipId  The clip to slide.
   * @param trackId The track containing the clip.
   * @returns The computed SlideState.
   */
  enterSlide(clipId: string, trackId: string): SlideState {
    if (this.isTrackLocked(trackId)) {
      this.slideState = {
        clipId,
        trackId,
        leftNeighborId: null,
        rightNeighborId: null,
        originalPositions: new Map(),
        maxSlideLeft: 0,
        maxSlideRight: 0,
      };
      return { ...this.slideState, originalPositions: new Map(this.slideState.originalPositions) };
    }

    const track = this.findTrackById(trackId);
    if (!track) {
      this.slideState = {
        clipId,
        trackId,
        leftNeighborId: null,
        rightNeighborId: null,
        originalPositions: new Map(),
        maxSlideLeft: 0,
        maxSlideRight: 0,
      };
      return { ...this.slideState, originalPositions: new Map(this.slideState.originalPositions) };
    }

    const { left, right } = getNeighbors(track, clipId);
    const found = this.findClipById(clipId);
    if (!found) {
      this.slideState = {
        clipId,
        trackId,
        leftNeighborId: null,
        rightNeighborId: null,
        originalPositions: new Map(),
        maxSlideLeft: 0,
        maxSlideRight: 0,
      };
      return { ...this.slideState, originalPositions: new Map(this.slideState.originalPositions) };
    }

    const { clip } = found;
    const originalPositions = new Map<string, { startTime: number; endTime: number }>();

    originalPositions.set(clipId, { startTime: clip.startTime, endTime: clip.endTime });
    if (left) originalPositions.set(left.id, { startTime: left.startTime, endTime: left.endTime });
    if (right) originalPositions.set(right.id, { startTime: right.startTime, endTime: right.endTime });

    // Slide left limit: how much can the left neighbor shrink + left neighbor's right handle
    let maxSlideLeft = 0;
    if (left) {
      const leftDuration = clipDuration(left);
      const leftRightHandle = left.trimEnd;
      // Left neighbor can shrink down to MIN_CLIP_DURATION
      const leftShrinkable = leftDuration - MIN_CLIP_DURATION;
      // We can also extend the left neighbor's endTime if it has handle, but in slide
      // that's not how it works - we shrink left neighbor endTime and grow right neighbor startTime
      maxSlideLeft = leftShrinkable;
      // But also limited by right neighbor's available left handle if right exists
      if (right) {
        const rightLeftHandle = right.trimStart;
        maxSlideLeft = Math.min(maxSlideLeft, rightLeftHandle + clipDuration(right) - MIN_CLIP_DURATION);
      }
    }
    // Also cannot slide past time 0
    maxSlideLeft = Math.min(maxSlideLeft, clip.startTime);

    // Slide right limit: how much can the right neighbor shrink
    let maxSlideRight = 0;
    if (right) {
      const rightDuration = clipDuration(right);
      maxSlideRight = rightDuration - MIN_CLIP_DURATION;
      // Also limited by left neighbor's available right handle
      if (left) {
        const leftRightHandle = left.trimEnd;
        maxSlideRight = Math.min(maxSlideRight, leftRightHandle + clipDuration(left) - MIN_CLIP_DURATION);
      }
    }

    this.slideState = {
      clipId,
      trackId,
      leftNeighborId: left?.id ?? null,
      rightNeighborId: right?.id ?? null,
      originalPositions,
      maxSlideLeft,
      maxSlideRight,
    };

    if (this.state.active) {
      this.state.mode = TrimMode.SLIDE;
    }

    return {
      ...this.slideState,
      originalPositions: new Map(this.slideState.originalPositions),
    };
  }

  /**
   * Slide the clip by `delta` seconds.
   *
   * Positive delta slides the clip later (right). The left neighbor grows
   * (its endTime increases) and the right neighbor shrinks (its startTime
   * increases). The clip's own content is unchanged.
   *
   * Negative delta slides the clip earlier (left).
   */
  slideByDelta(delta: number): void {
    if (!this.slideState) return;
    if (this.isTrackLocked(this.slideState.trackId)) return;

    // Clamp to limits
    const clampedDelta = clamp(
      delta,
      -this.slideState.maxSlideLeft,
      this.slideState.maxSlideRight,
    );

    if (Math.abs(clampedDelta) < TIME_EPSILON) return;

    // Without both neighbors, slide is not possible (no clip to absorb the change)
    if (!this.slideState.leftNeighborId && clampedDelta < 0) return;
    if (!this.slideState.rightNeighborId && clampedDelta > 0) return;

    this.updateStore((s) => {
      const track = s.tracks.find((t) => t.id === this.slideState!.trackId);
      if (!track) return;

      const clip = track.clips.find((c) => c.id === this.slideState!.clipId);
      if (!clip) return;

      // Move the clip
      clip.startTime += clampedDelta;
      clip.endTime += clampedDelta;

      // Adjust left neighbor: its endTime tracks the clip's startTime
      if (this.slideState!.leftNeighborId) {
        const left = track.clips.find((c) => c.id === this.slideState!.leftNeighborId);
        if (left) {
          const oldEnd = left.endTime;
          left.endTime = clip.startTime;
          // Adjust trim: extending endTime consumes right handle, shrinking adds to it
          left.trimEnd = Math.max(0, left.trimEnd - (left.endTime - oldEnd));
        }
      }

      // Adjust right neighbor: its startTime tracks the clip's endTime
      if (this.slideState!.rightNeighborId) {
        const right = track.clips.find((c) => c.id === this.slideState!.rightNeighborId);
        if (right) {
          const oldStart = right.startTime;
          right.startTime = clip.endTime;
          // Adjust trim
          right.trimStart = Math.max(0, right.trimStart + (right.startTime - oldStart));
        }
      }
    });

    // Update remaining slide limits
    this.slideState.maxSlideLeft = Math.max(0, this.slideState.maxSlideLeft - clampedDelta);
    this.slideState.maxSlideRight = Math.max(0, this.slideState.maxSlideRight + clampedDelta);
  }

  /**
   * Get the current slide limits.
   */
  getSlideLimits(): { left: number; right: number } {
    if (!this.slideState) return { left: 0, right: 0 };
    return {
      left: this.slideState.maxSlideLeft,
      right: this.slideState.maxSlideRight,
    };
  }

  getSlideState(): SlideState | null {
    return this.slideState
      ? {
        ...this.slideState,
        originalPositions: new Map(this.slideState.originalPositions),
      }
      : null;
  }

  hasPreviousConfiguration(): boolean {
    return this.lastConfiguration !== null;
  }

  recallPreviousConfiguration(): TrimState {
    if (!this.lastConfiguration) {
      return this.getState();
    }

    const previous = this.lastConfiguration;
    this.enterTrimModeWithSelections(previous.rollers.map((roller) => ({
      trackId: roller.trackId,
      editPointTime: roller.editPointTime,
      side: roller.side,
    })));
    this.state.linkedSelection = previous.linkedSelection;
    this.overwriteTrim = previous.overwriteTrim;

    if (previous.mode === TrimMode.SLIP || previous.mode === TrimMode.SLIDE) {
      const roller = this.state.rollers[0];
      const clipId = roller?.clipBId ?? roller?.clipAId;
      if (clipId) {
        const found = this.findClipById(clipId);
        if (found) {
          if (previous.mode === TrimMode.SLIP) {
            this.state.mode = TrimMode.SLIP;
            this.enterSlip(clipId, found.track.id);
          } else {
            this.state.mode = TrimMode.SLIDE;
            this.enterSlide(clipId, found.track.id);
          }
        }
      }
    }

    this.notify();
    return this.getState();
  }

  // ── Asymmetric Trim ─────────────────────────────────────────────────────────

  /**
   * Set a specific roller on a track to the given side, creating an
   * asymmetric trim configuration.
   *
   * This is used for L-cuts / split edits where video and audio cut
   * at different points.
   */
  setAsymmetricRoller(trackId: string, side: TrimSide): void {
    if (!this.state.active) return;
    if (this.isTrackLocked(trackId)) return;

    const roller = this.state.rollers.find((r) => r.trackId === trackId);
    if (!roller) return;

    roller.side = side;

    // Check if we now have a true asymmetric configuration
    const sides = new Set(this.state.rollers.map((r) => r.side));
    if (sides.size > 1) {
      this.state.mode = TrimMode.ASYMMETRIC;
    }

    this.notify();
    this.emit('modeChange', TrimMode.ASYMMETRIC);
  }

  /**
   * Toggle linked selection for asymmetric operations.
   * When linked, changing a roller on one track may propagate to linked tracks.
   */
  toggleLinkedSelection(): void {
    this.state.linkedSelection = !this.state.linkedSelection;
    this.notify();
  }

  /**
   * Apply an asymmetric trim: each roller applies independently with its own
   * side setting. Rollers set to A_SIDE ripple the A-side, B_SIDE rollers
   * ripple the B-side, and BOTH rollers roll.
   */
  private applyAsymmetricTrim(delta: number): TrimResult {
    const affectedClipIds: string[] = [];
    let anySuccess = false;

    // Asymmetric: apply per-roller with individual constraints
    for (const roller of this.state.rollers) {
      if (this.isTrackLocked(roller.trackId)) continue;

      let localDelta = delta;

      if (roller.side === TrimSide.BOTH) {
        // Roll on this track
        if (roller.clipAId) {
          const found = this.findClipById(roller.clipAId);
          if (found) {
            const { rightHandle } = this.getClipHandles(found.clip);
            if (localDelta > 0) localDelta = Math.min(localDelta, rightHandle);
            else localDelta = Math.max(localDelta, -(clipDuration(found.clip) - MIN_CLIP_DURATION));
          }
        }
        if (roller.clipBId) {
          const found = this.findClipById(roller.clipBId);
          if (found) {
            const { leftHandle } = this.getClipHandles(found.clip);
            if (localDelta > 0) localDelta = Math.min(localDelta, clipDuration(found.clip) - MIN_CLIP_DURATION);
            else localDelta = Math.max(localDelta, -leftHandle);
          }
        }
      } else if (roller.side === TrimSide.A_SIDE && roller.clipAId) {
        const found = this.findClipById(roller.clipAId);
        if (found) {
          if (localDelta > 0) {
            const { rightHandle } = this.getClipHandles(found.clip);
            localDelta = Math.min(localDelta, rightHandle);
          } else {
            localDelta = Math.max(localDelta, -(clipDuration(found.clip) - MIN_CLIP_DURATION));
          }
        }
      } else if (roller.side === TrimSide.B_SIDE && roller.clipBId) {
        const found = this.findClipById(roller.clipBId);
        if (found) {
          if (localDelta < 0) {
            const { leftHandle } = this.getClipHandles(found.clip);
            localDelta = Math.max(localDelta, -leftHandle);
          } else {
            localDelta = Math.min(localDelta, clipDuration(found.clip) - MIN_CLIP_DURATION);
          }
          if (found.clip.startTime + localDelta < 0) {
            localDelta = -found.clip.startTime;
          }
        }
      }

      if (Math.abs(localDelta) < TIME_EPSILON) continue;

      this.updateStore((s) => {
        const track = s.tracks.find((t) => t.id === roller.trackId);
        if (!track) return;

        if (roller.side === TrimSide.BOTH || roller.side === TrimSide.A_SIDE) {
          if (roller.clipAId) {
            const clipA = track.clips.find((c) => c.id === roller.clipAId);
            if (clipA) {
              const oldEnd = clipA.endTime;
              clipA.endTime += localDelta;
              clipA.trimEnd = Math.max(0, clipA.trimEnd - localDelta);
              affectedClipIds.push(clipA.id);

              if (roller.side === TrimSide.A_SIDE && !this.overwriteTrim) {
                for (const c of track.clips) {
                  if (c.id !== clipA.id && c.startTime >= oldEnd - TIME_EPSILON) {
                    c.startTime += localDelta;
                    c.endTime += localDelta;
                    affectedClipIds.push(c.id);
                  }
                }
              }
            }
          }
        }

        if (roller.side === TrimSide.BOTH || roller.side === TrimSide.B_SIDE) {
          if (roller.clipBId) {
            const clipB = track.clips.find((c) => c.id === roller.clipBId);
            if (clipB) {
              if (roller.side === TrimSide.BOTH) {
                clipB.startTime += localDelta;
                clipB.trimStart = Math.max(0, clipB.trimStart + localDelta);
              } else {
                // B_SIDE ripple
                const oldStart = clipB.startTime;
                clipB.startTime += localDelta;
                clipB.trimStart = Math.max(0, clipB.trimStart + localDelta);

                if (!this.overwriteTrim) {
                  for (const c of track.clips) {
                    if (c.id !== clipB.id && c.startTime >= oldStart + TIME_EPSILON) {
                      c.startTime += localDelta;
                      c.endTime += localDelta;
                      affectedClipIds.push(c.id);
                    }
                  }
                }
              }
              affectedClipIds.push(clipB.id);
            }
          }
        }
      });

      anySuccess = true;
    }

    return {
      success: anySuccess,
      delta: anySuccess ? delta : 0,
      affectedClipIds: [...new Set(affectedClipIds)],
      durationChange: 0, // Asymmetric duration change depends on per-roller behavior
    };
  }

  // ── Overwrite Trim ──────────────────────────────────────────────────────────

  /**
   * Toggle overwrite trim mode (red roller in Avid).
   *
   * When enabled, ripple trims do NOT change sequence duration; instead
   * they overwrite adjacent content.
   */
  setOverwriteTrim(enabled: boolean): void {
    this.overwriteTrim = enabled;
    this.notify();
  }

  isOverwriteTrimEnabled(): boolean {
    return this.overwriteTrim;
  }

  private getRollerTrimLimits(roller: TrimRoller): { leftSeconds: number; rightSeconds: number } {
    if (this.isTrackLocked(roller.trackId)) {
      return { leftSeconds: 0, rightSeconds: 0 };
    }

    if (this.state.mode === TrimMode.SLIP) {
      return {
        leftSeconds: this.slipState?.maxSlipLeft ?? 0,
        rightSeconds: this.slipState?.maxSlipRight ?? 0,
      };
    }

    if (this.state.mode === TrimMode.SLIDE) {
      return {
        leftSeconds: this.slideState?.maxSlideLeft ?? 0,
        rightSeconds: this.slideState?.maxSlideRight ?? 0,
      };
    }

    const resolvedClipA = roller.clipAId ? this.findClipById(roller.clipAId)?.clip ?? null : null;
    const resolvedClipB = roller.clipBId ? this.findClipById(roller.clipBId)?.clip ?? null : null;

    const leftLimits: number[] = [];
    const rightLimits: number[] = [];

    const includeASide = this.state.mode === TrimMode.ROLL || roller.side === TrimSide.A_SIDE || roller.side === TrimSide.BOTH;
    const includeBSide = this.state.mode === TrimMode.ROLL || roller.side === TrimSide.B_SIDE || roller.side === TrimSide.BOTH;

    if (includeASide && resolvedClipA) {
      leftLimits.push(Math.max(0, clipDuration(resolvedClipA) - MIN_CLIP_DURATION));
      rightLimits.push(Math.max(0, resolvedClipA.trimEnd));
    }

    if (includeBSide && resolvedClipB) {
      leftLimits.push(Math.max(0, resolvedClipB.trimStart));
      rightLimits.push(Math.max(0, clipDuration(resolvedClipB) - MIN_CLIP_DURATION));
    }

    if (this.state.mode === TrimMode.ASYMMETRIC && roller.side === TrimSide.A_SIDE && resolvedClipA) {
      return {
        leftSeconds: Math.max(0, clipDuration(resolvedClipA) - MIN_CLIP_DURATION),
        rightSeconds: Math.max(0, resolvedClipA.trimEnd),
      };
    }

    if (this.state.mode === TrimMode.ASYMMETRIC && roller.side === TrimSide.B_SIDE && resolvedClipB) {
      return {
        leftSeconds: Math.max(0, resolvedClipB.trimStart),
        rightSeconds: Math.max(0, clipDuration(resolvedClipB) - MIN_CLIP_DURATION),
      };
    }

    if (leftLimits.length === 0 && rightLimits.length === 0) {
      return { leftSeconds: 0, rightSeconds: 0 };
    }

    return {
      leftSeconds: leftLimits.length > 0 ? Math.min(...leftLimits) : 0,
      rightSeconds: rightLimits.length > 0 ? Math.min(...rightLimits) : 0,
    };
  }

  // ── Query Methods ───────────────────────────────────────────────────────────

  /** Get a copy of the current trim state. */
  getState(): TrimState {
    return {
      ...this.state,
      originalState: new Map(this.state.originalState),
      rollers: this.state.rollers.map((r) => ({ ...r })),
    };
  }

  /** Whether the engine is currently in an active trim session. */
  isInTrimMode(): boolean {
    return this.state.active;
  }

  /** The current trim mode. */
  getCurrentMode(): TrimMode {
    return this.state.mode;
  }

  /**
   * Get the trim display information for the Composer monitors.
   *
   * Returns the A-side and B-side frame counts relative to the original
   * edit point, plus the running trim counter.
   */
  getTrimDisplay(): { aSideFrame: number; bSideFrame: number; trimCounter: number } {
    const { projectSettings } = this.getStore();
    const frameRate = projectSettings.frameRate || 24;

    const totalFrames = Math.round(this.state.totalDelta * frameRate);
    const hasASideSelection = this.state.rollers.some((roller) => (
      roller.side === TrimSide.A_SIDE || roller.side === TrimSide.BOTH
    ));
    const hasBSideSelection = this.state.rollers.some((roller) => (
      roller.side === TrimSide.B_SIDE || roller.side === TrimSide.BOTH
    ));

    if (this.state.mode === TrimMode.SLIP) {
      return {
        aSideFrame: -totalFrames,
        bSideFrame: totalFrames,
        trimCounter: totalFrames,
      };
    }

    if (hasASideSelection && hasBSideSelection) {
      return {
        aSideFrame: -totalFrames,
        bSideFrame: totalFrames,
        trimCounter: totalFrames,
      };
    }

    return {
      aSideFrame: hasASideSelection ? totalFrames : 0,
      bSideFrame: hasBSideSelection ? totalFrames : 0,
      trimCounter: totalFrames,
    };
  }

  getSessionDiagnostics(frameRate: number): TrimSessionDiagnostics {
    const safeFrameRate = frameRate > 0
      ? frameRate
      : (this.getStore().sequenceSettings.fps || this.getStore().projectSettings.frameRate || 24);

    if (!this.state.active) {
      return {
        active: false,
        mode: this.state.mode,
        linkedSelection: this.state.linkedSelection,
        hasLockedRollers: false,
        constrainedTrimLeftFrames: 0,
        constrainedTrimRightFrames: 0,
        rollers: [],
      };
    }

    const rollers = this.state.rollers.map<TrimRollerDiagnostics>((roller) => {
      const { leftSeconds, rightSeconds } = this.getRollerTrimLimits(roller);
      const includeASide = this.state.mode === TrimMode.ROLL || roller.side === TrimSide.A_SIDE || roller.side === TrimSide.BOTH;
      const includeBSide = this.state.mode === TrimMode.ROLL || roller.side === TrimSide.B_SIDE || roller.side === TrimSide.BOTH;

      return {
        trackId: roller.trackId,
        editPointTime: roller.editPointTime,
        side: roller.side,
        locked: this.isTrackLocked(roller.trackId),
        missingSides: [
          ...(includeASide && !roller.clipAId ? ['A' as const] : []),
          ...(includeBSide && !roller.clipBId ? ['B' as const] : []),
        ],
        availableTrimLeftFrames: secondsToFrames(leftSeconds, safeFrameRate),
        availableTrimRightFrames: secondsToFrames(rightSeconds, safeFrameRate),
      };
    });

    const availableLeftFrames = rollers
      .filter((roller) => !roller.locked)
      .map((roller) => roller.availableTrimLeftFrames);
    const availableRightFrames = rollers
      .filter((roller) => !roller.locked)
      .map((roller) => roller.availableTrimRightFrames);

    return {
      active: true,
      mode: this.state.mode,
      linkedSelection: this.state.linkedSelection,
      hasLockedRollers: rollers.some((roller) => roller.locked),
      constrainedTrimLeftFrames: availableLeftFrames.length > 0 ? Math.min(...availableLeftFrames) : 0,
      constrainedTrimRightFrames: availableRightFrames.length > 0 ? Math.min(...availableRightFrames) : 0,
      rollers,
    };
  }

  /**
   * Check whether a trim by the given delta is possible without exceeding
   * handle limits or minimum durations.
   */
  canTrim(delta: number): boolean {
    if (!this.state.active) return false;
    if (Math.abs(delta) < TIME_EPSILON) return true;

    for (const roller of this.state.rollers) {
      if (this.isTrackLocked(roller.trackId)) continue;

      if (this.state.mode === TrimMode.ROLL || roller.side === TrimSide.BOTH) {
        // Roll: check both sides
        if (roller.clipAId) {
          const found = this.findClipById(roller.clipAId);
          if (found) {
            if (delta > 0 && delta > found.clip.trimEnd) return false;
            if (delta < 0 && -delta > clipDuration(found.clip) - MIN_CLIP_DURATION) return false;
          }
        }
        if (roller.clipBId) {
          const found = this.findClipById(roller.clipBId);
          if (found) {
            if (delta > 0 && delta > clipDuration(found.clip) - MIN_CLIP_DURATION) return false;
            if (delta < 0 && -delta > found.clip.trimStart) return false;
          }
        }
      } else if (roller.side === TrimSide.A_SIDE && roller.clipAId) {
        const found = this.findClipById(roller.clipAId);
        if (found) {
          if (delta > 0 && delta > found.clip.trimEnd) return false;
          if (delta < 0 && -delta > clipDuration(found.clip) - MIN_CLIP_DURATION) return false;
        }
      } else if (roller.side === TrimSide.B_SIDE && roller.clipBId) {
        const found = this.findClipById(roller.clipBId);
        if (found) {
          if (delta < 0 && -delta > found.clip.trimStart) return false;
          if (delta > 0 && delta > clipDuration(found.clip) - MIN_CLIP_DURATION) return false;
        }
      }
    }

    return true;
  }

  // ── Convenience API (Avid-style entry / apply / exit) ────────────────────

  /**
   * Enter trim mode on a specific clip by its ID and side.
   *
   * This is a higher-level convenience wrapper around `enterTrimMode()`
   * that resolves the clip's track and edit point automatically. Useful
   * for keyboard-driven workflows where the user simply selects a clip
   * and presses a trim key.
   *
   * @param clipId  The clip to engage trim on.
   * @param side    Which side to trim: `'head'` trims the start (B-side
   *                ripple), `'tail'` trims the end (A-side ripple).
   * @returns The resulting TrimState, or null if the clip was not found.
   */
  enterTrimModeOnClip(
    clipId: string,
    side: 'head' | 'tail',
  ): TrimState | null {
    const found = this.findClipById(clipId);
    if (!found) return null;

    const { clip, track } = found;
    const editPointTime = side === 'head' ? clip.startTime : clip.endTime;
    const trimSide = side === 'head' ? TrimSide.B_SIDE : TrimSide.A_SIDE;

    return this.enterTrimMode([track.id], editPointTime, trimSide);
  }

  /**
   * Apply an incremental trim delta expressed in frames.
   *
   * Reads the project frame rate from the editor store and converts the
   * frame count to a time delta before delegating to `trimByDelta`.
   *
   * @param frames  Number of frames to trim (positive = right, negative = left).
   * @returns The TrimResult from the underlying operation.
   */
  applyTrimDelta(frames: number): TrimResult {
    const { sequenceSettings, projectSettings } = this.getStore();
    const frameRate = sequenceSettings?.fps ?? projectSettings?.frameRate ?? 24;
    return this.trimByFrames(frames, frameRate);
  }

  /**
   * Commit and exit trim mode.
   *
   * This is an alias for `exitTrimMode()` provided for API symmetry
   * with `enterTrimModeOnClip` and `applyTrimDelta`.
   */
  commitTrim(): void {
    this.exitTrimMode();
  }

  // ── Event System ────────────────────────────────────────────────────────────

  /**
   * Subscribe to any state change in the trim engine.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /**
   * Subscribe to a specific trim event.
   *
   * @param event  The event type.
   * @param cb     Callback invoked when the event fires.
   * @returns An unsubscribe function.
   */
  on(
    event: 'enter' | 'exit' | 'cancel' | 'trim' | 'modeChange',
    cb: (...args: unknown[]) => void,
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(cb);

    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(cb);
      }
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────────

/** Singleton trim engine instance. */
export const trimEngine = new TrimEngine();
