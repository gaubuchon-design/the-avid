import { useEditorStore, Clip, Track, makeClip } from '../store/editor.store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SourceMonitorState {
  assetId: string | null;
  inPoint: number | null;
  outPoint: number | null;
  playheadTime: number;
  duration: number;
  history: { assetId: string; inPoint: number | null; outPoint: number | null }[];
}

export interface RecordMonitorState {
  inPoint: number | null;
  outPoint: number | null;
  playheadTime: number;
}

export interface EditResult {
  success: boolean;
  description: string;
  affectedTrackIds: string[];
  affectedClipIds: string[];
  durationChange: number;
  newClipIds: string[];
}

export interface MarkState {
  sourceIn: number | null;
  sourceOut: number | null;
  recordIn: number | null;
  recordOut: number | null;
}

export type EditType =
  | 'splice-in'
  | 'overwrite'
  | 'extract'
  | 'lift'
  | 'replace'
  | 'fit-to-fill'
  | 'trim-to-fill';

/** Patching: maps a source track type to a target record track. */
interface TrackPatch {
  sourceType: 'video' | 'audio';
  recordTrackId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function failResult(description: string): EditResult {
  return {
    success: false,
    description,
    affectedTrackIds: [],
    affectedClipIds: [],
    durationChange: 0,
    newClipIds: [],
  };
}

function successResult(
  description: string,
  opts: Partial<Omit<EditResult, 'success' | 'description'>> = {},
): EditResult {
  return {
    success: true,
    description,
    affectedTrackIds: opts.affectedTrackIds ?? [],
    affectedClipIds: opts.affectedClipIds ?? [],
    durationChange: opts.durationChange ?? 0,
    newClipIds: opts.newClipIds ?? [],
  };
}

// ─── EditOperationsEngine ─────────────────────────────────────────────────────

/**
 * Core editing workflow engine implementing Avid Media Composer's four primary
 * edit operations (Splice-In, Overwrite, Extract, Lift) plus supporting
 * operations (Replace, Fit-to-Fill, Trim-to-Fill).
 *
 * Operates on the Zustand editor store via `useEditorStore.getState()` and
 * `useEditorStore.setState()`.
 *
 * Implements the three-point editing paradigm: set 3 of 4 possible marks
 * (Source IN, Source OUT, Record IN, Record OUT) and the engine calculates
 * the 4th automatically.
 */
export class EditOperationsEngine {
  // ── Source monitor state ─────────────────────────────────────────────────

  private _sourceMonitor: SourceMonitorState = {
    assetId: null,
    inPoint: null,
    outPoint: null,
    playheadTime: 0,
    duration: 0,
    history: [],
  };

  // ── Clipboard ───────────────────────────────────────────────────────────

  private _clipboard: Clip[] | null = null;

  // ── Accessors ───────────────────────────────────────────────────────────

  /** Get the current state of the source monitor. */
  get sourceMonitor(): Readonly<SourceMonitorState> {
    return this._sourceMonitor;
  }

  /** Get the record monitor state derived from the editor store. */
  get recordMonitor(): RecordMonitorState {
    const state = useEditorStore.getState();
    return {
      inPoint: state.inPoint,
      outPoint: state.outPoint,
      playheadTime: state.playheadTime,
    };
  }

  // ── Source monitor operations ───────────────────────────────────────────

  /**
   * Load an asset into the source monitor. Pushes the previous asset to
   * the history ring so the editor can recall recently loaded clips.
   */
  loadSource(assetId: string, duration: number): void {
    // Push current to history before replacing
    if (this._sourceMonitor.assetId !== null) {
      this._sourceMonitor.history = [
        {
          assetId: this._sourceMonitor.assetId,
          inPoint: this._sourceMonitor.inPoint,
          outPoint: this._sourceMonitor.outPoint,
        },
        ...this._sourceMonitor.history.filter(
          (h) => h.assetId !== this._sourceMonitor.assetId,
        ),
      ].slice(0, 20); // keep last 20
    }

    this._sourceMonitor = {
      ...this._sourceMonitor,
      assetId,
      inPoint: null,
      outPoint: null,
      playheadTime: 0,
      duration,
    };
  }

  /** Set the source monitor playhead position. */
  setSourcePlayhead(time: number): void {
    this._sourceMonitor.playheadTime = clamp(time, 0, this._sourceMonitor.duration);
  }

  // ── Mark Operations ─────────────────────────────────────────────────────

  /**
   * Set an IN point at the current playhead position.
   * @param monitor Which monitor to set the mark on.
   */
  markIn(monitor: 'source' | 'record'): void {
    if (monitor === 'source') {
      this._sourceMonitor.inPoint = this._sourceMonitor.playheadTime;
      // Ensure IN is before OUT
      if (
        this._sourceMonitor.outPoint !== null &&
        this._sourceMonitor.inPoint > this._sourceMonitor.outPoint
      ) {
        this._sourceMonitor.outPoint = null;
      }
    } else {
      const state = useEditorStore.getState();
      useEditorStore.setState({ inPoint: state.playheadTime });
      // Ensure IN is before OUT
      if (state.outPoint !== null && state.playheadTime > state.outPoint) {
        useEditorStore.setState({ outPoint: null });
      }
    }
  }

  /**
   * Set an OUT point at the current playhead position.
   * @param monitor Which monitor to set the mark on.
   */
  markOut(monitor: 'source' | 'record'): void {
    if (monitor === 'source') {
      this._sourceMonitor.outPoint = this._sourceMonitor.playheadTime;
      // Ensure OUT is after IN
      if (
        this._sourceMonitor.inPoint !== null &&
        this._sourceMonitor.outPoint < this._sourceMonitor.inPoint
      ) {
        this._sourceMonitor.inPoint = null;
      }
    } else {
      const state = useEditorStore.getState();
      useEditorStore.setState({ outPoint: state.playheadTime });
      // Ensure OUT is after IN
      if (state.inPoint !== null && state.playheadTime < state.inPoint) {
        useEditorStore.setState({ inPoint: null });
      }
    }
  }

  /**
   * Auto-mark IN and OUT around the clip under the record position indicator.
   * Marks the boundaries of the topmost clip at the current playhead.
   */
  markClip(): void {
    const state = useEditorStore.getState();
    const playhead = state.playheadTime;

    for (const track of state.tracks) {
      if (track.locked || track.muted) continue;
      const clip = track.clips.find(
        (c) => c.startTime <= playhead && c.endTime > playhead,
      );
      if (clip) {
        useEditorStore.setState({
          inPoint: clip.startTime,
          outPoint: clip.endTime,
        });
        return;
      }
    }
  }

