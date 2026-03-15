// =============================================================================
//  THE AVID — Segment Graph
//  Resolves the editor store's track/clip hierarchy into an ordered list of
//  frame-addressable media segments for the playback and render pipelines.
//  Immutable: rebuilt on every timeline edit (~<1ms for 1000 clips).
// =============================================================================

import type {
  Track,
  Clip,
  IntrinsicVideoProps,
  IntrinsicAudioProps,
  TimeRemapState,
  CompositeMode,
  SequenceSettings,
} from '../store/editor.store';
import { getClipSourceTime, getClipPlaybackSpeed } from './clipTiming';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Transition type between two segments. */
export type TransitionType =
  | 'cut'
  | 'dissolve'
  | 'dip-to-color'
  | 'wipe'
  | 'push'
  | 'slide';

/** Interpolation curve for a transition. */
export type TransitionCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** A transition overlap region between two segments on the same track. */
export interface TransitionRegion {
  /** Type of transition effect. */
  type: TransitionType;
  /** Interpolation curve. */
  curve: TransitionCurve;
  /** Start time on the timeline (seconds). */
  startTime: number;
  /** End time on the timeline (seconds). */
  endTime: number;
  /** ID of the outgoing (A-side) clip. */
  outgoingClipId: string;
  /** ID of the incoming (B-side) clip. */
  incomingClipId: string;
}

/** A contiguous video segment backed by a single media source. */
export interface VideoSegment {
  /** Unique segment ID (deterministic from clip ID + track ID). */
  id: string;
  /** Source clip ID in the editor store. */
  clipId: string;
  /** Source track ID. */
  trackId: string;
  /** Track sort order (for compositing stack). */
  trackSortOrder: number;
  /** Asset ID for the media source. */
  assetId: string;
  /** Timeline start time (seconds). */
  timelineStart: number;
  /** Timeline end time (seconds). */
  timelineEnd: number;
  /** Source media start time (seconds) — accounting for trim. */
  sourceStart: number;
  /** Source media end time (seconds) — accounting for trim. */
  sourceEnd: number;
  /** Playback speed at segment start (1.0 = normal, negative = reverse). */
  playbackSpeed: number;
  /** Time remap state (for variable-speed / freeze / reverse). */
  timeRemap: TimeRemapState;
  /** Intrinsic video transforms. */
  intrinsicVideo: IntrinsicVideoProps;
  /** Blend mode for compositing. */
  blendMode: CompositeMode;
  /** Effect clip IDs that apply to this segment. */
  effectIds: string[];
  /** Transition region at the head of this segment (incoming), if any. */
  transitionIn: TransitionRegion | null;
  /** Transition region at the tail (outgoing), if any. */
  transitionOut: TransitionRegion | null;
}

/** A contiguous audio segment backed by a single media source. */
export interface AudioSegment {
  /** Unique segment ID. */
  id: string;
  /** Source clip ID. */
  clipId: string;
  /** Source track ID. */
  trackId: string;
  /** Asset ID for the audio source. */
  assetId: string;
  /** Timeline start time (seconds). */
  timelineStart: number;
  /** Timeline end time (seconds). */
  timelineEnd: number;
  /** Source media start time (seconds). */
  sourceStart: number;
  /** Source media end time (seconds). */
  sourceEnd: number;
  /** Playback speed at segment start. */
  playbackSpeed: number;
  /** Time remap state. */
  timeRemap: TimeRemapState;
  /** Intrinsic audio properties (volume, pan). */
  intrinsicAudio: IntrinsicAudioProps;
  /** Track-level volume (dB). */
  trackVolume: number;
  /** Whether the track is soloed. */
  trackSolo: boolean;
  /** Transition region at the head, if any. */
  transitionIn: TransitionRegion | null;
  /** Transition region at the tail, if any. */
  transitionOut: TransitionRegion | null;
}

/** The resolved segment graph for a timeline. */
export interface SegmentGraphResult {
  /** All video segments sorted by timelineStart then trackSortOrder. */
  videoSegments: VideoSegment[];
  /** All audio segments sorted by timelineStart. */
  audioSegments: AudioSegment[];
  /** Total timeline duration in seconds. */
  duration: number;
  /** Sequence frame rate. */
  fps: number;
  /** Sequence resolution. */
  width: number;
  height: number;
  /** Set of all unique asset IDs referenced by segments. */
  referencedAssetIds: Set<string>;
  /** Total number of segments. */
  segmentCount: number;
}

// ─── Segment Graph ────────────────────────────────────────────────────────────

/**
 * Resolve a timeline (tracks + settings) into a flat, frame-addressable segment graph.
 *
 * The graph is immutable — call `resolve()` on any timeline edit to rebuild.
 * Performance: O(n) where n = total clips across all tracks.
 *
 * @param tracks           All timeline tracks from the editor store.
 * @param settings         Sequence settings (fps, resolution).
 * @param effectTrackMap   Optional map of effect track clips keyed by the clip they affect.
 * @returns A SegmentGraphResult with all segments resolved.
 */
