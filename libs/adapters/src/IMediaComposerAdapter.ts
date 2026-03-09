/**
 * @fileoverview Adapter interface for Avid Media Composer timeline operations.
 *
 * `IMediaComposerAdapter` is the primary abstraction that sits between the
 * agentic editing engine and the real Media Composer application (or a mock /
 * headless renderer during development).  Every method is async because the
 * real implementation communicates with MC over its REST/COM bridge.
 */

import type { DeliverySpec, MediaRef } from './contracts-types';

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/** Kind of media carried by a track. */
export type TrackKind = 'video' | 'audio' | 'data' | 'timecode';

/** Represents a single clip placed on a track. */
export interface ClipResult {
  /** Unique clip instance ID (not the source asset ID). */
  clipId: string;
  /** The track this clip lives on. */
  trackId: string;
  /** Source asset reference. */
  assetId: string;
  /** Position on the timeline in frames. */
  position: number;
  /** Duration in frames. */
  duration: number;
  /** Source-side in-point in frames. */
  sourceIn: number;
  /** Source-side out-point in frames. */
  sourceOut: number;
  /** Active effects applied to this clip. */
  effectIds: string[];
}

/** A single track inside a timeline. */
export interface TrackSnapshot {
  id: string;
  name: string;
  kind: TrackKind;
  index: number;
  clips: ClipResult[];
  isMuted: boolean;
  isSolo: boolean;
  isLocked: boolean;
}

/** Complete snapshot of a timeline / sequence at a point in time. */
export interface TimelineSnapshot {
  sequenceId: string;
  name: string;
  /** Total duration in frames. */
  duration: number;
  /** Timeline frame rate (e.g. 23.976, 25, 29.97, 59.94). */
  frameRate: number;
  tracks: TrackSnapshot[];
  /** Current playhead position in frames. */
  playhead: number;
  /** ISO-8601 timestamp of when this snapshot was taken. */
  capturedAt: string;
}

/** Snapshot of a bin (folder) in the project. */
export interface BinSnapshot {
  id: string;
  name: string;
  parentId?: string;
  /** Number of assets directly inside this bin. */
  assetCount: number;
  /** Child bin IDs. */
  childBinIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Current user selection inside Media Composer. */
export interface SelectionSnapshot {
  /** IDs of selected clips on the timeline. */
  clipIds: string[];
  /** IDs of selected tracks (track selectors). */
  trackIds: string[];
  /** In-point of the marked region (frames), if any. */
  markIn?: number;
  /** Out-point of the marked region (frames), if any. */
  markOut?: number;
  /** The currently active (record) sequence ID. */
  activeSequenceId: string;
}

/** Status of an asynchronous export / transcode job. */
export type ExportJobStatus =
  | 'queued'
  | 'rendering'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Represents a running or completed export job. */
export interface ExportJob {
  jobId: string;
  sequenceId: string;
  status: ExportJobStatus;
  /** 0-100 progress percentage. */
  progress: number;
  /** Output file URI once completed. */
  outputUri?: string;
  /** Human-readable error if status is 'failed'. */
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * Adapter that wraps the Avid Media Composer API surface.
 *
 * Implementations include:
 * - **Native adapter** -- talks to MC via the Avid Interplay / MediaCentral
 *   REST gateway or the local COM/AAF bridge.
 * - **Mock adapter** -- in-memory implementation for tests and demos.
 */
export interface IMediaComposerAdapter {
  // ----- Timeline ----------------------------------------------------------

  /**
   * Retrieve a full snapshot of the current timeline state.
   *
   * @param sequenceId - The project-scoped sequence identifier.
   * @returns A complete {@link TimelineSnapshot} including all tracks and clips.
   */
  getTimeline(sequenceId: string): Promise<TimelineSnapshot>;

  // ----- Clip operations ---------------------------------------------------

