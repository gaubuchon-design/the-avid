// =============================================================================
//  THE AVID -- Through Edit Detection & Manipulation Engine
// =============================================================================
//
// Implements Resolve/Premiere-style through-edit detection and manipulation:
//  - Detect through edits (cuts where the two clips are contiguous in source)
//  - Join through edits back into a single clip
//  - Extend an edit to the next or previous edit point on the track
//
// A "through edit" occurs when two adjacent clips on the same track reference
// the same source asset and their source timecodes are contiguous — i.e. the
// outgoing clip's trimEnd source position equals the incoming clip's trimStart
// source position. This is typically the result of a razor blade cut that was
// never used for an actual edit.
//
// =============================================================================

import {
  type Clip,
  type Track,
} from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A detected through edit between two adjacent clips. */
export interface ThroughEdit {
  id: string;
  trackId: string;
  outClipId: string;
  inClipId: string;
  editTime: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let throughEditIdCounter = 0;
function genThroughEditId(): string {
  return `te_${++throughEditIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Compute the source end position for a clip.
 * This is the source time at the tail of the clip (trimStart + visible duration).
 */
function sourceEndTime(clip: Clip): number {
  const visibleDuration = clip.endTime - clip.startTime;
  return clip.trimStart + visibleDuration;
}

// =============================================================================
//  ThroughEditEngine
// =============================================================================

/**
 * Engine for detecting and manipulating through edits.
 *
 * Through edits are cuts between adjacent clips that share the same source
 * asset and have contiguous source timecode. They are typically the result
 * of an add-edit (razor cut) that was never refined — the two pieces still
 * represent a single continuous segment of source media.
 */
export class ThroughEditEngine {
  /** Subscriber callbacks. */
  private listeners = new Set<() => void>();

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('[ThroughEditEngine] Subscriber error:', err);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Detection
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Find all through edits across the given tracks.
   *
   * Two adjacent clips form a through edit when:
   *  1. They reference the same source asset (assetId matches).
   *  2. The outgoing clip's source end (trimStart + visible duration) equals
   *     the incoming clip's trimStart (within a small epsilon for float safety).
   *  3. The clips are contiguous on the timeline (outClip.endTime === inClip.startTime).
   *
   * @param tracks The tracks to scan.
   * @returns Array of detected ThroughEdit descriptors.
   */
  findThroughEdits(tracks: Track[]): ThroughEdit[] {
    const result: ThroughEdit[] = [];
    const EPSILON = 1e-6;

    for (const track of tracks) {
      // Sort clips by start time to ensure adjacency check is correct
      const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);

      for (let i = 0; i < sorted.length - 1; i++) {
        const outClip = sorted[i];
        const inClip = sorted[i + 1];

        // 1. Timeline adjacency: the out clip's end must touch the in clip's start
        if (Math.abs(outClip!.endTime! - inClip!.startTime!) > EPSILON) {
          continue;
        }

        // 2. Same source asset
        if (!outClip!.assetId! || !inClip!.assetId! || outClip!.assetId! !== inClip!.assetId!) {
          continue;
        }

        // 3. Contiguous source timecode
        const outSourceEnd = sourceEndTime(outClip!);
        if (Math.abs(outSourceEnd - inClip!.trimStart!) > EPSILON) {
          continue;
        }

        result.push({
          id: genThroughEditId(),
          trackId: track.id,
          outClipId: outClip!.id!,
          inClipId: inClip!.id!,
          editTime: outClip!.endTime!,
        });
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Join
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Join a through edit, merging the two clips back into one.
   *
   * The resulting clip spans the combined time range and source range of
   * the original two clips. The out clip is extended to cover the in clip's
   * range, and the in clip is removed.
   *
   * @param throughEdit The through edit to join.
   * @param tracks      The current tracks (immutable — a new array is returned).
   * @returns Updated tracks with the through edit joined.
   */
  joinThroughEdit(throughEdit: ThroughEdit, tracks: Track[]): Track[] {
    return tracks.map((track) => {
      if (track.id !== throughEdit.trackId) return track;

      const outClip = track.clips.find((c) => c.id === throughEdit.outClipId);
      const inClip = track.clips.find((c) => c.id === throughEdit.inClipId);

      if (!outClip || !inClip) {
        console.warn('[ThroughEditEngine] Could not find clips for through edit join');
        return track;
      }

      // Merge: extend the out clip to cover the in clip's range
      const mergedClip: Clip = {
        ...outClip,
        endTime: inClip.endTime,
        trimEnd: inClip.trimEnd,
      };

      // Replace outClip with merged, remove inClip
      const newClips = track.clips
        .filter((c) => c.id !== throughEdit.inClipId)
        .map((c) => (c.id === throughEdit.outClipId ? mergedClip : c));

      return { ...track, clips: newClips };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Extend Edit
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Extend a clip's head or tail to the next or previous edit point.
   *
   * - **head** extends the clip's start backwards to the previous clip's
   *   end time (or track start if no previous clip exists), adjusting
   *   trimStart accordingly.
   * - **tail** extends the clip's end forwards to the next clip's start
   *   time (or the end of available source media), adjusting trimEnd.
   *
   * This is a non-destructive operation — the original tracks are not
   * mutated; a new array is returned.
   *
   * @param clipId The clip to extend.
   * @param side   Which side to extend: 'head' (start) or 'tail' (end).
   * @param tracks The current tracks.
   * @returns Updated tracks with the extended clip.
   */
  extendEdit(clipId: string, side: 'head' | 'tail', tracks: Track[]): Track[] {
    return tracks.map((track) => {
      const clipIndex = track.clips.findIndex((c) => c.id === clipId);
      if (clipIndex === -1) return track;

      const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);
      const sortedIndex = sorted.findIndex((c) => c.id === clipId);
      const clip = sorted[sortedIndex];

      let newClip: Clip;

      if (side === 'head') {
        // Extend the clip's start to the previous edit point
        const prevClip = sortedIndex > 0 ? sorted[sortedIndex - 1] : null;
        const newStartTime = prevClip ? prevClip.endTime : 0;
        const delta = clip!.startTime! - newStartTime;

        // Ensure we have enough source media to extend
        const availableTrimStart = clip!.trimStart!;
        const actualDelta = Math.min(delta, availableTrimStart);
        const actualNewStart = clip!.startTime! - actualDelta;

        newClip = {
          ...clip!,
          startTime: actualNewStart,
          trimStart: clip!.trimStart! - actualDelta,
        };
      } else {
        // Extend the clip's end to the next edit point
        const nextClip = sortedIndex < sorted.length - 1 ? sorted[sortedIndex + 1] : null;
        const newEndTime = nextClip ? nextClip.startTime : clip!.endTime! + clip!.trimEnd!;
        const delta = newEndTime - clip!.endTime!;

        // Ensure we have enough source media to extend
        const availableTrimEnd = clip!.trimEnd!;
        const actualDelta = Math.min(delta, availableTrimEnd);
        const actualNewEnd = clip!.endTime! + actualDelta;

        newClip = {
          ...clip!,
          endTime: actualNewEnd,
          trimEnd: clip!.trimEnd! - actualDelta,
        };
      }

      const newClips = track.clips.map((c) => (c.id === clipId ? newClip : c));
      return { ...track, clips: newClips };
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to through edit engine state changes.
   *
   * @param cb Callback invoked on any mutation.
   * @returns An unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /** Remove all listeners. Primarily useful for tests. */
  dispose(): void {
    this.listeners.clear();
  }
}

/** Singleton through edit engine instance. */
export const throughEditEngine = new ThroughEditEngine();
