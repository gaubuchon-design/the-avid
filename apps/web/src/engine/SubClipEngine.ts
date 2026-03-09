// =============================================================================
//  THE AVID -- SubClip, AutoSequence & Subsequence Engine
// =============================================================================
//
// Implements Avid Media Composer's SubClip / Subsequence workflows:
//  - Create sub-clips from master clips with defined IN/OUT points
//  - Create sub-clips directly from the source monitor IN/OUT marks
//  - Load sub-clips into the source monitor for further editing
//  - Create subsequences from timeline IN/OUT ranges
//  - AutoSequence: assemble clips from a bin in timecode or name order
//  - Full bin organisation support (sub-clips live in bins like any asset)
//
// =============================================================================

import {
  useEditorStore,
  type Clip,
  type MediaAsset,
  type Track,
  makeClip,
  DEFAULT_INTRINSIC_VIDEO,
  DEFAULT_INTRINSIC_AUDIO,
  DEFAULT_TIME_REMAP,
} from '../store/editor.store';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A sub-clip carved from a master clip's time range. */
export interface SubClip {
  id: string;
  name: string;
  masterClipId: string;       // reference to source asset
  masterClipAssetId: string;
  inPoint: number;            // source IN time
  outPoint: number;           // source OUT time
  duration: number;
  binId: string;              // which bin it lives in
  comment?: string;
  color?: string;
  createdAt: number;
}