  /**
   * Add a clip from the project bin onto a specific track.
   *
   * @param trackId   - Target track ID.
   * @param assetId   - Source asset / master-clip ID.
   * @param position  - Insert position in frames.
   * @param duration  - Desired duration in frames.
   * @returns The newly created {@link ClipResult}.
   */
  addClip(
    trackId: string,
    assetId: string,
    position: number,
    duration: number,
  ): Promise<ClipResult>;

  /**
   * Remove a clip from the timeline (lift/extract).
   *
   * @param clipId - The clip instance to remove.
   */
  removeClip(clipId: string): Promise<void>;

  /**
   * Move an existing clip to a different track and/or position.
   *
   * @param clipId          - Clip to move.
   * @param targetTrackId   - Destination track.
   * @param targetPosition  - New position in frames.
   * @returns Updated {@link ClipResult} at its new location.
   */
  moveClip(
    clipId: string,
    targetTrackId: string,
    targetPosition: number,
  ): Promise<ClipResult>;

  /**
   * Trim a clip from one side.
   *
   * @param clipId - Clip to trim.
   * @param side   - Which end to trim (`'start'` or `'end'`).
   * @param delta  - Number of frames to add (positive) or remove (negative).
   * @returns Updated {@link ClipResult} after the trim.
   */
  trimClip(
    clipId: string,
    side: 'start' | 'end',
    delta: number,
  ): Promise<ClipResult>;

  /**
   * Split (razor / add-edit) a clip at a given position, producing two clips.
   *
   * @param clipId   - Clip to split.
   * @param position - Frame position (timeline-absolute) at which to cut.
   * @returns A tuple of the two resulting {@link ClipResult}s (left, right).
   */
  splitClip(
    clipId: string,
    position: number,
  ): Promise<[ClipResult, ClipResult]>;

  // ----- Playhead ----------------------------------------------------------

  /**
   * Move the playhead / position indicator to a specific frame.
   *
   * @param time - Target frame number.
   */
  setPlayhead(time: number): Promise<void>;

  /**
   * Get the current playhead position.
   *
   * @returns Current frame number.
   */
  getPlayhead(): Promise<number>;

  // ----- Bins --------------------------------------------------------------

  /**
   * List all bins visible in the current project.
   *
   * @returns Array of {@link BinSnapshot} objects.
   */
  getBins(): Promise<BinSnapshot[]>;

  /**
   * Create a new bin.
   *
   * @param name     - Display name for the bin.
   * @param parentId - Optional parent bin ID (root if omitted).
   * @returns The newly created {@link BinSnapshot}.
   */
  createBin(name: string, parentId?: string): Promise<BinSnapshot>;

  /**
   * Move one or more assets into a target bin.
   *
   * @param assetIds - Asset IDs to relocate.
   * @param binId    - Destination bin ID.
   */
  moveToBin(assetIds: string[], binId: string): Promise<void>;

  // ----- Selection ---------------------------------------------------------

  /**
   * Query the current user selection inside Media Composer.
   *
   * @returns A {@link SelectionSnapshot} describing selected clips, tracks,
   *          and mark in/out points.
   */
  getSelection(): Promise<SelectionSnapshot>;

  // ----- Effects -----------------------------------------------------------

  /**
   * Apply a real-time or rendered effect to a clip.
   *
   * @param clipId     - Target clip.
   * @param effectType - Effect identifier (e.g. `"color_correction"`, `"blur"`).
   * @param params     - Effect-specific parameter bag.
   */
  applyEffect(
    clipId: string,
    effectType: string,
    params: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Remove a previously applied effect from a clip.
   *
   * @param clipId   - The clip carrying the effect.
   * @param effectId - The specific effect instance to remove.
   */
  removeEffect(clipId: string, effectId: string): Promise<void>;

  // ----- Export -------------------------------------------------------------

  /**
   * Kick off an asynchronous export / transcode of a sequence.
   *
   * @param sequenceId - Sequence to export.
   * @param spec       - Delivery specification (codec, resolution, etc.).
   * @returns An {@link ExportJob} that can be polled for progress.
   */
  exportSequence(
    sequenceId: string,
    spec: DeliverySpec,
  ): Promise<ExportJob>;
}
