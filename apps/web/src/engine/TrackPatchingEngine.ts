// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Track Patching & Source/Record Monitoring Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements Avid Media Composer's track selector panel behaviour:
//  - Source-to-record track patching (dragging source tracks to timeline tracks)
//  - Record track enable/disable for selective editing
//  - Video monitor track selection (topmost visible video)
//  - Sync lock, track lock, solo, and mute states
//

import type { Track, TrackType } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A mapping from a source clip track to a timeline (record) track. */
export interface TrackPatch {
  /** Source track identifier, e.g. 'src-v1', 'src-a1'. */
  sourceTrackId: string;
  /** Media type of the source track. */
  sourceTrackType: 'VIDEO' | 'AUDIO';
  /** One-based index of this source track within its type (1, 2, 3...). */
  sourceTrackIndex: number;
  /** Timeline (record) track identifier this source is mapped to. */
  recordTrackId: string;
  /** Whether this patch is currently active. */
  enabled: boolean;
}

/** Describes a source track as loaded from a source clip. */
export interface SourceTrackDescriptor {
  id: string;
  type: 'VIDEO' | 'AUDIO';
  index: number;
}

/** Monitor and edit-readiness state for timeline record tracks. */
export interface TrackMonitorState {
  /** The single video track being monitored (topmost visible), or null. */
  videoMonitorTrackId: string | null;
  /** Set of record track IDs enabled for editing. */
  enabledRecordTracks: Set<string>;
  /** Set of record track IDs that are soloed. */
  soloTracks: Set<string>;
  /** Set of record track IDs that are muted. */
  mutedTracks: Set<string>;
  /** Set of record track IDs with sync lock enabled. */
  syncLocks: Set<string>;
  /** Set of record track IDs that are fully locked (prevent all editing). */
  lockedTracks: Set<string>;
}

