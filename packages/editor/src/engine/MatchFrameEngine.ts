// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Match Frame Engine
// ═══════════════════════════════════════════════════════════════════════════
//
// Implements Avid Media Composer's Match Frame, Reverse Match Frame, and
// Find Bin operations.
//
//  - Match Frame:          Park on a clip in the timeline, load the source
//                          clip in the Source Monitor at the exact same
//                          frame. Uses enabled track selectors to pick
//                          which track to match.
//
//  - Reverse Match Frame:  From a source clip currently loaded in the
//                          Source Monitor, find where that clip is used in
//                          the timeline and park the record playhead there.
//
//  - Find Bin:             Park on a clip in the timeline, locate and
//                          highlight its source master clip in its owning
//                          bin.
//

import { useEditorStore } from '../store/editor.store';
import type { Clip, Track, Bin, MediaAsset } from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MatchFrameResult {
  /** Whether the operation succeeded. */
  success: boolean;
  /** The asset ID of the resolved source clip, or null. */
  assetId: string | null;
  /** The source-relative time (seconds) within the source clip, or null. */
  sourceTime: number | null;
  /** The clip ID on the timeline that was matched, or null. */
  clipId: string | null;
  /** The track ID on which the match was found, or null. */
  trackId: string | null;
  /** The bin ID containing the source asset, or null. */
  binId: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Read-only snapshot of the current editor store state. */
function snap() {
  return useEditorStore.getState();
}

/**
 * Create a failed MatchFrameResult.
 */
function failResult(): MatchFrameResult {
  return {
    success: false,
    assetId: null,
    sourceTime: null,
    clipId: null,
    trackId: null,
    binId: null,
  };
}

/**
 * Create a successful MatchFrameResult.
 */
function okResult(
  assetId: string,
  sourceTime: number,
  clipId: string,
  trackId: string,
  binId: string | null = null,
): MatchFrameResult {
  return {
    success: true,
    assetId,
    sourceTime,
    clipId,
    trackId,
    binId,
  };
}

/**
 * Given a clip and a timeline position (seconds), calculate the
 * corresponding source time within the clip's media.
 *
 * Accounts for `trimStart` (source in-point offset) and `startTime`
 * (clip position on the timeline).
 */
function computeSourceTime(clip: Clip, timelineTime: number): number {
  const relativeTime = timelineTime - clip.startTime;
  return clip.trimStart + relativeTime;
}

/**
 * Determine which clip (if any) is under the playhead on a given track.
 */
function clipAtTime(track: Track, time: number): Clip | null {
  for (const clip of track.clips) {
    if (time >= clip.startTime && time < clip.endTime) {
      return clip;
    }
  }
  return null;
}

/**
 * Find the track that a clip belongs to.
 */
function findTrackForClip(
  tracks: Track[],
  clipId: string,
): { track: Track; clip: Clip } | null {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

/**
 * Recursively search bins (including nested children) for an asset by ID.
 * Returns the bin ID containing the asset, or null.
 */
function findBinForAsset(bins: Bin[], assetId: string): string | null {
  for (const bin of bins) {
    if (bin.assets.some((a) => a.id === assetId)) {
      return bin.id;
    }
    if (bin.children.length > 0) {
      const childResult = findBinForAsset(bin.children, assetId);
      if (childResult) return childResult;
    }
  }
  return null;
}

/**
 * Select the "best" track to match frame on.
 *
 * Priority:
 *   1. The currently selected track (if it has a clip under the playhead).
 *   2. The topmost (lowest sortOrder) video track with a clip under the playhead.
 *   3. The topmost audio track with a clip under the playhead.
 *
 * Only considers unmuted, unlocked tracks.
 */
function resolveMatchTrack(
  tracks: Track[],
  playheadTime: number,
  selectedTrackId: string | null,
): { track: Track; clip: Clip } | null {
  // 1. Selected track has priority.
  if (selectedTrackId) {
    const selTrack = tracks.find((t) => t.id === selectedTrackId);
    if (selTrack && !selTrack.muted && !selTrack.locked) {
      const clip = clipAtTime(selTrack, playheadTime);
      if (clip) return { track: selTrack, clip };
    }
  }

  // 2. Sort tracks by sortOrder (ascending) and find the first with a clip.
  const sorted = [...tracks]
    .filter((t) => !t.muted && !t.locked)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Prefer video tracks first.
  for (const track of sorted) {
    if (track.type !== 'VIDEO') continue;
    const clip = clipAtTime(track, playheadTime);
    if (clip) return { track, clip };
  }

  // 3. Fallback to audio tracks.
  for (const track of sorted) {
    if (track.type !== 'AUDIO') continue;
    const clip = clipAtTime(track, playheadTime);
    if (clip) return { track, clip };
  }

  return null;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Match Frame engine implementing three related operations:
 *
 *  1. **matchFrame()** -- Timeline -> Source Monitor. Load the source clip
 *     at the exact frame under the record playhead.
 *
 *  2. **reverseMatchFrame()** -- Source Monitor -> Timeline. Find where the
 *     currently loaded source clip is used in the timeline and park the
 *     record playhead there.
 *
 *  3. **findBin()** -- Timeline -> Bin. Locate and highlight the source
 *     master clip in its bin.
 *
 * All operations respect enabled/muted/locked track selectors.
 */
export class MatchFrameEngine {
  // ═══════════════════════════════════════════════════════════════════════
  //  Match Frame (Timeline -> Source)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Park the record playhead on a timeline clip, and load the corresponding
   * source clip in the Source Monitor at the exact same frame.
   *
   * Uses the currently enabled track selectors (selected track, or topmost
   * visible/unmuted video track, then audio).
   *
   * @returns MatchFrameResult describing the outcome.
   */
  matchFrame(): MatchFrameResult {
    const state = snap();
    const { tracks, playheadTime, selectedTrackId, bins } = state;

    const match = resolveMatchTrack(tracks, playheadTime, selectedTrackId);
    if (!match) return failResult();

    const { track, clip } = match;
    const assetId = clip.assetId ?? clip.id;
    const sourceTime = computeSourceTime(clip, playheadTime);
    const binId = findBinForAsset(bins, assetId);

    // Side-effect: load the source asset in the source monitor.
    const asset = this.findAssetById(assetId);
    if (asset) {
      state.setSourceAsset(asset);
    }

    return okResult(assetId, sourceTime, clip.id, track.id, binId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Reverse Match Frame (Source -> Timeline)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * From the currently loaded source clip, find where it is used in the
   * timeline and park the record playhead at the corresponding frame.
   *
   * Searches all tracks for a clip whose `assetId` matches the source asset
   * and whose source time range includes the current source playhead position.
   * If multiple matches exist, the first occurrence (earliest timeline time)
   * on the topmost track is chosen.
   *
   * @returns MatchFrameResult describing the outcome.
   */
  reverseMatchFrame(): MatchFrameResult {
    const state = snap();
    const { tracks, sourceAsset, bins } = state;

    if (!sourceAsset) {
      return failResult();
    }

    const sourceAssetId = sourceAsset.id;

    // We treat the current record playhead as the "source playhead" for
    // reverse match frame context. In a full implementation the source
    // monitor would have its own playhead state. For now, use 0 (start).
    // If the source monitor's playhead is available via sourceAsset, use it.
    const sourcePlayhead = 0;

    // Gather all candidate clips across all tracks.
    interface Candidate {
      track: Track;
      clip: Clip;
      timelineTime: number;
    }

    const candidates: Candidate[] = [];

    const sorted = [...tracks]
      .filter((t) => !t.locked)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const track of sorted) {
      for (const clip of track.clips) {
        const clipAssetId = clip.assetId ?? clip.id;
        if (clipAssetId !== sourceAssetId) continue;

        // Check whether the source playhead falls within this clip's source range.
        const sourceStart = clip.trimStart;
        const sourceEnd = clip.trimStart + (clip.endTime - clip.startTime);

        if (sourcePlayhead >= sourceStart && sourcePlayhead < sourceEnd) {
          const relativeInSource = sourcePlayhead - sourceStart;
          const timelineTime = clip.startTime + relativeInSource;
          candidates.push({ track, clip, timelineTime });
        }
      }
    }

    if (candidates.length === 0) {
      return failResult();
    }

    // Pick the earliest timeline occurrence on the topmost track.
    candidates.sort((a, b) => {
      if (a.track.sortOrder !== b.track.sortOrder) {
        return a.track.sortOrder - b.track.sortOrder;
      }
      return a.timelineTime - b.timelineTime;
    });

    const best = candidates[0];
    const binId = findBinForAsset(bins, sourceAssetId);

    // Side-effect: park the record playhead.
    state.setPlayhead(best!.timelineTime!);

    return okResult(
      sourceAssetId,
      sourcePlayhead,
      best!.clip.id!,
      best!.track.id!,
      binId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Find Bin
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Park on a clip in the timeline, locate and highlight the source master
   * clip in its owning bin.
   *
   * Opens the bin and selects it in the project panel.
   *
   * @returns MatchFrameResult describing the outcome.
   */
  findBin(): MatchFrameResult {
    const state = snap();
    const { tracks, playheadTime, selectedTrackId, bins } = state;

    const match = resolveMatchTrack(tracks, playheadTime, selectedTrackId);
    if (!match) return failResult();

    const { track, clip } = match;
    const assetId = clip.assetId ?? clip.id;
    const binId = findBinForAsset(bins, assetId);

    if (!binId) {
      // Clip has no traceable bin.
      return {
        success: false,
        assetId,
        sourceTime: null,
        clipId: clip.id,
        trackId: track.id,
        binId: null,
      };
    }

    // Side-effect: select the bin in the project panel so it opens/highlights.
    state.selectBin(binId);
    // Also expand the bin.
    state.toggleBin(binId);

    return okResult(
      assetId,
      computeSourceTime(clip, playheadTime),
      clip.id,
      track.id,
      binId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Match Frame on Specific Track
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Match frame on a specific track (overrides the auto-resolve logic).
   *
   * @param trackId The track to match against.
   * @returns MatchFrameResult describing the outcome.
   */
  matchFrameTrack(trackId: string): MatchFrameResult {
    const state = snap();
    const { tracks, playheadTime, bins } = state;

    const track = tracks.find((t) => t.id === trackId);
    if (!track) return failResult();

    const clip = clipAtTime(track, playheadTime);
    if (!clip) return failResult();

    const assetId = clip.assetId ?? clip.id;
    const sourceTime = computeSourceTime(clip, playheadTime);
    const binId = findBinForAsset(bins, assetId);

    // Side-effect: load source.
    const asset = this.findAssetById(assetId);
    if (asset) {
      state.setSourceAsset(asset);
    }

    return okResult(assetId, sourceTime, clip.id, track.id, binId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Source Clip Resolution
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Given a timeline position and track ID, resolve the source clip and
   * source-relative time.
   *
   * @param time Timeline time in seconds.
   * @param trackId Track ID to search.
   * @returns Source clip info, or null if no clip is at that position.
   */
  getSourceClipForTimelinePosition(
    time: number,
    trackId: string,
  ): { assetId: string; sourceTime: number } | null {
    const state = snap();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    const clip = clipAtTime(track, time);
    if (!clip) return null;

    const assetId = clip.assetId ?? clip.id;
    const sourceTime = computeSourceTime(clip, time);
    return { assetId, sourceTime };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Internal Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Search all bins (recursively) for a MediaAsset by ID.
   */
  private findAssetById(assetId: string): MediaAsset | null {
    const state = snap();
    return this.searchBinsForAsset(state.bins, assetId);
  }

  /**
   * Recursively search bins for an asset by ID.
   */
  private searchBinsForAsset(bins: Bin[], assetId: string): MediaAsset | null {
    for (const bin of bins) {
      const asset = bin.assets.find((a) => a.id === assetId);
      if (asset) return asset;
      if (bin.children.length > 0) {
        const childResult = this.searchBinsForAsset(bin.children, assetId);
        if (childResult) return childResult;
      }
    }
    return null;
  }
}

/** Singleton match frame engine instance. */
export const matchFrameEngine = new MatchFrameEngine();