export function resolveSegmentGraph(
  tracks: Track[],
  settings: SequenceSettings,
  effectTrackMap?: Map<string, string[]>,
): SegmentGraphResult {
  const videoSegments: VideoSegment[] = [];
  const audioSegments: AudioSegment[] = [];
  const referencedAssetIds = new Set<string>();
  let maxEndTime = 0;

  // Determine solo state across all tracks
  const hasSoloTrack = tracks.some((t) => t.solo);

  for (const track of tracks) {
    if (track.muted) continue;
    // If any track is soloed, skip non-soloed tracks
    if (hasSoloTrack && !track.solo) continue;

    const isVideoTrack = track.type === 'VIDEO' || track.type === 'GRAPHIC';
    const isAudioTrack = track.type === 'AUDIO';
    // VIDEO tracks can also produce audio segments if the clip is type 'video'
    const canProduceAudio = isVideoTrack || isAudioTrack;

    if (!isVideoTrack && !canProduceAudio) continue;

    // Sort clips by startTime for transition detection
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i]!;
      if (!clip.assetId) continue;

      referencedAssetIds.add(clip.assetId);
      if (clip.endTime > maxEndTime) maxEndTime = clip.endTime;

      // Detect transitions (overlapping consecutive clips on the same track)
      const prevClip = i > 0 ? sortedClips[i - 1] : null;
      const nextClip = i < sortedClips.length - 1 ? sortedClips[i + 1] : null;

      let transitionIn: TransitionRegion | null = null;
      let transitionOut: TransitionRegion | null = null;

      if (prevClip && prevClip.endTime > clip.startTime) {
        transitionIn = {
          type: 'dissolve',
          curve: 'linear',
          startTime: clip.startTime,
          endTime: prevClip.endTime,
          outgoingClipId: prevClip.id,
          incomingClipId: clip.id,
        };
      }

      if (nextClip && clip.endTime > nextClip.startTime) {
        transitionOut = {
          type: 'dissolve',
          curve: 'linear',
          startTime: nextClip.startTime,
          endTime: clip.endTime,
          outgoingClipId: clip.id,
          incomingClipId: nextClip.id,
        };
      }

      // Source time mapping
      const sourceStart = getClipSourceTime(clip, clip.startTime);
      const sourceEnd = getClipSourceTime(clip, clip.endTime);
      const playbackSpeed = getClipPlaybackSpeed(clip, clip.startTime);

      // Collect effect IDs
      const effectIds = effectTrackMap?.get(clip.id) ?? [];

      if (isVideoTrack) {
        videoSegments.push({
          id: `vseg:${track.id}:${clip.id}`,
          clipId: clip.id,
          trackId: track.id,
          trackSortOrder: track.sortOrder,
          assetId: clip.assetId,
          timelineStart: clip.startTime,
          timelineEnd: clip.endTime,
          sourceStart,
          sourceEnd,
          playbackSpeed,
          timeRemap: clip.timeRemap,
          intrinsicVideo: clip.intrinsicVideo,
          blendMode: clip.blendMode || track.blendMode || 'source-over',
          effectIds,
          transitionIn,
          transitionOut,
        });
      }

      // Audio segment (from audio tracks or video clips with audio)
      if (canProduceAudio && (isAudioTrack || clip.type === 'video' || clip.type === 'audio')) {
        audioSegments.push({
          id: `aseg:${track.id}:${clip.id}`,
          clipId: clip.id,
          trackId: track.id,
          assetId: clip.assetId,
          timelineStart: clip.startTime,
          timelineEnd: clip.endTime,
          sourceStart,
          sourceEnd,
          playbackSpeed,
          timeRemap: clip.timeRemap,
          intrinsicAudio: clip.intrinsicAudio,
          trackVolume: track.volume,
          trackSolo: track.solo,
          transitionIn,
          transitionOut,
        });
      }
    }
  }

  // Sort video segments: by timeline time, then by track sort order (bottom to top)
  videoSegments.sort((a, b) => {
    const timeDiff = a.timelineStart - b.timelineStart;
    if (Math.abs(timeDiff) > 1e-9) return timeDiff;
    return a.trackSortOrder - b.trackSortOrder;
  });

  // Sort audio segments by timeline time
  audioSegments.sort((a, b) => a.timelineStart - b.timelineStart);

  return {
    videoSegments,
    audioSegments,
    duration: maxEndTime,
    fps: settings.fps,
    width: settings.width,
    height: settings.height,
    referencedAssetIds,
    segmentCount: videoSegments.length + audioSegments.length,
  };
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Get all video segments active at a given timeline time, sorted by track sort order
 * (lowest first = bottom of compositing stack).
 */
export function getActiveVideoSegments(
  graph: SegmentGraphResult,
  timelineTime: number,
): VideoSegment[] {
  return graph.videoSegments.filter(
    (seg) => timelineTime >= seg.timelineStart && timelineTime < seg.timelineEnd,
  );
}

/**
 * Get all audio segments active at a given timeline time.
 */
export function getActiveAudioSegments(
  graph: SegmentGraphResult,
  timelineTime: number,
): AudioSegment[] {
  return graph.audioSegments.filter(
    (seg) => timelineTime >= seg.timelineStart && timelineTime < seg.timelineEnd,
  );
}

/**
 * Map a timeline time to the source time for a given segment,
 * accounting for time remapping and trim offsets.
 */
export function segmentSourceTime(
  segment: VideoSegment | AudioSegment,
  timelineTime: number,
): number {
  // Reconstruct a minimal Clip-like object for getClipSourceTime
  const clip = {
    startTime: segment.timelineStart,
    endTime: segment.timelineEnd,
    trimStart: segment.sourceStart,
    trimEnd: segment.sourceEnd,
    timeRemap: segment.timeRemap,
  } as Parameters<typeof getClipSourceTime>[0];

  return getClipSourceTime(clip, timelineTime);
}

/**
 * Get the frame number for a given timeline time.
 */
export function timeToFrame(timelineTime: number, fps: number): number {
  return Math.floor(timelineTime * fps);
}

/**
 * Get the timeline time for a given frame number.
 */
export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

/**
 * Get the total frame count for a segment graph.
 */
export function totalFrames(graph: SegmentGraphResult): number {
  return Math.ceil(graph.duration * graph.fps);
}
