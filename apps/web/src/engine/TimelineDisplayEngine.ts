import { useEditorStore } from '../store/editor.store';
import type { Clip, Track, Bin, MediaAsset } from '../store/editor.store';

// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID -- Timeline Display Engine
//  Handles dupe detection, waveform computation, clip color resolution,
//  and other timeline visual/display features.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Types ──────────────────────────────────────────────────────────────────

/** Dupe detection result for a clip. */
export interface DupeInfo {
  clipId: string;
  trackId: string;
  isDuplicate: boolean;
  /** 0 = first use, 1 = second use, etc. */
  dupeIndex: number;
  /** Assigned color for this dupe group. */
  dupeColor: string;
  sourceAssetId: string;
  /** Source time range [trimStart, trimStart + duration]. */
  sourceRange: [number, number];
}

/** Waveform data at a specific zoom level. */
export interface WaveformCache {
  assetId: string;
  samplesPerPixel: number;
  peaks: Float32Array;
  troughs: Float32Array;
  rms: Float32Array;
}

/** Resolved clip color considering source, local, and offline status. */
export interface ResolvedClipColor {
  clipId: string;
  color: string;
  source: 'local' | 'source' | 'track' | 'offline' | 'default';
}

/** Clip text to display based on current mode. */
export interface ClipDisplayText {
  clipId: string;
  text: string;
  mode: 'name' | 'source' | 'media' | 'comments';
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Dupe detection color palette (distinct colors for different dupe groups). */
const DUPE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
] as const;

/** Default track height in pixels when none is stored. */
const DEFAULT_TRACK_HEIGHT = 60;

/** Default clip color when no other source provides one. */
const DEFAULT_CLIP_COLOR = '#5b6af5';

/** Color used for offline clips (asset not found in any bin). */
const OFFLINE_CLIP_COLOR = '#ff4444';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Read-only snapshot of the current editor store state. */
function snap() {
  return useEditorStore.getState();
}

/**
 * Compute the source time range for a clip.
 * Returns [trimStart, trimStart + clipDuration].
 */
function sourceRange(clip: Clip): [number, number] {
  const duration = clip.endTime - clip.startTime;
  return [clip.trimStart, clip.trimStart + duration];
}

/**
 * Check whether two numeric ranges overlap.
 * Ranges are half-open: [startA, endA) and [startB, endB).
 */
function rangesOverlap(
  startA: number, endA: number,
  startB: number, endB: number,
): boolean {
  return startA < endB && startB < endA;
}

/**
 * Generate a stable key for a dupe group (asset + discretized source range).
 * Two clips belong to the same dupe group when they share the same assetId
 * and their source ranges overlap.
 */
function dupeGroupKey(assetId: string, range: [number, number]): string {
  return `${assetId}:${range[0].toFixed(6)}:${range[1].toFixed(6)}`;
}

/**
 * Recursively search all bins for an asset by ID.
 */
function findAssetInBins(bins: Bin[], assetId: string): MediaAsset | null {
  for (const bin of bins) {
    const asset = bin.assets.find((a) => a.id === assetId);
    if (asset) return asset;
    if (bin.children.length > 0) {
      const childResult = findAssetInBins(bin.children, assetId);
      if (childResult) return childResult;
    }
  }
  return null;
}

/**
 * Collect every assetId present in all bins (recursively).
 */