  /** Clear all IN/OUT marks on both source and record monitors. */
  clearMarks(): void {
    this._sourceMonitor.inPoint = null;
    this._sourceMonitor.outPoint = null;
    useEditorStore.setState({ inPoint: null, outPoint: null });
  }

  /** Clear just the IN mark on the active monitor context. */
  clearIn(): void {
    this._sourceMonitor.inPoint = null;
    useEditorStore.setState({ inPoint: null });
  }

  /** Clear just the OUT mark on the active monitor context. */
  clearOut(): void {
    this._sourceMonitor.outPoint = null;
    useEditorStore.setState({ outPoint: null });
  }

  /** Jump the record playhead to the record IN point. */
  goToIn(): void {
    const state = useEditorStore.getState();
    if (state.inPoint !== null) {
      useEditorStore.getState().setPlayhead(state.inPoint);
    }
  }

  /** Jump the record playhead to the record OUT point. */
  goToOut(): void {
    const state = useEditorStore.getState();
    if (state.outPoint !== null) {
      useEditorStore.getState().setPlayhead(state.outPoint);
    }
  }

  /** Get the current mark state across both monitors. */
  getMarkState(): MarkState {
    const state = useEditorStore.getState();
    return {
      sourceIn: this._sourceMonitor.inPoint,
      sourceOut: this._sourceMonitor.outPoint,
      recordIn: state.inPoint,
      recordOut: state.outPoint,
    };
  }

  /** Duration between source IN and OUT marks, or null if incomplete. */
  getSourceDuration(): number | null {
    const { inPoint, outPoint } = this._sourceMonitor;
    if (inPoint === null || outPoint === null) return null;
    return Math.abs(outPoint - inPoint);
  }

  /** Duration between record IN and OUT marks, or null if incomplete. */
  getRecordDuration(): number | null {
    const state = useEditorStore.getState();
    if (state.inPoint === null || state.outPoint === null) return null;
    return Math.abs(state.outPoint - state.inPoint);
  }

  // ── Three-Point Edit Resolution ─────────────────────────────────────────

  /**
   * Given any 3 marks, calculate the 4th. If all 4 are set and durations
   * differ, returns all 4 as-is (for Fit-to-Fill / Trim-to-Fill decisions).
   *
   * Returns null if fewer than 3 marks are set and no fallback position can
   * be inferred.
   */
  resolveThreePointEdit(): {
    sourceIn: number;
    sourceOut: number;
    recordIn: number;
    recordOut: number;
  } | null {
    const marks = this.getMarkState();
    const state = useEditorStore.getState();

    let sourceIn = marks.sourceIn;
    let sourceOut = marks.sourceOut;
    let recordIn = marks.recordIn;
    let recordOut = marks.recordOut;

    const setCount = [sourceIn, sourceOut, recordIn, recordOut].filter(
      (m) => m !== null,
    ).length;

    // All 4 set: return them directly (caller decides fit-to-fill etc.)
    if (setCount === 4) {
      return {
        sourceIn: sourceIn!,
        sourceOut: sourceOut!,
        recordIn: recordIn!,
        recordOut: recordOut!,
      };
    }

    // Fewer than 2 explicit marks: use fallback positions
    if (setCount < 2) {
      // Use playhead positions as fallbacks
      if (recordIn === null) {
        recordIn = state.playheadTime;
      }
      if (sourceIn === null && sourceOut === null) {
        // Use full source duration
        sourceIn = 0;
        sourceOut = this._sourceMonitor.duration;
      }
    }

    // Now resolve the missing mark
    if (sourceIn !== null && sourceOut !== null && recordIn !== null && recordOut === null) {
      // Missing record OUT: derive from source duration
      recordOut = recordIn + (sourceOut - sourceIn);
    } else if (sourceIn !== null && sourceOut !== null && recordIn === null && recordOut !== null) {
      // Missing record IN: derive from source duration
      recordIn = recordOut - (sourceOut - sourceIn);
    } else if (sourceIn !== null && sourceOut === null && recordIn !== null && recordOut !== null) {
      // Missing source OUT: derive from record duration
      sourceOut = sourceIn + (recordOut - recordIn);
    } else if (sourceIn === null && sourceOut !== null && recordIn !== null && recordOut !== null) {
      // Missing source IN: derive from record duration
      sourceIn = sourceOut - (recordOut - recordIn);
    } else if (sourceIn === null && sourceOut !== null && recordIn !== null && recordOut === null) {
      // Source OUT and Record IN set: use source OUT as duration hint
      sourceIn = 0;
      recordOut = recordIn + sourceOut;
    } else if (sourceIn !== null && sourceOut === null && recordIn === null && recordOut !== null) {
      // Source IN and Record OUT set
      sourceOut = this._sourceMonitor.duration;
      recordIn = recordOut - (sourceOut - sourceIn);
    }

    // Validate
    if (
      sourceIn === null ||
      sourceOut === null ||
      recordIn === null ||
      recordOut === null
    ) {
      return null;
    }

    // Clamp source to valid range
    sourceIn = clamp(sourceIn, 0, this._sourceMonitor.duration);
    sourceOut = clamp(sourceOut, sourceIn, this._sourceMonitor.duration);
    recordIn = Math.max(0, recordIn);
    recordOut = Math.max(recordIn, recordOut);

    return { sourceIn, sourceOut, recordIn, recordOut };
  }

  // ── Track Patching ──────────────────────────────────────────────────────

  /**
   * Resolve which record tracks should receive edited material.
   *
   * Basic patching: source video maps to the lowest-sortOrder enabled,
   * unlocked video track. Source audio maps to enabled, unlocked audio tracks.
   *
   * Returns separate lists for video and audio target tracks.
   */
  private resolvePatching(): { videoTracks: Track[]; audioTracks: Track[] } {
    const state = useEditorStore.getState();

    const videoTracks = state.tracks.filter(
      (t) => t.type === 'VIDEO' && !t.locked && !t.muted,
    );
    const audioTracks = state.tracks.filter(
      (t) => t.type === 'AUDIO' && !t.locked && !t.muted,
    );

    // Sort by sortOrder so lowest is first (primary target)
    videoTracks.sort((a, b) => a.sortOrder - b.sortOrder);
    audioTracks.sort((a, b) => a.sortOrder - b.sortOrder);

    return { videoTracks, audioTracks };
  }

  /**
   * Get the enabled record tracks (for extract/lift which only need record
   * tracks, not source material).
   */
  private getEnabledRecordTracks(): Track[] {
    const state = useEditorStore.getState();
    return state.tracks.filter((t) => !t.locked && !t.muted);
  }

  // ── Clip Factory ────────────────────────────────────────────────────────