/** A subsequence extracted from a parent sequence's time range. */
export interface Subsequence {
  id: string;
  name: string;
  sourceSequenceId: string;   // parent sequence
  inPoint: number;
  outPoint: number;
  tracks: { trackId: string; clips: any[] }[];
  binId: string;
  createdAt: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let subClipIdCounter = 0;
function genSubClipId(): string {
  return `sc_${++subClipIdCounter}_${Date.now().toString(36)}`;
}

let subsequenceIdCounter = 0;
function genSubsequenceId(): string {
  return `subseq_${++subsequenceIdCounter}_${Date.now().toString(36)}`;
}

let autoSeqIdCounter = 0;
function genAutoSeqId(): string {
  return `aseq_${++autoSeqIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Recursively search bins for an asset by ID.
 */
function findAssetInBins(bins: any[], assetId: string): MediaAsset | null {
  for (const bin of bins) {
    const found = bin.assets?.find((a: MediaAsset) => a.id === assetId);
    if (found) return found;
    if (bin.children?.length) {
      const childResult = findAssetInBins(bin.children, assetId);
      if (childResult) return childResult;
    }
  }
  return null;
}

/**
 * Collect all assets from a list of bins (including nested children).
 */
function collectAllAssetsFromBins(bins: any[]): MediaAsset[] {
  const result: MediaAsset[] = [];
  for (const bin of bins) {
    if (bin.assets) result.push(...bin.assets);
    if (bin.children?.length) {
      result.push(...collectAllAssetsFromBins(bin.children));
    }
  }
  return result;
}

/**
 * Find a specific bin by ID, searching recursively.
 */
function findBinById(bins: any[], binId: string): any | null {
  for (const bin of bins) {
    if (bin.id === binId) return bin;
    if (bin.children?.length) {
      const childResult = findBinById(bin.children, binId);
      if (childResult) return childResult;
    }
  }
  return null;
}

// =============================================================================
//  SubClipEngine
// =============================================================================

/**
 * Avid-style SubClip, AutoSequence, and Subsequence engine.
 *
 * Manages sub-clips (portions of master clips defined by IN/OUT points),
 * subsequences (portions of sequences), and provides AutoSequence for
 * assembling clips from bins in a sorted order.
 *
 * Uses the editor store for state reads (source monitor, timeline, bins)
 * and provides a subscribe/unsubscribe pattern for UI reactivity.
 */
export class SubClipEngine {
  /** All sub-clips keyed by ID. */
  private subClips: Map<string, SubClip> = new Map();
  /** All subsequences keyed by ID. */
  private subsequences: Map<string, Subsequence> = new Map();
  /** General subscribers. */
  private listeners = new Set<() => void>();

  // ─── Private helpers ──────────────────────────────────────────────────

  /** Notify all subscribers that state has changed. */
  private notify(): void {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error('[SubClipEngine] Subscriber error:', err); }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SubClip CRUD
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a sub-clip from a master clip asset with explicit IN/OUT points.
   *
   * The sub-clip is a virtual reference back to the original asset; it does
   * not duplicate media. It is placed into the specified bin.
   *
   * @param assetId  The master clip's asset ID.
   * @param inPoint  Source IN time in seconds.
   * @param outPoint Source OUT time in seconds.
   * @param binId    Target bin ID.
   * @param name     Optional display name (defaults to "SubClip of <asset>").
   * @returns The newly created SubClip.
   */
  createSubClip(
    assetId: string,
    inPoint: number,
    outPoint: number,
    binId: string,
    name?: string,
  ): SubClip {
    const state = useEditorStore.getState();
    const asset = findAssetInBins(state.bins, assetId);

    // Validate time range
    const effectiveIn = Math.max(0, Math.min(inPoint, outPoint));
    const effectiveOut = Math.max(inPoint, outPoint);

    // Clamp to asset duration if known
    const maxDuration = asset?.duration ?? Infinity;
    const clampedOut = Math.min(effectiveOut, maxDuration);

    const subClip: SubClip = {
      id: genSubClipId(),
      name: name ?? `SubClip of ${asset?.name ?? assetId}`,
      masterClipId: assetId,
      masterClipAssetId: assetId,
      inPoint: effectiveIn,
      outPoint: clampedOut,
      duration: clampedOut - effectiveIn,
      binId,
      createdAt: Date.now(),
    };

    this.subClips.set(subClip.id, subClip);
    this.notify();
    return subClip;
  }

  /**
   * Create a sub-clip from the current source monitor IN/OUT marks.
   *
   * Reads the source monitor's loaded asset and IN/OUT points from the
   * editor store. If no source asset is loaded or no IN/OUT are set,
   * returns null.
   *
   * @returns The newly created SubClip, or null if preconditions are not met.
   */
  createSubClipFromSource(): SubClip | null {
    const state = useEditorStore.getState();
    const { sourceAsset, inPoint, outPoint, selectedBinId } = state;

    if (!sourceAsset) {
      console.warn('[SubClipEngine] No source asset loaded in source monitor');
      return null;
    }
    if (inPoint === null || outPoint === null) {
      console.warn('[SubClipEngine] IN and OUT points must both be set in source monitor');
      return null;
    }
    if (inPoint >= outPoint) {
      console.warn('[SubClipEngine] IN point must be before OUT point');
      return null;
    }

    // Use the selected bin, or fall back to the first bin
    const targetBinId = selectedBinId ?? state.bins[0]?.id ?? 'default';

    return this.createSubClip(
      sourceAsset.id,
      inPoint,
      outPoint,
      targetBinId,
    );
  }

  /**
   * Delete a sub-clip by ID.
   *
   * @param subClipId The sub-clip to remove.
   */
  deleteSubClip(subClipId: string): void {
    if (!this.subClips.has(subClipId)) {
      console.warn(`[SubClipEngine] SubClip '${subClipId}' not found`);
      return;
    }
    this.subClips.delete(subClipId);
    this.notify();
  }

  /**
   * Retrieve a sub-clip by ID.
   *
   * @param id The sub-clip ID.
   * @returns The SubClip, or null if not found.
   */
  getSubClip(id: string): SubClip | null {
    return this.subClips.get(id) ?? null;
  }

  /**
   * Get all sub-clips.
   *
   * @returns Array of all SubClip instances, sorted by creation time.
   */
  getAllSubClips(): SubClip[] {
    return Array.from(this.subClips.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  /**
   * Get all sub-clips referencing a specific master clip asset.
   *
   * @param assetId The master clip asset ID.
   * @returns Array of SubClips for that asset.
   */
  getSubClipsForAsset(assetId: string): SubClip[] {
    return this.getAllSubClips().filter(
      (sc) => sc.masterClipAssetId === assetId,
    );
  }

  /**
   * Get all sub-clips in a specific bin.
   *
   * @param binId The bin ID.
   * @returns Array of SubClips in that bin.
   */
  getSubClipsInBin(binId: string): SubClip[] {
    return this.getAllSubClips().filter((sc) => sc.binId === binId);
  }

  /**
   * Load a sub-clip into the source monitor.
   *
   * Sets the source monitor's loaded asset to the sub-clip's master clip
   * and positions the IN/OUT marks to match the sub-clip range.
   *
   * @param subClipId The sub-clip to load.
   */
  loadSubClipToSource(subClipId: string): void {
    const subClip = this.subClips.get(subClipId);
    if (!subClip) {
      console.warn(`[SubClipEngine] SubClip '${subClipId}' not found`);
      return;
    }

    const state = useEditorStore.getState();
    const asset = findAssetInBins(state.bins, subClip.masterClipAssetId);

    if (asset) {
      state.setSourceAsset(asset);
    } else {
      // Create a minimal asset reference so the source monitor has something
      state.setSourceAsset({
        id: subClip.masterClipAssetId,
        name: subClip.name,
        type: 'VIDEO',
        duration: subClip.outPoint,
        status: 'READY',
        tags: [],
        isFavorite: false,
      });
    }

    state.setInPoint(subClip.inPoint);
    state.setOutPoint(subClip.outPoint);
    state.setPlayhead(subClip.inPoint);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subsequence
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a subsequence from the timeline's current IN/OUT range.
   *
   * Extracts all track content within the specified time range from the
   * current sequence and stores it as a reusable subsequence in the
   * specified bin.
   *
   * @param inPoint  Start time in seconds.
   * @param outPoint End time in seconds.
   * @param binId    Target bin ID.
   * @param name     Optional display name.
   * @returns The newly created Subsequence.
   */
  createSubsequence(
    inPoint: number,
    outPoint: number,
    binId: string,
    name?: string,
  ): Subsequence {
    const state = useEditorStore.getState();
    const effectiveIn = Math.min(inPoint, outPoint);
    const effectiveOut = Math.max(inPoint, outPoint);

    // Extract clips that overlap the IN/OUT range from each track
    const tracks: { trackId: string; clips: any[] }[] = [];

    for (const track of state.tracks) {
      const overlappingClips: any[] = [];

      for (const clip of track.clips) {
        // Check if clip overlaps the range
        if (clip.endTime > effectiveIn && clip.startTime < effectiveOut) {
          // Compute the portion of the clip within the range
          const clipIn = Math.max(clip.startTime, effectiveIn);
          const clipOut = Math.min(clip.endTime, effectiveOut);
          const trimStartDelta = clipIn - clip.startTime;
          const trimEndDelta = clip.endTime - clipOut;

          overlappingClips.push({
            ...clip,
            // Shift start time relative to the subsequence origin
            startTime: clipIn - effectiveIn,
            endTime: clipOut - effectiveIn,
            trimStart: clip.trimStart + trimStartDelta,
            trimEnd: clip.trimEnd + trimEndDelta,
          });
        }
      }

      if (overlappingClips.length > 0) {
        tracks.push({ trackId: track.id, clips: overlappingClips });
      }
    }

    const subsequence: Subsequence = {
      id: genSubsequenceId(),
      name: name ?? `Subseq ${effectiveIn.toFixed(1)}s-${effectiveOut.toFixed(1)}s`,
      sourceSequenceId: state.timelineId ?? 'default',
      inPoint: effectiveIn,
      outPoint: effectiveOut,
      tracks,
      binId,
      createdAt: Date.now(),
    };

    this.subsequences.set(subsequence.id, subsequence);
    this.notify();
    return subsequence;
  }

  /**
   * Get a subsequence by ID.
   *
   * @param id Subsequence ID.
   * @returns The Subsequence, or null.
   */
  getSubsequence(id: string): Subsequence | null {
    return this.subsequences.get(id) ?? null;
  }

  /**
   * Get all subsequences.
   *
   * @returns Array of all Subsequence instances.
   */
  getAllSubsequences(): Subsequence[] {
    return Array.from(this.subsequences.values()).sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AutoSequence
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create an auto-assembled sequence from clips in a bin.
   *
   * AutoSequence is an Avid feature that takes a collection of clips from
   * a bin and places them sequentially on a new timeline, sorted by either
   * timecode (creation order / source timecode) or alphabetical name.
   *
   * This creates new tracks in the editor store with all specified assets
   * laid out end-to-end.
   *
   * @param assetIds Array of asset IDs to include.
   * @param binId    The bin these assets come from (for naming).
   * @param sortBy   Sort order: 'timecode' or 'name'.
   * @returns The auto-sequence ID (used as a track group identifier).
   */
  autoSequence(
    assetIds: string[],
    binId: string,
    sortBy: 'timecode' | 'name',
  ): string {
    const state = useEditorStore.getState();
    const allAssets = collectAllAssetsFromBins(state.bins);
    const bin = findBinById(state.bins, binId);

    // Resolve assets from IDs
    const assets: MediaAsset[] = [];
    for (const id of assetIds) {
      const asset = allAssets.find((a) => a.id === id);
      if (asset) assets.push(asset);
    }

    if (assets.length === 0) {
      console.warn('[SubClipEngine] No valid assets found for AutoSequence');
      return '';
    }

    // Sort assets
    const sorted = [...assets].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      // Sort by timecode: use duration as a proxy for source TC ordering
      // In a real implementation this would use embedded source timecode
      return (a.duration ?? 0) - (b.duration ?? 0);
    });

    const seqId = genAutoSeqId();
    const binName = bin?.name ?? 'Bin';

    // Separate video and audio assets
    const videoAssets = sorted.filter((a) => a.type === 'VIDEO' || a.type === 'IMAGE');
    const audioAssets = sorted.filter((a) => a.type === 'AUDIO');

    // Create video track with clips laid end-to-end
    if (videoAssets.length > 0) {
      let currentTime = 0;
      const videoClips: Clip[] = [];

      for (const asset of videoAssets) {
        const duration = asset.duration ?? 10; // default 10s if unknown
        videoClips.push(
          makeClip({
            id: `${seqId}-v-${asset.id}`,
            trackId: `${seqId}-V1`,
            name: asset.name,
            startTime: currentTime,
            endTime: currentTime + duration,
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: asset.id,
          }),
        );
        currentTime += duration;
      }

      const videoTrack: Track = {
        id: `${seqId}-V1`,
        name: `AutoSeq: ${binName} V1`,
        type: 'VIDEO',
        sortOrder: 0,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        clips: videoClips,
        color: '#5b6af5',
      };

      state.addTrack(videoTrack);
    }

    // Create audio track with clips laid end-to-end
    if (audioAssets.length > 0) {
      let currentTime = 0;
      const audioClips: Clip[] = [];

      for (const asset of audioAssets) {
        const duration = asset.duration ?? 10;
        audioClips.push(
          makeClip({
            id: `${seqId}-a-${asset.id}`,
            trackId: `${seqId}-A1`,
            name: asset.name,
            startTime: currentTime,
            endTime: currentTime + duration,
            trimStart: 0,
            trimEnd: 0,
            type: 'audio',
            assetId: asset.id,
          }),
        );
        currentTime += duration;
      }

      const audioTrack: Track = {
        id: `${seqId}-A1`,
        name: `AutoSeq: ${binName} A1`,
        type: 'AUDIO',
        sortOrder: 1,
        muted: false,
        locked: false,
        solo: false,
        volume: 1,
        clips: audioClips,
        color: '#e05b8e',
      };

      state.addTrack(audioTrack);
    }

    this.notify();
    return seqId;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  Subscribe
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to sub-clip / subsequence engine state changes.
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

  /**
   * Remove all sub-clips, subsequences, and clear listeners.
   * Primarily useful for tests and teardown.
   */
  dispose(): void {
    this.subClips.clear();
    this.subsequences.clear();
    this.listeners.clear();
  }
}

/** Singleton sub-clip engine instance. */
export const subClipEngine = new SubClipEngine();