function collectBinAssetIds(bins: Bin[]): Set<string> {
  const ids = new Set<string>();
  for (const bin of bins) {
    for (const asset of bin.assets) {
      ids.add(asset.id);
    }
    if (bin.children.length > 0) {
      for (const id of collectBinAssetIds(bin.children)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Timeline Display Engine
 *
 * Provides visual/display computations for the timeline including:
 *   - Dupe detection (Avid-style: same source frame on same track)
 *   - Waveform computation from raw audio samples
 *   - Clip color resolution (local > source > track > default)
 *   - Clip text display based on current display mode
 *   - Track display helpers (heights, zoom, coordinate conversions)
 */
export class TimelineDisplayEngine {
  // ─── Internal caches ────────────────────────────────────────────────────

  /** Dupe info indexed by clipId. Invalidated on every detectDupes() call. */
  private dupeCache = new Map<string, DupeInfo>();

  /** Waveform caches indexed by `${assetId}:${samplesPerPixel}`. */
  private waveformCaches = new Map<string, WaveformCache>();

  /** Store subscription teardown (if active). */
  private unsubscribe: (() => void) | null = null;

  // ═══════════════════════════════════════════════════════════════════════
  //  Dupe Detection
  // ═══════════════════════════════════════════════════════════════════════
  //
  //  Avid's dupe detection highlights clips that reuse the same source
  //  frame more than once on the same track. Each dupe group (clips sharing
  //  the same source asset with overlapping source ranges) is assigned a
  //  distinct color from the palette.
  //

  /**
   * Scan all tracks and detect duplicate source usage.
   *
   * Two clips are considered dupes when they reside on the same track,
   * share the same `assetId`, and their source time ranges overlap.
   *
   * @returns Array of DupeInfo for every clip that participates in a dupe group.
   */
  detectDupes(): DupeInfo[] {
    const state = snap();
    const { tracks, dupeDetectionEnabled } = state;

    // Clear previous cache.
    this.dupeCache.clear();

    if (!dupeDetectionEnabled) {
      return [];
    }

    const results: DupeInfo[] = [];
    let colorIndex = 0;

    for (const track of tracks) {
      // Group clips on this track by assetId.
      const assetGroups = new Map<string, Clip[]>();

      for (const clip of track.clips) {
        const assetId = clip.assetId ?? clip.id;
        let group = assetGroups.get(assetId);
        if (!group) {
          group = [];
          assetGroups.set(assetId, group);
        }
        group.push(clip);
      }

      // For each asset group with 2+ clips, check source range overlaps.
      for (const [assetId, clips] of assetGroups) {
        if (clips.length < 2) {
          // Only one usage of this asset on this track -- not a dupe,
          // but still record it with isDuplicate=false for completeness.
          const clip = clips[0];
          const range = sourceRange(clip!);
          const info: DupeInfo = {
            clipId: clip!.id!,
            trackId: track.id,
            isDuplicate: false,
            dupeIndex: 0,
            dupeColor: '',
            sourceAssetId: assetId,
            sourceRange: range,
          };
          this.dupeCache.set(clip!.id!, info);
          continue;
        }

        // Build overlap groups using union-find approach.
        // Each overlap group gets its own color.
        const overlapGroups = this.buildOverlapGroups(clips);

        for (const group of overlapGroups) {
          if (group.length < 2) {
            // Single clip in this overlap group -- not a dupe.
            const clip = group[0];
            const range = sourceRange(clip!);
            const info: DupeInfo = {
              clipId: clip!.id!,
              trackId: track.id,
              isDuplicate: false,
              dupeIndex: 0,
              dupeColor: '',
              sourceAssetId: assetId,
              sourceRange: range,
            };
            this.dupeCache.set(clip!.id!, info);
            continue;
          }

          // This overlap group has genuine dupes.
          const groupColor = DUPE_COLORS[colorIndex % DUPE_COLORS.length];
          colorIndex++;

          // Sort by timeline position for stable dupe index assignment.
          const sorted = [...group].sort((a, b) => a.startTime - b.startTime);

          for (let i = 0; i < sorted.length; i++) {
            const clip = sorted[i];
            const range = sourceRange(clip!);
            const info: DupeInfo = {
              clipId: clip!.id!,
              trackId: track.id,
              isDuplicate: true,
              dupeIndex: i,
              dupeColor: groupColor!,
              sourceAssetId: assetId,
              sourceRange: range,
            };
            this.dupeCache.set(clip!.id!, info);
            results.push(info);
          }
        }
      }
    }

    return results;
  }

  /**
   * Get dupe info for a specific clip.
   * Returns null if dupe detection has not been run or the clip is unknown.
   */
  getDupeInfo(clipId: string): DupeInfo | null {
    return this.dupeCache.get(clipId) ?? null;
  }

  /**
   * Quick check whether a clip is part of a dupe group.
   */
  isDuplicate(clipId: string): boolean {
    const info = this.dupeCache.get(clipId);
    return info?.isDuplicate ?? false;
  }

  /**
   * How many times this clip's source range appears on its track.
   * Returns 1 (no dupes) if the clip is not part of a dupe group.
   */
  getDupeCount(clipId: string): number {
    const info = this.dupeCache.get(clipId);
    if (!info || !info.isDuplicate) return 1;

    // Count all cached entries with the same track, source asset, and overlapping ranges.
    let count = 0;
    for (const entry of this.dupeCache.values()) {
      if (
        entry.trackId === info.trackId &&
        entry.sourceAssetId === info.sourceAssetId &&
        entry.isDuplicate &&
        entry.dupeColor === info.dupeColor
      ) {
        count++;
      }
    }
    return Math.max(count, 1);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Waveform Computation
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Compute peaks, troughs, and RMS from raw audio sample data at a
   * specific zoom level (samples per pixel).
   *
   * @param assetId         Unique identifier for the audio asset.
   * @param audioData       Raw audio samples (mono, normalized -1..1).
   * @param sampleRate      Sample rate of the audio data (e.g. 48000).
   * @param samplesPerPixel How many samples each output pixel represents.
   * @returns WaveformCache with Float32Array peaks, troughs, and RMS values.
   */
  computeWaveform(
    assetId: string,
    audioData: Float32Array,
    sampleRate: number,
    samplesPerPixel: number,
  ): WaveformCache {
    const cacheKey = `${assetId}:${samplesPerPixel}`;

    // Return existing cache if available.
    const existing = this.waveformCaches.get(cacheKey);
    if (existing) return existing;

    const totalSamples = audioData.length;
    const pixelCount = Math.ceil(totalSamples / samplesPerPixel);

    const peaks = new Float32Array(pixelCount);
    const troughs = new Float32Array(pixelCount);
    const rms = new Float32Array(pixelCount);

    for (let px = 0; px < pixelCount; px++) {
      const start = px * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, totalSamples);
      const blockSize = end - start;

      if (blockSize === 0) {
        peaks[px] = 0;
        troughs[px] = 0;
        rms[px] = 0;
        continue;
      }

      let max = -Infinity;
      let min = Infinity;
      let sumSquares = 0;

      for (let s = start; s < end; s++) {
        const sample = audioData[s];
        if (sample! > max) max = sample!;
        if (sample! < min) min = sample!;
        sumSquares += sample! * sample!;
      }

      peaks[px] = max;
      troughs[px] = min;
      rms[px] = Math.sqrt(sumSquares / blockSize);
    }

    const cache: WaveformCache = {
      assetId,
      samplesPerPixel,
      peaks,
      troughs,
      rms,
    };

    this.waveformCaches.set(cacheKey, cache);
    return cache;
  }

  /**
   * Get waveform peak/trough data for a clip, scaled to the given pixel width.
   *
   * Uses the clip's `waveformData` array if available (pre-computed peaks
   * normalized to 0..1). Returns null if the clip has no waveform data.
   *
   * @param clipId      The clip to get waveform data for.
   * @param widthPixels The target width in pixels to scale the waveform to.
   * @returns Peaks and troughs arrays scaled to widthPixels, or null.
   */
  getWaveformForClip(
    clipId: string,
    widthPixels: number,
  ): { peaks: number[]; troughs: number[] } | null {
    const state = snap();

    // Find the clip across all tracks.
    let clip: Clip | null = null;
    for (const track of state.tracks) {
      const found = track.clips.find((c) => c.id === clipId);
      if (found) {
        clip = found;
        break;
      }
    }

    if (!clip || !clip.waveformData || clip.waveformData.length === 0) {
      return null;
    }

    const sourceData = clip.waveformData;
    const sourceLen = sourceData.length;

    if (widthPixels <= 0) return null;

    // Resample the waveform data to fit the target pixel width.
    const peaks: number[] = new Array(widthPixels);
    const troughs: number[] = new Array(widthPixels);
    const samplesPerPixel = sourceLen / widthPixels;

    for (let px = 0; px < widthPixels; px++) {
      const start = Math.floor(px * samplesPerPixel);
      const end = Math.min(Math.floor((px + 1) * samplesPerPixel), sourceLen);

      if (start >= sourceLen || end <= start) {
        peaks[px] = 0;
        troughs[px] = 0;
        continue;
      }

      let max = -Infinity;
      let min = Infinity;

      for (let s = start; s < end; s++) {
        const v = sourceData[s];
        if (v! > max) max = v!;
        if (v! < min) min = v!;
      }

      // Waveform data is typically 0..1 (absolute). Mirror for troughs.
      peaks[px] = max === -Infinity ? 0 : max;
      troughs[px] = min === Infinity ? 0 : -min;
    }

    return { peaks, troughs };
  }

  /**
   * Discard all cached waveform data.
   */
  clearWaveformCache(): void {
    this.waveformCaches.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Clip Color Resolution
  // ═══════════════════════════════════════════════════════════════════════
  //
  //  Avid resolves clip colors in this priority order:
  //    1. Local color (user-assigned per clip instance)
  //    2. Source color (from the clip's own `color` property)
  //    3. Track color (from the containing track)
  //    4. Offline color (if asset is missing from all bins)
  //    5. Default color
  //

  /**
   * Resolve the display color for a clip.
   *
   * @param clipId The clip to resolve the color for.
   * @returns ResolvedClipColor with the final color and its source.
   */
  resolveClipColor(clipId: string): ResolvedClipColor {
    const state = snap();
    const { clipLocalColors, bins } = state;

    // Find the clip and its track.
    let clip: Clip | null = null;
    let track: Track | null = null;

    for (const t of state.tracks) {
      const found = t.clips.find((c) => c.id === clipId);
      if (found) {
        clip = found;
        track = t;
        break;
      }
    }

    if (!clip || !track) {
      return { clipId, color: DEFAULT_CLIP_COLOR, source: 'default' };
    }

    // 1. Local color (user-assigned override).
    const localColor = clipLocalColors[clipId];
    if (localColor) {
      return { clipId, color: localColor, source: 'local' };
    }

    // 2. Check if clip is offline (asset not found in bins).
    if (clip.assetId) {
      const assetInBins = findAssetInBins(bins, clip.assetId);
      if (!assetInBins) {
        return { clipId, color: OFFLINE_CLIP_COLOR, source: 'offline' };
      }
    }

    // 3. Source color (clip's own color property).
    if (clip.color) {
      return { clipId, color: clip.color, source: 'source' };
    }

    // 4. Track color.
    if (track.color) {
      return { clipId, color: track.color, source: 'track' };
    }

    // 5. Default.
    return { clipId, color: DEFAULT_CLIP_COLOR, source: 'default' };
  }

  /**
   * Resolve display colors for all clips across all tracks.
   */
  resolveAllClipColors(): ResolvedClipColor[] {
    const state = snap();
    const results: ResolvedClipColor[] = [];

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        results.push(this.resolveClipColor(clip.id));
      }
    }

    return results;
  }

  /**
   * Find all clip IDs whose `assetId` does not match any asset in bins.
   * These are "offline" clips -- their linked media is missing.
   */
  getOfflineClipIds(): string[] {
    const state = snap();
    const binAssetIds = collectBinAssetIds(state.bins);
    const offlineIds: string[] = [];

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (clip.assetId && !binAssetIds.has(clip.assetId)) {
          offlineIds.push(clip.id);
        }
      }
    }

    return offlineIds;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Clip Text Display
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the text to display on a clip based on the current display mode.
   *
   * Modes:
   *   - 'name'     -> clip.name
   *   - 'source'   -> assetId or source file name
   *   - 'media'    -> media path (assetId as placeholder)
   *   - 'comments' -> comment metadata (empty string if none)
   *
   * @param clipId The clip to get display text for.
   * @returns ClipDisplayText with the resolved text and mode.
   */
  getClipDisplayText(clipId: string): ClipDisplayText {
    const state = snap();
    const mode = state.clipTextDisplay;

    // Find the clip.
    let clip: Clip | null = null;
    for (const track of state.tracks) {
      const found = track.clips.find((c) => c.id === clipId);
      if (found) {
        clip = found;
        break;
      }
    }

    if (!clip) {
      return { clipId, text: '', mode };
    }

    let text: string;

    switch (mode) {
      case 'name':
        text = clip.name;
        break;

      case 'source':
        text = clip.assetId ?? clip.name;
        break;

      case 'media':
        // In a full implementation this would be a file path.
        // Use assetId as the placeholder per spec.
        text = clip.assetId ?? clip.name;
        break;

      case 'comments': {
        // Look up review comments that fall within this clip's time range.
        const comments = state.reviewComments.filter(
          (c) => c.time >= clip!.startTime && c.time < clip!.endTime,
        );
        text = comments.length > 0
          ? comments.map((c) => c.body).join('; ')
          : '';
        break;
      }

      default:
        text = clip.name;
    }

    return { clipId, text, mode };
  }

  /**
   * Get display texts for all clips across all tracks.
   */
  getAllClipDisplayTexts(): ClipDisplayText[] {
    const state = snap();
    const results: ClipDisplayText[] = [];

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        results.push(this.getClipDisplayText(clip.id));
      }
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Track Display Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the display height for a track.
   * Returns the stored height from the editor store, or the default (60px).
   *
   * @param trackId The track to query.
   * @returns Height in pixels.
   */
  getTrackHeight(trackId: string): number {
    const state = snap();
    return state.trackHeights[trackId] ?? DEFAULT_TRACK_HEIGHT;
  }

  /**
   * Calculate the total timeline width in pixels for a given duration and zoom.
   *
   * @param durationSeconds Total duration in seconds.
   * @param zoom            Pixels per second.
   * @returns Width in pixels.
   */
  getTimelineWidth(durationSeconds: number, zoom: number): number {
    return durationSeconds * zoom;
  }

  /**
   * Convert a time position (seconds) to a pixel X coordinate,
   * accounting for the current scroll offset.
   *
   * @param time       Time in seconds.
   * @param zoom       Pixels per second.
   * @param scrollLeft Horizontal scroll offset in pixels.
   * @returns X coordinate in pixels (relative to viewport).
   */
  timeToPixel(time: number, zoom: number, scrollLeft: number): number {
    return time * zoom - scrollLeft;
  }

  /**
   * Convert a pixel X coordinate to a time position (seconds),
   * accounting for the current scroll offset.
   *
   * @param pixel      X coordinate in pixels (relative to viewport).
   * @param zoom       Pixels per second.
   * @param scrollLeft Horizontal scroll offset in pixels.
   * @returns Time in seconds.
   */
  pixelToTime(pixel: number, zoom: number, scrollLeft: number): number {
    return (pixel + scrollLeft) / zoom;
  }

  /**
   * Calculate the visible time range given the viewport width,
   * zoom, and scroll position.
   *
   * @param viewportWidth Width of the visible area in pixels.
   * @param zoom          Pixels per second.
   * @param scrollLeft    Horizontal scroll offset in pixels.
   * @returns Tuple of [startTime, endTime] in seconds.
   */
  getVisibleTimeRange(
    viewportWidth: number,
    zoom: number,
    scrollLeft: number,
  ): [number, number] {
    const startTime = scrollLeft / zoom;
    const endTime = (scrollLeft + viewportWidth) / zoom;
    return [startTime, endTime];
  }

  /**
   * Calculate the zoom level (pixels per second) needed to fit the entire
   * sequence duration within the viewport.
   *
   * @param durationSeconds Total duration in seconds.
   * @param viewportWidth   Width of the visible area in pixels.
   * @returns Zoom level (pixels per second). Returns 1 if duration is 0.
   */
  zoomToFit(durationSeconds: number, viewportWidth: number): number {
    if (durationSeconds <= 0) return 1;
    return viewportWidth / durationSeconds;
  }

  /**
   * Calculate zoom and scroll position to frame a specific time selection
   * within the viewport.
   *
   * Adds a small padding (5%) on each side of the selection for visual breathing room.
   *
   * @param startTime      Start of the selection in seconds.
   * @param endTime        End of the selection in seconds.
   * @param viewportWidth  Width of the visible area in pixels.
   * @returns Object with `zoom` (pixels per second) and `scrollLeft` (pixels).
   */
  zoomToSelection(
    startTime: number,
    endTime: number,
    viewportWidth: number,
  ): { zoom: number; scrollLeft: number } {
    const selectionDuration = endTime - startTime;

    if (selectionDuration <= 0) {
      // Degenerate selection: center on the point.
      const currentZoom = snap().zoom || 1;
      return {
        zoom: currentZoom,
        scrollLeft: startTime * currentZoom - viewportWidth / 2,
      };
    }

    // Add 5% padding on each side.
    const padding = selectionDuration * 0.05;
    const paddedDuration = selectionDuration + padding * 2;
    const paddedStart = Math.max(0, startTime - padding);

    const zoom = viewportWidth / paddedDuration;
    const scrollLeft = paddedStart * zoom;

    return { zoom, scrollLeft };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscription
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to store changes. The callback fires whenever the editor
   * store state changes, allowing consumers to re-run display computations.
   *
   * @param cb Callback invoked on state changes.
   * @returns Unsubscribe function.
   */
  subscribe(cb: () => void): () => void {
    return useEditorStore.subscribe(cb);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Internal Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build overlap groups from a set of clips that share the same assetId.
   *
   * Two clips are in the same overlap group if their source time ranges
   * overlap (transitively). Uses a simple union-find approach.
   *
   * @param clips Array of clips with the same assetId on the same track.
   * @returns Array of clip groups, where each group has overlapping source ranges.
   */
  private buildOverlapGroups(clips: Clip[]): Clip[][] {
    const n = clips.length;
    // Union-find parent array.
    const parent = Array.from({ length: n }, (_, i) => i);

    function find(x: number): number {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]!]!; // path compression
        x = parent[x]!;
      }
      return x;
    }

    function union(a: number, b: number): void {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }

    // Compare all pairs for source range overlap.
    for (let i = 0; i < n; i++) {
      const rangeI = sourceRange(clips[i]!);
      for (let j = i + 1; j < n; j++) {
        const rangeJ = sourceRange(clips[j]!);
        if (rangesOverlap(rangeI[0], rangeI[1], rangeJ[0], rangeJ[1])) {
          union(i, j);
        }
      }
    }

    // Group by root.
    const groups = new Map<number, Clip[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      let group = groups.get(root);
      if (!group) {
        group = [];
        groups.set(root, group);
      }
      group.push(clips[i]!);
    }

    return [...groups.values()];
  }
}

/** Singleton timeline display engine instance. */
export const timelineDisplayEngine = new TimelineDisplayEngine();