  /**
   * Create a new clip from source material for insertion into a track.
   */
  private createClipFromSource(
    trackId: string,
    recordStart: number,
    recordEnd: number,
    sourceIn: number,
    type: 'video' | 'audio',
    trackColor: string,
    speedFactor?: number,
  ): Clip {
    const id = createId('clip');
    const clip = makeClip({
      id,
      trackId,
      name: this._sourceMonitor.assetId
        ? `Source [${this._sourceMonitor.assetId}]`
        : 'New Clip',
      startTime: recordStart,
      endTime: recordEnd,
      trimStart: sourceIn,
      trimEnd: 0,
      type,
      assetId: this._sourceMonitor.assetId ?? undefined,
      color: trackColor,
    });

    // If speed factor is set (Fit-to-Fill), enable time remapping
    if (speedFactor !== undefined && speedFactor !== 1) {
      clip.timeRemap = {
        enabled: true,
        keyframes: [
          {
            timelineTime: recordStart,
            sourceTime: sourceIn,
            interpolation: 'linear',
          },
          {
            timelineTime: recordEnd,
            sourceTime: sourceIn + (recordEnd - recordStart) * speedFactor,
            interpolation: 'linear',
          },
        ],
        frameBlending: 'optical-flow',
        pitchCorrection: true,
      };
    }

    return clip;
  }

  // ── Timeline Mutation Helpers ───────────────────────────────────────────

  /**
   * Shift all clips on a track that start at or after `afterTime` by `delta`
   * seconds. Used for ripple operations.
   */
  private rippleTrack(track: Track, afterTime: number, delta: number): void {
    for (const clip of track.clips) {
      if (clip.startTime >= afterTime) {
        clip.startTime += delta;
        clip.endTime += delta;
      }
    }
  }

  /**
   * Remove the portion of clips on a track that overlap with a time range.
   * Clips entirely within the range are removed. Clips partially overlapping
   * are trimmed. Returns the IDs of affected/removed clips.
   */
  private clearRegion(
    track: Track,
    regionStart: number,
    regionEnd: number,
  ): { removedIds: string[]; splitIds: string[] } {
    const removedIds: string[] = [];
    const splitIds: string[] = [];
    const newClips: Clip[] = [];

    for (const clip of track.clips) {
      if (clip.endTime <= regionStart || clip.startTime >= regionEnd) {
        // Clip is entirely outside the region - keep it
        newClips.push(clip);
      } else if (clip.startTime >= regionStart && clip.endTime <= regionEnd) {
        // Clip is entirely within the region - remove it
        removedIds.push(clip.id);
      } else if (clip.startTime < regionStart && clip.endTime > regionEnd) {
        // Clip spans the entire region - split it
        const rightId = createId('clip');
        const rightClip = makeClip({
          ...clip,
          id: rightId,
          trackId: track.id,
          startTime: regionEnd,
          trimStart: clip.trimStart + (regionEnd - clip.startTime),
        });
        // Trim the left portion
        const trimmedClip = { ...clip, endTime: regionStart };
        newClips.push(trimmedClip);
        newClips.push(rightClip);
        splitIds.push(rightId);
      } else if (clip.startTime < regionStart && clip.endTime <= regionEnd) {
        // Clip starts before region, ends within - trim its end
        newClips.push({ ...clip, endTime: regionStart });
      } else if (clip.startTime >= regionStart && clip.endTime > regionEnd) {
        // Clip starts within region, ends after - trim its start
        const trimDelta = regionEnd - clip.startTime;
        newClips.push({
          ...clip,
          startTime: regionEnd,
          trimStart: clip.trimStart + trimDelta,
        });
      }
    }

    track.clips = newClips;
    return { removedIds, splitIds };
  }