/** Serialisable snapshot of the full engine state. */
export interface TrackPatchingState {
  patches: TrackPatch[];
  monitor: TrackMonitorState;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive track type from a source track identifier prefix.
 * E.g. 'src-v1' -> 'VIDEO', 'src-a3' -> 'AUDIO'.
 */
function inferTrackType(sourceTrackId: string): 'VIDEO' | 'AUDIO' | null {
  const lower = sourceTrackId.toLowerCase();
  if (lower.includes('-v')) return 'VIDEO';
  if (lower.includes('-a')) return 'AUDIO';
  return null;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Track patching and source/record monitoring engine.
 *
 * Models the Avid Media Composer track selector panel where source tracks from
 * the clip in the Source Monitor are mapped to record (timeline) tracks.
 * Controls which tracks participate in edits via enable/disable, sync lock,
 * and full track lock, plus which video track is monitored.
 */
export class TrackPatchingEngine {
  // ── Private state ───────────────────────────────────────────────────────

  /** Source tracks currently available (loaded from a source clip). */
  private sourceTracks: SourceTrackDescriptor[] = [];

  /** Source-track-id -> patch mapping. */
  private patchMap = new Map<string, TrackPatch>();

  /** Reverse lookup: record-track-id -> source-track-id. */
  private reversePatchMap = new Map<string, string>();

  /** Monitor / editing state. */
  private monitorState: TrackMonitorState = {
    videoMonitorTrackId: null,
    enabledRecordTracks: new Set(),
    soloTracks: new Set(),
    mutedTracks: new Set(),
    syncLocks: new Set(),
    lockedTracks: new Set(),
  };

  /** Registered change listeners. */
  private listeners = new Set<() => void>();

  // ═══════════════════════════════════════════════════════════════════════
  //  Patching
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set the available source tracks (called when a source clip is loaded
   * into the Source Monitor). Clears existing patches.
   *
   * @param tracks Array of source track descriptors from the loaded clip.
   * @example
   * trackPatchingEngine.setSourceTracks([
   *   { id: 'src-v1', type: 'VIDEO', index: 1 },
   *   { id: 'src-a1', type: 'AUDIO', index: 1 },
   *   { id: 'src-a2', type: 'AUDIO', index: 2 },
   * ]);
   */
  setSourceTracks(tracks: SourceTrackDescriptor[]): void {
    this.sourceTracks = tracks.map((t) => ({ ...t }));
    this.patchMap.clear();
    this.reversePatchMap.clear();
    this.notify();
  }

  /**
   * Map a source track to a record (timeline) track.
   *
   * If the source track is already patched elsewhere, the previous mapping
   * is removed. If another source track is already patched to the target
   * record track, that mapping is also removed (one-to-one constraint).
   *
   * @param sourceTrackId  Source track identifier (e.g. 'src-v1').
   * @param recordTrackId  Timeline track identifier.
   * @throws Error if `sourceTrackId` is not in the current source track list.
   * @example
   * trackPatchingEngine.patchSourceToRecord('src-v1', 'timeline-v2');
   */
  patchSourceToRecord(sourceTrackId: string, recordTrackId: string): void {
    const descriptor = this.sourceTracks.find((t) => t.id === sourceTrackId);
    if (!descriptor) {
      console.warn(
        `[TrackPatchingEngine] Unknown source track "${sourceTrackId}". ` +
        'Call setSourceTracks() first.',
      );
      return;
    }

    // Remove any existing patch from this source track.
    this.removeExistingPatch(sourceTrackId);

    // Remove any other source track currently patched to this record track.
    const existingSource = this.reversePatchMap.get(recordTrackId);
    if (existingSource !== undefined) {
      this.removeExistingPatch(existingSource);
    }

    const patch: TrackPatch = {
      sourceTrackId,
      sourceTrackType: descriptor.type,
      sourceTrackIndex: descriptor.index,
      recordTrackId,
      enabled: true,
    };

    this.patchMap.set(sourceTrackId, patch);
    this.reversePatchMap.set(recordTrackId, sourceTrackId);
    this.notify();
  }

  /**
   * Remove the patch for a source track.
   *
   * @param sourceTrackId Source track identifier.
   * @example
   * trackPatchingEngine.unpatchSource('src-a2');
   */
  unpatchSource(sourceTrackId: string): void {
    this.removeExistingPatch(sourceTrackId);
    this.notify();
  }

  /**
   * Return all current patches as an array (snapshot).
   *
   * @returns Array of TrackPatch objects.
   * @example
   * const patches = trackPatchingEngine.getPatches();
   */
  getPatches(): TrackPatch[] {
    return Array.from(this.patchMap.values()).map((p) => ({ ...p }));
  }

  /**
   * Get the record (timeline) track that a source track is patched to.
   *
   * @param sourceTrackId Source track identifier.
   * @returns Record track ID, or `null` if unpatched.
   */
  getRecordTrackForSource(sourceTrackId: string): string | null {
    const patch = this.patchMap.get(sourceTrackId);
    return patch ? patch.recordTrackId : null;
  }

  /**
   * Get the source track that is patched to a given record (timeline) track.
   *
   * @param recordTrackId Timeline track identifier.
   * @returns Source track ID, or `null` if no source is patched here.
   */
  getSourceTrackForRecord(recordTrackId: string): string | null {
    return this.reversePatchMap.get(recordTrackId) ?? null;
  }

  /**
   * Auto-patch source tracks to matching record tracks by convention.
   *
   * Matches source V1 -> record V1, source A1 -> record A1, etc.
   * Requires that `setSourceTracks()` has been called and that record tracks
   * have IDs or names containing 'v1', 'a1', etc. (case-insensitive).
   *
   * If the caller has record tracks available, pass them; otherwise the
   * engine will patch based on a naming convention using type + index.
   *
   * @param recordTracks Optional array of timeline Track objects. When
   *   provided, matching is done against `track.name` and `track.type`.
   *   When omitted, record track IDs are synthesised as e.g. 'v1', 'a1'.
   * @example
   * trackPatchingEngine.autoPatch();
   * trackPatchingEngine.autoPatch(useEditorStore.getState().tracks);
   */
  autoPatch(recordTracks?: Track[]): void {
    this.patchMap.clear();
    this.reversePatchMap.clear();

    if (recordTracks && recordTracks.length > 0) {
      this.autoPatchWithTracks(recordTracks);
    } else {
      this.autoPatchByConvention();
    }

    this.notify();
  }

  // ── Auto-patch helpers ──────────────────────────────────────────────────

  /** Match source tracks to record tracks using the store Track objects. */
  private autoPatchWithTracks(recordTracks: Track[]): void {
    // Index record tracks by type and position.
    const videoTracks = recordTracks
      .filter((t) => t.type === 'VIDEO')
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const audioTracks = recordTracks
      .filter((t) => t.type === 'AUDIO')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const src of this.sourceTracks) {
      const pool = src.type === 'VIDEO' ? videoTracks : audioTracks;
      // index is 1-based; find matching by position.
      const matchIndex = src.index - 1;
      if (matchIndex >= 0 && matchIndex < pool.length) {
        const recordTrack = pool[matchIndex];
        const patch: TrackPatch = {
          sourceTrackId: src.id,
          sourceTrackType: src.type,
          sourceTrackIndex: src.index,
          recordTrackId: recordTrack!.id!,
          enabled: true,
        };
        this.patchMap.set(src.id, patch);
        this.reversePatchMap.set(recordTrack!.id!, src.id);
      }
    }
  }

  /** Synthesise record track IDs when no Track objects are provided. */
  private autoPatchByConvention(): void {
    for (const src of this.sourceTracks) {
      const prefix = src.type === 'VIDEO' ? 'v' : 'a';
      const recordTrackId = `${prefix}${src.index}`;
      const patch: TrackPatch = {
        sourceTrackId: src.id,
        sourceTrackType: src.type,
        sourceTrackIndex: src.index,
        recordTrackId,
        enabled: true,
      };
      this.patchMap.set(src.id, patch);
      this.reversePatchMap.set(recordTrackId, src.id);
    }
  }

  /** Remove an existing patch for a given source track (internal). */
  private removeExistingPatch(sourceTrackId: string): void {
    const existing = this.patchMap.get(sourceTrackId);
    if (existing) {
      this.reversePatchMap.delete(existing.recordTrackId);
      this.patchMap.delete(sourceTrackId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Track Enable / Disable
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Enable a record track for editing.
   * @param trackId Timeline track identifier.
   */
  enableRecordTrack(trackId: string): void {
    if (this.monitorState.lockedTracks.has(trackId)) {
      console.warn(
        `[TrackPatchingEngine] Track "${trackId}" is locked; cannot enable.`,
      );
      return;
    }
    this.monitorState.enabledRecordTracks.add(trackId);
    this.notify();
  }

  /**
   * Disable a record track so it does not participate in edits.
   * @param trackId Timeline track identifier.
   */
  disableRecordTrack(trackId: string): void {
    this.monitorState.enabledRecordTracks.delete(trackId);
    this.notify();
  }

  /**
   * Toggle the enabled state of a record track.
   * @param trackId Timeline track identifier.
   */
  toggleRecordTrack(trackId: string): void {
    if (this.monitorState.enabledRecordTracks.has(trackId)) {
      this.disableRecordTrack(trackId);
    } else {
      this.enableRecordTrack(trackId);
    }
  }

  /**
   * Check whether a record track is enabled for editing.
   * @param trackId Timeline track identifier.
   */
  isRecordTrackEnabled(trackId: string): boolean {
    return this.monitorState.enabledRecordTracks.has(trackId);
  }

  /**
   * Return all enabled record track IDs.
   * @returns Array of enabled track IDs (order is insertion order).
   */
  getEnabledRecordTracks(): string[] {
    return Array.from(this.monitorState.enabledRecordTracks);
  }

  /**
   * Return enabled record tracks that are patched to video source tracks.
   *
   * A record track counts as "video" if a VIDEO source is currently
   * patched to it **or** if its ID/prefix suggests a video track.
   *
   * @param recordTracks Optional store tracks for definitive type lookup.
   * @returns Array of enabled video record track IDs.
   */
  getEnabledVideoTracks(recordTracks?: Track[]): string[] {
    return this.getEnabledTracksByType('VIDEO', recordTracks);
  }

  /**
   * Return enabled record tracks that are patched to audio source tracks.
   *
   * @param recordTracks Optional store tracks for definitive type lookup.
   * @returns Array of enabled audio record track IDs.
   */
  getEnabledAudioTracks(recordTracks?: Track[]): string[] {
    return this.getEnabledTracksByType('AUDIO', recordTracks);
  }

  /** Filter enabled tracks by media type. */
  private getEnabledTracksByType(
    type: 'VIDEO' | 'AUDIO',
    recordTracks?: Track[],
  ): string[] {
    const enabled = this.getEnabledRecordTracks();
    const trackMap = new Map<string, Track>();
    if (recordTracks) {
      for (const t of recordTracks) {
        trackMap.set(t.id, t);
      }
    }

    return enabled.filter((trackId) => {
      // Check store track type first.
      const storeTrack = trackMap.get(trackId);
      if (storeTrack) {
        return storeTrack.type === type;
      }

      // Fall back to reverse-patch lookup.
      const sourceId = this.reversePatchMap.get(trackId);
      if (sourceId) {
        const patch = this.patchMap.get(sourceId);
        if (patch) return patch.sourceTrackType === type;
      }

      // Fall back to ID convention (e.g. 'v1' vs 'a1').
      const inferred = inferTrackType(trackId);
      return inferred === type;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Monitoring
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set which video track is currently monitored (topmost visible).
   * Only one video track can be monitored at a time.
   *
   * @param trackId Timeline video track identifier.
   * @example
   * trackPatchingEngine.setVideoMonitorTrack('v2');
   */
  setVideoMonitorTrack(trackId: string): void {
    this.monitorState.videoMonitorTrackId = trackId;
    this.notify();
  }

  /**
   * Get the currently monitored video track.
   * @returns Track ID or `null`.
   */
  getVideoMonitorTrack(): string | null {
    return this.monitorState.videoMonitorTrackId;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Solo / Mute
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Toggle the solo state of a record track. When any track is soloed,
   * only soloed tracks are audible during playback.
   *
   * @param trackId Timeline track identifier.
   */
  toggleSolo(trackId: string): void {
    if (this.monitorState.soloTracks.has(trackId)) {
      this.monitorState.soloTracks.delete(trackId);
    } else {
      this.monitorState.soloTracks.add(trackId);
    }
    this.notify();
  }

  /** Whether a track is soloed. */
  isSoloed(trackId: string): boolean {
    return this.monitorState.soloTracks.has(trackId);
  }

  /** All currently soloed track IDs. */
  getSoloedTracks(): string[] {
    return Array.from(this.monitorState.soloTracks);
  }

  /**
   * Toggle the mute state of a record track.
   * @param trackId Timeline track identifier.
   */
  toggleMute(trackId: string): void {
    if (this.monitorState.mutedTracks.has(trackId)) {
      this.monitorState.mutedTracks.delete(trackId);
    } else {
      this.monitorState.mutedTracks.add(trackId);
    }
    this.notify();
  }

  /** Whether a track is muted. */
  isMuted(trackId: string): boolean {
    return this.monitorState.mutedTracks.has(trackId);
  }

  /** All currently muted track IDs. */
  getMutedTracks(): string[] {
    return Array.from(this.monitorState.mutedTracks);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Sync Locks
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Toggle sync lock on a record track.
   *
   * When sync lock is enabled, performing splice/extract edits on other
   * tracks causes this track to receive compensating edits (filler
   * insertion or removal) to maintain synchronisation.
   *
   * @param trackId Timeline track identifier.
   * @example
   * trackPatchingEngine.toggleSyncLock('a1');
   */
  toggleSyncLock(trackId: string): void {
    if (this.monitorState.syncLocks.has(trackId)) {
      this.monitorState.syncLocks.delete(trackId);
    } else {
      this.monitorState.syncLocks.add(trackId);
    }
    this.notify();
  }

  /** Whether a track has sync lock enabled. */
  isSyncLocked(trackId: string): boolean {
    return this.monitorState.syncLocks.has(trackId);
  }

  /** All tracks with sync lock enabled. */
  getSyncLockedTracks(): string[] {
    return Array.from(this.monitorState.syncLocks);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Track Locking
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Toggle full track lock. A locked track prevents all editing operations
   * (clips cannot be moved, trimmed, or added).
   *
   * Locking a track also disables it for editing.
   *
   * @param trackId Timeline track identifier.
   * @example
   * trackPatchingEngine.toggleTrackLock('v1');
   */
  toggleTrackLock(trackId: string): void {
    if (this.monitorState.lockedTracks.has(trackId)) {
      this.monitorState.lockedTracks.delete(trackId);
    } else {
      this.monitorState.lockedTracks.add(trackId);
      // Locking implicitly disables the track for editing.
      this.monitorState.enabledRecordTracks.delete(trackId);
    }
    this.notify();
  }

  /** Whether a track is fully locked. */
  isTrackLocked(trackId: string): boolean {
    return this.monitorState.lockedTracks.has(trackId);
  }

  /** All fully locked track IDs. */
  getLockedTracks(): string[] {
    return Array.from(this.monitorState.lockedTracks);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Queries
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Determine which record tracks should receive compensating sync edits
   * when a splice or extract is performed on the given set of edited tracks.
   *
   * A track qualifies for sync compensation when:
   *  1. It has sync lock enabled.
   *  2. It is not one of the tracks being directly edited.
   *  3. It is not fully locked.
   *
   * @param editedTrackIds Track IDs being directly edited.
   * @returns Track IDs that need sync compensation.
   */
  getTracksNeedingSyncCompensation(editedTrackIds: string[]): string[] {
    const editedSet = new Set(editedTrackIds);
    return this.getSyncLockedTracks().filter(
      (id) => !editedSet.has(id) && !this.monitorState.lockedTracks.has(id),
    );
  }

  /**
   * Check whether an edit is permitted on a given track.
   * An edit is blocked if the track is fully locked.
   *
   * @param trackId Timeline track identifier.
   * @returns `true` if editing is allowed.
   */
  canEditTrack(trackId: string): boolean {
    return !this.monitorState.lockedTracks.has(trackId);
  }

  /**
   * Return the complete set of record track IDs that will be affected by
   * an edit: the explicitly enabled tracks plus any sync-locked tracks
   * that need compensating edits.
   *
   * @returns Object with `editTracks` and `syncTracks` arrays.
   */
  getAffectedTracks(): { editTracks: string[]; syncTracks: string[] } {
    const editTracks = this.getEnabledRecordTracks().filter(
      (id) => !this.monitorState.lockedTracks.has(id),
    );
    const syncTracks = this.getTracksNeedingSyncCompensation(editTracks);
    return { editTracks, syncTracks };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe / State
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to state changes. The callback fires after any mutation
   * (patching, enable/disable, lock, sync lock, monitor changes).
   *
   * @param cb Callback invoked on state change.
   * @returns An unsubscribe function.
   * @example
   * const unsub = trackPatchingEngine.subscribe(() => updateTrackPanel());
   * // later: unsub();
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Return a serialisable snapshot of the full engine state.
   *
   * @returns Object containing patches array and monitor state.
   */
  getState(): TrackPatchingState {
    return {
      patches: this.getPatches(),
      monitor: {
        videoMonitorTrackId: this.monitorState.videoMonitorTrackId,
        enabledRecordTracks: new Set(this.monitorState.enabledRecordTracks),
        soloTracks: new Set(this.monitorState.soloTracks),
        mutedTracks: new Set(this.monitorState.mutedTracks),
        syncLocks: new Set(this.monitorState.syncLocks),
        lockedTracks: new Set(this.monitorState.lockedTracks),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Reset / Dispose
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Reset all patching and monitor state to defaults.
   * @example
   * trackPatchingEngine.reset();
   */
  reset(): void {
    this.sourceTracks = [];
    this.patchMap.clear();
    this.reversePatchMap.clear();
    this.monitorState = {
      videoMonitorTrackId: null,
      enabledRecordTracks: new Set(),
      soloTracks: new Set(),
      mutedTracks: new Set(),
      syncLocks: new Set(),
      lockedTracks: new Set(),
    };
    this.notify();
  }

  /**
   * Dispose the engine, clearing all state and listeners.
   * @example
   * trackPatchingEngine.dispose();
   */
  dispose(): void {
    this.reset();
    this.listeners.clear();
  }

  // ── Internal ────────────────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[TrackPatchingEngine] Subscriber error:', err);
      }
    });
  }
}

/** Singleton track patching engine instance. */
export const trackPatchingEngine = new TrackPatchingEngine();
