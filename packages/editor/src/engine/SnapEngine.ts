import type { SnapResult } from './types';
import type { Track, Marker } from '../store/editor.store';

/**
 * Magnetic snap engine for the timeline.
 *
 * Provides a snap-to-grid / snap-to-edge behaviour that draws dragged elements
 * toward nearby anchor points (clip edges, playhead, markers, timeline origin).
 */
export class SnapEngine {
  private enabled = true;
  private tolerancePx = 8;

  /**
   * Enable or disable snapping globally.
   * @param on Whether snapping should be active.
   * @example
   * snapEngine.setEnabled(false); // disable snapping
   */
  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /**
   * Set the pixel tolerance for snapping.
   * @param px Distance in pixels within which a snap will trigger.
   * @example
   * snapEngine.setTolerance(12); // increase snap range
   */
  setTolerance(px: number): void {
    this.tolerancePx = px;
  }

  /** Whether snapping is currently enabled. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Given a time position (seconds) and a set of anchor times,
   * return the closest snap point within tolerance, or `null`.
   *
   * @param time   The candidate time position in seconds.
   * @param zoom   Current timeline zoom level (pixels per second).
   * @param anchors Array of anchor times to snap against.
   * @returns The best snap result, or `null` if nothing is within tolerance.
   * @example
   * const result = snapEngine.snap(5.2, 100, [0, 5, 10, 15]);
   * if (result) clip.startTime = result.time;
   */
  snap(time: number, zoom: number, anchors: number[]): SnapResult | null {
    if (!this.enabled || anchors.length === 0) return null;

    const toleranceSec = this.tolerancePx / zoom;
    let bestDelta = Infinity;
    let bestAnchor = 0;

    for (const anchor of anchors) {
      const delta = Math.abs(time - anchor);
      if (delta < toleranceSec && delta < bestDelta) {
        bestDelta = delta;
        bestAnchor = anchor;
      }
    }

    if (bestDelta === Infinity) return null;
    return { time: bestAnchor, anchor: bestAnchor, delta: bestDelta };
  }

  /**
   * Collect all snap-worthy time anchors from the current timeline state.
   * Optionally excludes a clip (e.g. the one currently being dragged).
   *
   * @param tracks         The timeline tracks containing clips.
   * @param playheadTime   The current playhead position in seconds.
   * @param markers        Array of timeline markers.
   * @param excludeClipId  Optional clip ID to exclude from anchor collection.
   * @returns Sorted array of unique anchor times.
   * @example
   * const anchors = snapEngine.collectAnchors(tracks, playhead, markers, draggedClipId);
   * const snap = snapEngine.snap(candidateTime, zoom, anchors);
   */
  collectAnchors(
    tracks: Track[],
    playheadTime: number,
    markers: Marker[],
    excludeClipId?: string,
  ): number[] {
    const set = new Set<number>();
    set.add(0);
    set.add(playheadTime);

    for (const marker of markers) {
      set.add(marker.time);
    }
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.id === excludeClipId) continue;
        set.add(clip.startTime);
        set.add(clip.endTime);
      }
    }

    return [...set].sort((a, b) => a - b);
  }
}

/** Singleton snap engine. */
export const snapEngine = new SnapEngine();