  /**
   * Recalculate the timeline duration based on the latest clip end time
   * across all tracks.
   */
  private recalcDuration(): void {
    const state = useEditorStore.getState();
    let maxEnd = 0;
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clip.endTime > maxEnd) maxEnd = clip.endTime;
      }
    }
    // Add a small buffer so the timeline doesn't end exactly at the last clip
    useEditorStore.setState({ duration: Math.max(maxEnd + 2, 10) });
  }

  // ── Primary Edit: Splice-In (Insert) ───────────────────────────────────

  /**
   * Splice-In (Insert) edit - V key, Yellow indicator.
   *
   * Inserts source material into timeline at the Record IN mark or position
   * indicator. Pushes existing content right (ripple). Timeline grows by
   * the duration of the inserted material. Only affects enabled/patched tracks.
   */
  spliceIn(): EditResult {
    const resolved = this.resolveThreePointEdit();
    if (!resolved) {
      return failResult('Splice-In: insufficient marks to resolve edit');
    }
    if (!this._sourceMonitor.assetId) {
      return failResult('Splice-In: no source loaded');
    }

    const { sourceIn, sourceOut, recordIn } = resolved;
    const insertDuration = sourceOut - sourceIn;
    if (insertDuration <= 0) {
      return failResult('Splice-In: source duration is zero or negative');
    }

    const { videoTracks, audioTracks } = this.resolvePatching();
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      return failResult('Splice-In: no enabled/unlocked tracks available');
    }

    const state = useEditorStore.getState();
    const affectedTrackIds: string[] = [];
    const newClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        const isVideoTarget = videoTracks.some((vt) => vt.id === track.id);
        const isAudioTarget = audioTracks.some((at) => at.id === track.id);

        if (!isVideoTarget && !isAudioTarget) continue;

        affectedTrackIds.push(track.id);

        // Ripple: push all clips at or after recordIn to the right
        this.rippleTrack(track, recordIn, insertDuration);

        // Insert the new clip
        const clipType = isVideoTarget ? 'video' as const : 'audio' as const;
        const newClip = this.createClipFromSource(
          track.id,
          recordIn,
          recordIn + insertDuration,
          sourceIn,
          clipType,
          track.color,
        );
        newClipIds.push(newClip.id);
        track.clips.push(newClip);

        // Sort clips by start time
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks };
    });

    this.recalcDuration();

    // Move playhead to end of inserted material
    useEditorStore.getState().setPlayhead(recordIn + insertDuration);

    return successResult(
      `Splice-In: inserted ${insertDuration.toFixed(2)}s at ${recordIn.toFixed(2)}s`,
      {
        affectedTrackIds,
        newClipIds,
        durationChange: insertDuration,
      },
    );
  }

  // ── Primary Edit: Overwrite ─────────────────────────────────────────────

  /**
   * Overwrite edit - B key, Red indicator.
   *
   * Lays source material over existing content at the Record IN mark or
   * position indicator. Replaces what was there. No ripple - timeline
   * duration unchanged. Only affects enabled/patched tracks.
   */
  overwrite(): EditResult {
    const resolved = this.resolveThreePointEdit();
    if (!resolved) {
      return failResult('Overwrite: insufficient marks to resolve edit');
    }
    if (!this._sourceMonitor.assetId) {
      return failResult('Overwrite: no source loaded');
    }

    const { sourceIn, sourceOut, recordIn, recordOut } = resolved;
    const editDuration = sourceOut - sourceIn;
    if (editDuration <= 0) {
      return failResult('Overwrite: source duration is zero or negative');
    }

    const { videoTracks, audioTracks } = this.resolvePatching();
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      return failResult('Overwrite: no enabled/unlocked tracks available');
    }

    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];
    const newClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        const isVideoTarget = videoTracks.some((vt) => vt.id === track.id);
        const isAudioTarget = audioTracks.some((at) => at.id === track.id);

        if (!isVideoTarget && !isAudioTarget) continue;

        affectedTrackIds.push(track.id);

        // Clear the region where new material will go
        const { removedIds, splitIds } = this.clearRegion(
          track,
          recordIn,
          recordIn + editDuration,
        );
        affectedClipIds.push(...removedIds);

        // Place the new clip
        const clipType = isVideoTarget ? 'video' as const : 'audio' as const;
        const newClip = this.createClipFromSource(
          track.id,
          recordIn,
          recordIn + editDuration,
          sourceIn,
          clipType,
          track.color,
        );
        newClipIds.push(newClip.id);
        track.clips.push(newClip);

        // Sort clips by start time
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks };
    });

    // Move playhead to end of overwritten material
    useEditorStore.getState().setPlayhead(recordIn + editDuration);

    return successResult(
      `Overwrite: replaced ${editDuration.toFixed(2)}s at ${recordIn.toFixed(2)}s`,
      {
        affectedTrackIds,
        affectedClipIds,
        newClipIds,
        durationChange: 0, // overwrite does not change timeline duration
      },
    );
  }

  // ── Primary Edit: Extract ───────────────────────────────────────────────

  /**
   * Extract edit - X key, Yellow indicator.
   *
   * Removes the marked region (between Record IN and OUT) from the timeline
   * and closes the gap (ripple). Timeline shrinks. Only affects enabled
   * record tracks.
   */
  extract(): EditResult {
    const state = useEditorStore.getState();
    const recordIn = state.inPoint;
    const recordOut = state.outPoint;

    if (recordIn === null || recordOut === null) {
      return failResult('Extract: both Record IN and OUT marks required');
    }
    if (recordOut <= recordIn) {
      return failResult('Extract: Record OUT must be after Record IN');
    }

    const extractDuration = recordOut - recordIn;
    const enabledTracks = this.getEnabledRecordTracks();
    if (enabledTracks.length === 0) {
      return failResult('Extract: no enabled/unlocked tracks');
    }

    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        if (track.locked || track.muted) continue;

        affectedTrackIds.push(track.id);

        // Remove clips in the region
        const { removedIds } = this.clearRegion(track, recordIn, recordOut);
        affectedClipIds.push(...removedIds);

        // Ripple: shift everything after recordOut left by extractDuration
        for (const clip of track.clips) {
          if (clip.startTime >= recordOut) {
            clip.startTime -= extractDuration;
            clip.endTime -= extractDuration;
          } else if (clip.startTime >= recordIn) {
            // Clips that start within the region but survived clearRegion
            // (they were trimmed) - adjust their position
            clip.startTime = recordIn;
          }
        }

        // Sort clips by start time
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks };
    });

    this.recalcDuration();

    // Move playhead to the extract point
    useEditorStore.getState().setPlayhead(recordIn);

    // Clear marks after extract
    useEditorStore.setState({ inPoint: null, outPoint: null });

    return successResult(
      `Extract: removed ${extractDuration.toFixed(2)}s at ${recordIn.toFixed(2)}s (gap closed)`,
      {
        affectedTrackIds,
        affectedClipIds,
        durationChange: -extractDuration,
      },
    );
  }

  // ── Primary Edit: Lift ──────────────────────────────────────────────────

  /**
   * Lift edit - Z key, Red indicator.
   *
   * Removes the marked region from the timeline but leaves filler (empty
   * space) in its place. No ripple - timeline duration unchanged. Only
   * affects enabled record tracks.
   */
  lift(): EditResult {
    const state = useEditorStore.getState();
    const recordIn = state.inPoint;
    const recordOut = state.outPoint;

    if (recordIn === null || recordOut === null) {
      return failResult('Lift: both Record IN and OUT marks required');
    }
    if (recordOut <= recordIn) {
      return failResult('Lift: Record OUT must be after Record IN');
    }

    const liftDuration = recordOut - recordIn;
    const enabledTracks = this.getEnabledRecordTracks();
    if (enabledTracks.length === 0) {
      return failResult('Lift: no enabled/unlocked tracks');
    }

    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        if (track.locked || track.muted) continue;

        affectedTrackIds.push(track.id);

        // Clear the region - filler (empty space) is left automatically
        const { removedIds } = this.clearRegion(track, recordIn, recordOut);
        affectedClipIds.push(...removedIds);

        // Sort clips by start time
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks };
    });

    // Move playhead to the lift point
    useEditorStore.getState().setPlayhead(recordIn);

    // Clear marks after lift
    useEditorStore.setState({ inPoint: null, outPoint: null });

    return successResult(
      `Lift: removed ${liftDuration.toFixed(2)}s at ${recordIn.toFixed(2)}s (filler left)`,
      {
        affectedTrackIds,
        affectedClipIds,
        durationChange: 0, // lift does not change timeline duration
      },
    );
  }

  // ── Additional Edit: Replace ────────────────────────────────────────────

  /**
   * Replace edit - sync-based replacement.
   *
   * Syncs the source monitor playhead with the record position indicator
   * and replaces the clip under the position indicator without requiring
   * IN/OUT marks. Ideal for sync-based replacement.
   */
  replace(): EditResult {
    const state = useEditorStore.getState();
    const recordPlayhead = state.playheadTime;
    const sourcePlayhead = this._sourceMonitor.playheadTime;

    if (!this._sourceMonitor.assetId) {
      return failResult('Replace: no source loaded');
    }

    // Find the clip under the record playhead on the first enabled track
    const enabledTracks = this.getEnabledRecordTracks();
    let targetTrack: Track | null = null;
    let targetClip: Clip | null = null;

    for (const track of enabledTracks) {
      const clip = track.clips.find(
        (c) => c.startTime <= recordPlayhead && c.endTime > recordPlayhead,
      );
      if (clip) {
        targetTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      return failResult('Replace: no clip under position indicator');
    }

    const clipDuration = targetClip.endTime - targetClip.startTime;
    // Calculate where in source corresponds to the sync point
    const offsetInClip = recordPlayhead - targetClip.startTime;
    const newSourceIn = Math.max(0, sourcePlayhead - offsetInClip);
    const newSourceOut = Math.min(
      this._sourceMonitor.duration,
      newSourceIn + clipDuration,
    );

    const newClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];
      const track = tracks.find((t) => t.id === targetTrack!.id);
      if (!track) return {};

      const clipIdx = track.clips.findIndex((c) => c.id === targetClip!.id);
      if (clipIdx < 0) return {};

      const clipType = track.type === 'VIDEO' ? 'video' as const : 'audio' as const;
      const newClip = this.createClipFromSource(
        track.id,
        targetClip!.startTime,
        targetClip!.endTime,
        newSourceIn,
        clipType,
        track.color,
      );
      newClipIds.push(newClip.id);

      // Replace the old clip with the new one
      track.clips[clipIdx] = newClip;

      return { tracks };
    });

    return successResult(
      `Replace: swapped clip at ${recordPlayhead.toFixed(2)}s with source`,
      {
        affectedTrackIds: [targetTrack.id],
        affectedClipIds: [targetClip.id],
        newClipIds,
        durationChange: 0,
      },
    );
  }

  // ── Additional Edit: Fit-to-Fill ────────────────────────────────────────

  /**
   * Fit-to-Fill edit.
   *
   * Requires all 4 marks set with differing source and record durations.
   * Automatically speed-changes source material to fill the record duration,
   * creating a time-remapped clip.
   */
  fitToFill(): EditResult {
    const resolved = this.resolveThreePointEdit();
    if (!resolved) {
      return failResult('Fit-to-Fill: insufficient marks');
    }
    if (!this._sourceMonitor.assetId) {
      return failResult('Fit-to-Fill: no source loaded');
    }

    const { sourceIn, sourceOut, recordIn, recordOut } = resolved;
    const sourceDuration = sourceOut - sourceIn;
    const recordDuration = recordOut - recordIn;

    if (sourceDuration <= 0 || recordDuration <= 0) {
      return failResult('Fit-to-Fill: durations must be positive');
    }

    const speedFactor = sourceDuration / recordDuration;
    const { videoTracks, audioTracks } = this.resolvePatching();
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      return failResult('Fit-to-Fill: no enabled/unlocked tracks');
    }

    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];
    const newClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        const isVideoTarget = videoTracks.some((vt) => vt.id === track.id);
        const isAudioTarget = audioTracks.some((at) => at.id === track.id);

        if (!isVideoTarget && !isAudioTarget) continue;

        affectedTrackIds.push(track.id);

        // Clear the record region
        const { removedIds } = this.clearRegion(track, recordIn, recordOut);
        affectedClipIds.push(...removedIds);

        // Create speed-changed clip
        const clipType = isVideoTarget ? 'video' as const : 'audio' as const;
        const newClip = this.createClipFromSource(
          track.id,
          recordIn,
          recordOut,
          sourceIn,
          clipType,
          track.color,
          speedFactor,
        );
        newClipIds.push(newClip.id);
        track.clips.push(newClip);
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks };
    });

    useEditorStore.getState().setPlayhead(recordOut);

    return successResult(
      `Fit-to-Fill: ${sourceDuration.toFixed(2)}s source fit to ${recordDuration.toFixed(2)}s record (${(speedFactor * 100).toFixed(0)}% speed)`,
      {
        affectedTrackIds,
        affectedClipIds,
        newClipIds,
        durationChange: 0,
      },
    );
  }

  // ── Additional Edit: Trim-to-Fill ───────────────────────────────────────

  /**
   * Trim-to-Fill edit.
   *
   * Alternative to Fit-to-Fill. Trims source material to fit the record
   * duration without speed change. If source is longer than record, the
   * excess is trimmed. If source is shorter, only the available source
   * duration is used.
   */
  trimToFill(): EditResult {
    const resolved = this.resolveThreePointEdit();
    if (!resolved) {
      return failResult('Trim-to-Fill: insufficient marks');
    }
    if (!this._sourceMonitor.assetId) {
      return failResult('Trim-to-Fill: no source loaded');
    }

    const { sourceIn, sourceOut, recordIn, recordOut } = resolved;
    const sourceDuration = sourceOut - sourceIn;
    const recordDuration = recordOut - recordIn;

    if (sourceDuration <= 0 || recordDuration <= 0) {
      return failResult('Trim-to-Fill: durations must be positive');
    }

    // Use the shorter of source and record durations
    const actualDuration = Math.min(sourceDuration, recordDuration);
    const actualSourceOut = sourceIn + actualDuration;

    const { videoTracks, audioTracks } = this.resolvePatching();
    if (videoTracks.length === 0 && audioTracks.length === 0) {
      return failResult('Trim-to-Fill: no enabled/unlocked tracks');
    }

    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];
    const newClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        const isVideoTarget = videoTracks.some((vt) => vt.id === track.id);
        const isAudioTarget = audioTracks.some((at) => at.id === track.id);

        if (!isVideoTarget && !isAudioTarget) continue;

        affectedTrackIds.push(track.id);

        // Clear only the portion we are filling
        const { removedIds } = this.clearRegion(
          track,
          recordIn,
          recordIn + actualDuration,
        );
        affectedClipIds.push(...removedIds);

        const clipType = isVideoTarget ? 'video' as const : 'audio' as const;
        const newClip = this.createClipFromSource(
          track.id,
          recordIn,
          recordIn + actualDuration,
          sourceIn,
          clipType,
          track.color,
        );
        newClipIds.push(newClip.id);
        track.clips.push(newClip);
        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks };
    });

    useEditorStore.getState().setPlayhead(recordIn + actualDuration);

    const trimmed = sourceDuration > recordDuration
      ? ` (source trimmed by ${(sourceDuration - recordDuration).toFixed(2)}s)`
      : sourceDuration < recordDuration
        ? ` (gap of ${(recordDuration - sourceDuration).toFixed(2)}s remains)`
        : '';

    return successResult(
      `Trim-to-Fill: ${actualDuration.toFixed(2)}s placed at ${recordIn.toFixed(2)}s${trimmed}`,
      {
        affectedTrackIds,
        affectedClipIds,
        newClipIds,
        durationChange: 0,
      },
    );
  }

  // ── Segment Operations ──────────────────────────────────────────────────

  /**
   * Lift selected segments - filler replaces them (no ripple).
   */
  liftSegment(clipIds: string[]): EditResult {
    if (clipIds.length === 0) {
      return failResult('Lift Segment: no clips specified');
    }

    const state = useEditorStore.getState();
    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        const clipsToRemove = track.clips.filter((c) =>
          clipIds.includes(c.id),
        );
        if (clipsToRemove.length > 0) {
          affectedTrackIds.push(track.id);
          affectedClipIds.push(...clipsToRemove.map((c) => c.id));
          track.clips = track.clips.filter((c) => !clipIds.includes(c.id));
        }
      }

      return { tracks, selectedClipIds: [] };
    });

    return successResult(
      `Lift Segment: removed ${affectedClipIds.length} clip(s)`,
      {
        affectedTrackIds,
        affectedClipIds,
        durationChange: 0,
      },
    );
  }

  /**
   * Extract selected segments - gap closes (ripple).
   */
  extractSegment(clipIds: string[]): EditResult {
    if (clipIds.length === 0) {
      return failResult('Extract Segment: no clips specified');
    }

    const affectedTrackIds: string[] = [];
    const affectedClipIds: string[] = [];
    let totalDurationChange = 0;

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        const clipsToRemove = track.clips
          .filter((c) => clipIds.includes(c.id))
          .sort((a, b) => a.startTime - b.startTime);

        if (clipsToRemove.length === 0) continue;

        affectedTrackIds.push(track.id);
        affectedClipIds.push(...clipsToRemove.map((c) => c.id));

        // Process removals from last to first to maintain correct offsets
        for (let i = clipsToRemove.length - 1; i >= 0; i--) {
          const clip = clipsToRemove[i];
          const duration = clip.endTime - clip.startTime;
          totalDurationChange -= duration;

          // Remove the clip
          track.clips = track.clips.filter((c) => c.id !== clip.id);

          // Ripple: shift subsequent clips left
          for (const c of track.clips) {
            if (c.startTime >= clip.endTime) {
              c.startTime -= duration;
              c.endTime -= duration;
            }
          }
        }

        track.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks, selectedClipIds: [] };
    });

    this.recalcDuration();

    return successResult(
      `Extract Segment: removed ${affectedClipIds.length} clip(s), gap closed`,
      {
        affectedTrackIds,
        affectedClipIds,
        durationChange: totalDurationChange,
      },
    );
  }

  /**
   * Overwrite segment drag - move clips to a new track/position, replacing
   * whatever is there (no ripple at destination).
   */
  overwriteSegmentTo(
    clipIds: string[],
    targetTrackId: string,
    targetTime: number,
  ): EditResult {
    if (clipIds.length === 0) {
      return failResult('Overwrite Segment To: no clips specified');
    }

    const state = useEditorStore.getState();
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) {
      return failResult('Overwrite Segment To: target track not found');
    }
    if (targetTrack.locked) {
      return failResult('Overwrite Segment To: target track is locked');
    }

    // Collect the clips to move
    const clipsToMove: Clip[] = [];
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clipIds.includes(clip.id)) {
          clipsToMove.push({ ...clip });
        }
      }
    }
    if (clipsToMove.length === 0) {
      return failResult('Overwrite Segment To: specified clips not found');
    }

    // Calculate the offset
    const earliestStart = Math.min(...clipsToMove.map((c) => c.startTime));
    const offset = targetTime - earliestStart;

    const newClipIds: string[] = [];
    const affectedClipIds = clipIds.slice();

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      // Remove clips from their original tracks
      for (const track of tracks) {
        track.clips = track.clips.filter((c) => !clipIds.includes(c.id));
      }

      // Find the target track in the mutable state
      const destTrack = tracks.find((t) => t.id === targetTrackId);
      if (!destTrack) return {};

      // Place clips at the new position, clearing the region first
      for (const clip of clipsToMove) {
        const newStart = clip.startTime + offset;
        const newEnd = clip.endTime + offset;

        // Clear the destination region
        this.clearRegion(destTrack, newStart, newEnd);

        // Create moved clip with new ID
        const newId = createId('clip');
        const movedClip = makeClip({
          ...clip,
          id: newId,
          trackId: targetTrackId,
          startTime: newStart,
          endTime: newEnd,
        });
        newClipIds.push(newId);
        destTrack.clips.push(movedClip);
      }

      destTrack.clips.sort((a, b) => a.startTime - b.startTime);

      return { tracks, selectedClipIds: newClipIds };
    });

    return successResult(
      `Overwrite Segment To: moved ${clipsToMove.length} clip(s) to ${targetTrackId}`,
      {
        affectedTrackIds: [targetTrackId],
        affectedClipIds,
        newClipIds,
        durationChange: 0,
      },
    );
  }

  /**
   * Splice-in segment drag - move clips to a new track/position, pushing
   * existing content right (ripple at destination).
   */
  spliceSegmentTo(
    clipIds: string[],
    targetTrackId: string,
    targetTime: number,
  ): EditResult {
    if (clipIds.length === 0) {
      return failResult('Splice Segment To: no clips specified');
    }

    const state = useEditorStore.getState();
    const targetTrack = state.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) {
      return failResult('Splice Segment To: target track not found');
    }
    if (targetTrack.locked) {
      return failResult('Splice Segment To: target track is locked');
    }

    // Collect the clips to move
    const clipsToMove: Clip[] = [];
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clipIds.includes(clip.id)) {
          clipsToMove.push({ ...clip });
        }
      }
    }
    if (clipsToMove.length === 0) {
      return failResult('Splice Segment To: specified clips not found');
    }

    // Calculate the offset and total duration
    const earliestStart = Math.min(...clipsToMove.map((c) => c.startTime));
    const latestEnd = Math.max(...clipsToMove.map((c) => c.endTime));
    const offset = targetTime - earliestStart;
    const totalSpan = latestEnd - earliestStart;

    const newClipIds: string[] = [];
    const affectedClipIds = clipIds.slice();

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      // Remove clips from their original tracks
      for (const track of tracks) {
        track.clips = track.clips.filter((c) => !clipIds.includes(c.id));
      }

      const destTrack = tracks.find((t) => t.id === targetTrackId);
      if (!destTrack) return {};

      // Ripple: push existing clips right to make room
      this.rippleTrack(destTrack, targetTime, totalSpan);

      // Place clips at the new position
      for (const clip of clipsToMove) {
        const newStart = clip.startTime + offset;
        const newEnd = clip.endTime + offset;
        const newId = createId('clip');

        const movedClip = makeClip({
          ...clip,
          id: newId,
          trackId: targetTrackId,
          startTime: newStart,
          endTime: newEnd,
        });
        newClipIds.push(newId);
        destTrack.clips.push(movedClip);
      }

      destTrack.clips.sort((a, b) => a.startTime - b.startTime);

      return { tracks, selectedClipIds: newClipIds };
    });

    this.recalcDuration();

    return successResult(
      `Splice Segment To: inserted ${clipsToMove.length} clip(s) at ${targetTime.toFixed(2)}s`,
      {
        affectedTrackIds: [targetTrackId],
        affectedClipIds,
        newClipIds,
        durationChange: totalSpan,
      },
    );
  }

  // ── Clipboard ───────────────────────────────────────────────────────────

  /**
   * Copy the marked region (or selected clips) to the clipboard.
   */
  copy(): void {
    const state = useEditorStore.getState();

    // If clips are selected, copy those
    if (state.selectedClipIds.length > 0) {
      const clips: Clip[] = [];
      for (const track of state.tracks) {
        for (const clip of track.clips) {
          if (state.selectedClipIds.includes(clip.id)) {
            clips.push({ ...clip });
          }
        }
      }
      if (clips.length > 0) {
        this._clipboard = clips;
        return;
      }
    }

    // Otherwise, copy the marked region
    const recordIn = state.inPoint;
    const recordOut = state.outPoint;
    if (recordIn === null || recordOut === null || recordOut <= recordIn) {
      return;
    }

    const clips: Clip[] = [];
    for (const track of state.tracks) {
      if (track.locked || track.muted) continue;
      for (const clip of track.clips) {
        // Include clips that overlap the marked region
        if (clip.startTime < recordOut && clip.endTime > recordIn) {
          // Trim clip to the marked region
          const trimmedClip: Clip = {
            ...clip,
            startTime: Math.max(clip.startTime, recordIn),
            endTime: Math.min(clip.endTime, recordOut),
            trimStart:
              clip.trimStart +
              Math.max(0, recordIn - clip.startTime),
          };
          clips.push(trimmedClip);
        }
      }
    }

    if (clips.length > 0) {
      this._clipboard = clips;
    }
  }

  /**
   * Paste clipboard contents as a splice-in at the current position
   * indicator or Record IN mark.
   */
  paste(): EditResult {
    if (!this._clipboard || this._clipboard.length === 0) {
      return failResult('Paste: clipboard is empty');
    }

    const state = useEditorStore.getState();
    const insertTime = state.inPoint ?? state.playheadTime;

    // Calculate the span of clipboard contents
    const earliestStart = Math.min(
      ...this._clipboard.map((c) => c.startTime),
    );
    const latestEnd = Math.max(...this._clipboard.map((c) => c.endTime));
    const clipboardSpan = latestEnd - earliestStart;

    if (clipboardSpan <= 0) {
      return failResult('Paste: clipboard span is zero');
    }

    const affectedTrackIds: string[] = [];
    const newClipIds: string[] = [];
    const offset = insertTime - earliestStart;

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      // Group clipboard clips by their original track type
      const clipsByTrack = new Map<string, Clip[]>();
      for (const clip of this._clipboard!) {
        const existing = clipsByTrack.get(clip.trackId) ?? [];
        existing.push(clip);
        clipsByTrack.set(clip.trackId, existing);
      }

      // For each original track, find the corresponding track in current
      // state and splice in
      for (const [origTrackId, clips] of Array.from(clipsByTrack.entries())) {
        // Try to find the original track, or fall back to a compatible one
        let targetTrack = tracks.find((t) => t.id === origTrackId);
        if (!targetTrack || targetTrack.locked) {
          // Find a compatible track
          const clipType = clips[0].type;
          const trackType = clipType === 'audio' ? 'AUDIO' : 'VIDEO';
          targetTrack = tracks.find(
            (t) => t.type === trackType && !t.locked && !t.muted,
          );
        }
        if (!targetTrack) continue;

        affectedTrackIds.push(targetTrack.id);

        // Ripple to make room
        this.rippleTrack(targetTrack, insertTime, clipboardSpan);

        // Insert clips
        for (const clip of clips) {
          const newId = createId('clip');
          const newClip = makeClip({
            ...clip,
            id: newId,
            trackId: targetTrack!.id,
            startTime: clip.startTime + offset,
            endTime: clip.endTime + offset,
          });
          newClipIds.push(newId);
          targetTrack!.clips.push(newClip);
        }

        targetTrack.clips.sort((a, b) => a.startTime - b.startTime);
      }

      return { tracks, selectedClipIds: newClipIds };
    });

    this.recalcDuration();
    useEditorStore.getState().setPlayhead(insertTime + clipboardSpan);

    return successResult(
      `Paste: spliced ${newClipIds.length} clip(s) at ${insertTime.toFixed(2)}s`,
      {
        affectedTrackIds,
        newClipIds,
        durationChange: clipboardSpan,
      },
    );
  }

  /**
   * Copy the marked region or selected clips to the source monitor for
   * further editing or re-insertion.
   */
  copyToSourceMonitor(): void {
    const state = useEditorStore.getState();

    // Find the first clip under the playhead on an enabled track
    for (const track of state.tracks) {
      if (track.locked || track.muted) continue;
      const clip = track.clips.find(
        (c) =>
          c.startTime <= state.playheadTime &&
          c.endTime > state.playheadTime,
      );
      if (clip?.assetId) {
        // Load this asset into source monitor
        const asset = this.findAssetInBins(clip.assetId);
        if (asset) {
          this.loadSource(
            clip.assetId,
            asset.duration ?? clip.endTime - clip.startTime,
          );
          this._sourceMonitor.inPoint = clip.trimStart;
          this._sourceMonitor.outPoint =
            clip.trimStart + (clip.endTime - clip.startTime);
          this._sourceMonitor.playheadTime = clip.trimStart + (state.playheadTime - clip.startTime);
        }
        return;
      }
    }
  }

  /** Get the current clipboard contents. */
  getClipboardContents(): Clip[] | null {
    return this._clipboard ? [...this._clipboard] : null;
  }

  // ── Add Edit ────────────────────────────────────────────────────────────

  /**
   * Split the clip at the position indicator without changing content.
   * Creates an edit point (cut) in all unlocked tracks at the current
   * playhead position.
   */
  addEdit(): void {
    const state = useEditorStore.getState();
    const splitTime = state.playheadTime;

    useEditorStore.setState((prev) => {
      const tracks = [...prev.tracks];

      for (const track of tracks) {
        if (track.locked) continue;

        for (let i = 0; i < track.clips.length; i++) {
          const clip = track.clips[i];
          if (clip.startTime < splitTime && clip.endTime > splitTime) {
            // Split the clip at the playhead
            const newId = createId('clip');
            const trimDelta = splitTime - clip.startTime;

            const rightClip = makeClip({
              ...clip,
              id: newId,
              trackId: track.id,
              startTime: splitTime,
              trimStart: clip.trimStart + trimDelta,
            });

            clip.endTime = splitTime;
            track.clips.splice(i + 1, 0, rightClip);
            i++; // skip the newly inserted clip
          }
        }
      }

      return { tracks };
    });
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  /**
   * Jump to the next edit boundary (clip edge) after the current playhead.
   */
  goToNextEditPoint(): void {
    const state = useEditorStore.getState();
    const playhead = state.playheadTime;
    let nextTime = Infinity;

    for (const track of state.tracks) {
      if (track.locked || track.muted) continue;
      for (const clip of track.clips) {
        if (clip.startTime > playhead + 0.001 && clip.startTime < nextTime) {
          nextTime = clip.startTime;
        }
        if (clip.endTime > playhead + 0.001 && clip.endTime < nextTime) {
          nextTime = clip.endTime;
        }
      }
    }

    if (nextTime !== Infinity) {
      useEditorStore.getState().setPlayhead(nextTime);
    }
  }

  /**
   * Jump to the previous edit boundary (clip edge) before the current playhead.
   */
  goToPrevEditPoint(): void {
    const state = useEditorStore.getState();
    const playhead = state.playheadTime;
    let prevTime = -Infinity;

    for (const track of state.tracks) {
      if (track.locked || track.muted) continue;
      for (const clip of track.clips) {
        if (clip.startTime < playhead - 0.001 && clip.startTime > prevTime) {
          prevTime = clip.startTime;
        }
        if (clip.endTime < playhead - 0.001 && clip.endTime > prevTime) {
          prevTime = clip.endTime;
        }
      }
    }

    if (prevTime !== -Infinity) {
      useEditorStore.getState().setPlayhead(prevTime);
    }
  }

  /** Jump the playhead to the start of the timeline. */
  goToStart(): void {
    useEditorStore.getState().setPlayhead(0);
  }

  /** Jump the playhead to the end of the timeline (last clip end). */
  goToEnd(): void {
    const state = useEditorStore.getState();
    let maxEnd = 0;
    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clip.endTime > maxEnd) maxEnd = clip.endTime;
      }
    }
    useEditorStore.getState().setPlayhead(maxEnd);
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  /**
   * Check whether a given edit type can be performed with the current
   * marks and state.
   */
  canPerformEdit(type: EditType): boolean {
    switch (type) {
      case 'splice-in':
      case 'overwrite': {
        if (!this._sourceMonitor.assetId) return false;
        const { videoTracks, audioTracks } = this.resolvePatching();
        if (videoTracks.length === 0 && audioTracks.length === 0) return false;
        const resolved = this.resolveThreePointEdit();
        return resolved !== null;
      }

      case 'extract':
      case 'lift': {
        const state = useEditorStore.getState();
        if (state.inPoint === null || state.outPoint === null) return false;
        if (state.outPoint <= state.inPoint) return false;
        return this.getEnabledRecordTracks().length > 0;
      }

      case 'replace': {
        if (!this._sourceMonitor.assetId) return false;
        const state = useEditorStore.getState();
        const enabledTracks = this.getEnabledRecordTracks();
        for (const track of enabledTracks) {
          const clip = track.clips.find(
            (c) =>
              c.startTime <= state.playheadTime &&
              c.endTime > state.playheadTime,
          );
          if (clip) return true;
        }
        return false;
      }

      case 'fit-to-fill':
      case 'trim-to-fill': {
        if (!this._sourceMonitor.assetId) return false;
        const resolved = this.resolveThreePointEdit();
        if (!resolved) return false;
        const { videoTracks, audioTracks } = this.resolvePatching();
        return videoTracks.length > 0 || audioTracks.length > 0;
      }

      default:
        return false;
    }
  }

  /**
   * Preview what an edit will do without executing it.
   */
  getEditPreview(type: EditType): { description: string; durationChange: number } {
    if (!this.canPerformEdit(type)) {
      return { description: `Cannot perform ${type}: insufficient marks or state`, durationChange: 0 };
    }

    const marks = this.getMarkState();
    const state = useEditorStore.getState();

    switch (type) {
      case 'splice-in': {
        const resolved = this.resolveThreePointEdit();
        if (!resolved) return { description: 'Cannot resolve edit', durationChange: 0 };
        const dur = resolved.sourceOut - resolved.sourceIn;
        return {
          description: `Splice-In: will insert ${dur.toFixed(2)}s at ${resolved.recordIn.toFixed(2)}s, pushing content right`,
          durationChange: dur,
        };
      }

      case 'overwrite': {
        const resolved = this.resolveThreePointEdit();
        if (!resolved) return { description: 'Cannot resolve edit', durationChange: 0 };
        const dur = resolved.sourceOut - resolved.sourceIn;
        return {
          description: `Overwrite: will replace ${dur.toFixed(2)}s at ${resolved.recordIn.toFixed(2)}s`,
          durationChange: 0,
        };
      }

      case 'extract': {
        const dur = state.outPoint! - state.inPoint!;
        return {
          description: `Extract: will remove ${dur.toFixed(2)}s and close gap`,
          durationChange: -dur,
        };
      }

      case 'lift': {
        const dur = state.outPoint! - state.inPoint!;
        return {
          description: `Lift: will remove ${dur.toFixed(2)}s leaving filler`,
          durationChange: 0,
        };
      }

      case 'replace': {
        return {
          description: 'Replace: will swap clip under playhead with source (sync-based)',
          durationChange: 0,
        };
      }

      case 'fit-to-fill': {
        const resolved = this.resolveThreePointEdit();
        if (!resolved) return { description: 'Cannot resolve edit', durationChange: 0 };
        const srcDur = resolved.sourceOut - resolved.sourceIn;
        const recDur = resolved.recordOut - resolved.recordIn;
        const speed = ((srcDur / recDur) * 100).toFixed(0);
        return {
          description: `Fit-to-Fill: will speed-change source (${speed}%) to fill ${recDur.toFixed(2)}s`,
          durationChange: 0,
        };
      }

      case 'trim-to-fill': {
        const resolved = this.resolveThreePointEdit();
        if (!resolved) return { description: 'Cannot resolve edit', durationChange: 0 };
        const srcDur = resolved.sourceOut - resolved.sourceIn;
        const recDur = resolved.recordOut - resolved.recordIn;
        const actual = Math.min(srcDur, recDur);
        return {
          description: `Trim-to-Fill: will place ${actual.toFixed(2)}s of source at record position`,
          durationChange: 0,
        };
      }

      default:
        return { description: `Unknown edit type: ${type}`, durationChange: 0 };
    }
  }

  // ── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Look up a media asset by ID across all bins.
   */
  private findAssetInBins(assetId: string): { duration?: number } | null {
    const state = useEditorStore.getState();
    const search = (bins: { assets: { id: string; duration?: number }[]; children: any[] }[]): { duration?: number } | null => {
      for (const bin of bins) {
        const asset = bin.assets.find((a: { id: string }) => a.id === assetId);
        if (asset) return asset;
        const found = search(bin.children);
        if (found) return found;
      }
      return null;
    };
    return search(state.bins);
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

export const editOpsEngine = new EditOperationsEngine();
