// =============================================================================
//  THE AVID -- FT-01: AAF Bidirectional Export Engine
// =============================================================================
//
//  Generates valid AAF (Advanced Authoring Format) and OMF (Open Media
//  Framework) data from timeline state.  Also provides an import path for
//  re-linking an AAF/OMF back into the internal timeline model.
//
//  The export emits a structured AAF descriptor tree rather than raw binary;
//  a downstream encoder (server-side or via WASM) can serialise to the on-disk
//  format.  This keeps the core package environment-agnostic.
// =============================================================================

import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorMarker,
  EditorMediaAsset,
  EditorProjectSettings,
} from '../project-library';
import { flattenAssets } from '../project-library';
import { formatTimecode } from '../utils';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Supported interchange format. */
export type AAFExportFormat = 'aaf' | 'omf';

/** Timecode representation used in AAF. */
export interface AAFTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  dropFrame: boolean;
  frameRate: number;
}

/** An effect parameter entry inside an AAF clip. */
export interface AAFEffectParam {
  name: string;
  value: number | string | boolean;
  interpolation?: 'constant' | 'linear' | 'bezier';
}

/** A single clip descriptor in the AAF composition. */
export interface AAFClipDescriptor {
  uid: string;
  clipName: string;
  trackIndex: number;
  trackName: string;
  trackType: 'video' | 'audio';
  /** Start position on the timeline in frames. */
  timelineStartFrame: number;
  /** End position on the timeline in frames. */
  timelineEndFrame: number;
  /** Offset into source media in frames. */
  sourceStartFrame: number;
  /** Source duration in frames. */
  sourceDurationFrames: number;
  /** Reel / tape name for EDL compatibility. */
  reelName: string;
  /** Original media file reference. */
  sourceMediaRef: string;
  /** Speed ratio (1.0 = normal). */
  speedRatio: number;
  /** Sub-clip reference if this clip is a portion of a master clip. */
  masterClipRef?: string;
  /** Audio clip gain in dB. */
  audioClipGainDb?: number;
  /** Audio pan (-1.0 left .. +1.0 right). */
  audioPan?: number;
  /** Effect parameters baked into the clip. */
  effects: AAFEffectParam[];
  /** Source timecode start. */
  sourceTimecode?: AAFTimecode;
  /** Metadata key-value pairs. */
  metadata: Record<string, string>;
}

/** A marker inside the AAF composition. */
export interface AAFMarkerDescriptor {
  uid: string;
  label: string;
  color: string;
  positionFrame: number;
  comment?: string;
}

/** An audio track assignment entry. */
export interface AAFAudioTrackAssignment {
  trackIndex: number;
  trackName: string;
  channelCount: number;
  /** Physical audio output assignment (e.g. 'L', 'R', 'C', 'LFE'). */
  outputChannel: string;
}

/** Configuration options for AAF export. */
export interface AAFExportOptions {
  /** Export format: AAF or OMF. */
  format: AAFExportFormat;
  /** Include embedded media references (embedded vs linked). */
  embedMedia: boolean;
  /** Include markers in the export. */
  includeMarkers: boolean;
  /** Include effect parameters. */
  includeEffects: boolean;
  /** Include clip metadata. */
  includeMetadata: boolean;
  /** Frame rate override (uses project default otherwise). */
  frameRate?: number;
  /** Drop-frame timecode flag. */
  dropFrame?: boolean;
  /** Start timecode for the composition. */
  startTimecode?: AAFTimecode;
  /** Restrict export to specific track indices. */
  trackFilter?: number[];
  /** Audio track channel assignments. */
  audioTrackAssignments?: AAFAudioTrackAssignment[];
}

/** The complete AAF composition tree returned by the exporter. */
export interface AAFComposition {
  /** Format identifier. */
  format: AAFExportFormat;
  /** Composition name. */
  name: string;
  /** Project frame rate. */
  frameRate: number;
  /** Whether timecodes use drop-frame notation. */
  dropFrame: boolean;
  /** Overall composition start timecode. */
  startTimecode: AAFTimecode;
  /** Duration of the composition in frames. */
  durationFrames: number;
  /** Resolution. */
  resolution: { width: number; height: number };
  /** Audio sample rate. */
  sampleRate: number;
  /** All clip descriptors. */
  clips: AAFClipDescriptor[];
  /** Marker descriptors. */
  markers: AAFMarkerDescriptor[];
  /** Audio track assignments. */
  audioTrackAssignments: AAFAudioTrackAssignment[];
  /** Creation timestamp. */
  createdAt: string;
  /** Metadata about the export. */
  exportMetadata: Record<string, string>;
}

/** Errors that can occur during AAF export or import. */
export class AAFExportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_PROJECT'
      | 'NO_TRACKS'
      | 'UNSUPPORTED_FORMAT'
      | 'IMPORT_PARSE_ERROR'
      | 'ASSET_NOT_FOUND'
      | 'TIMECODE_ERROR',
  ) {
    super(message);
    this.name = 'AAFExportError';
  }
}

// ─── Default options ────────────────────────────────────────────────────────

const DEFAULT_EXPORT_OPTIONS: AAFExportOptions = {
  format: 'aaf',
  embedMedia: false,
  includeMarkers: true,
  includeEffects: true,
  includeMetadata: true,
  dropFrame: false,
};

// ─── Helper: seconds to frames ──────────────────────────────────────────────

function secondsToFrames(seconds: number, frameRate: number): number {
  return Math.round(seconds * frameRate);
}

function framesToTimecode(totalFrames: number, frameRate: number, dropFrame: boolean): AAFTimecode {
  let frames = totalFrames;

  if (dropFrame && (frameRate === 29.97 || frameRate === 30)) {
    // Drop-frame calculation for 29.97 / 30fps
    const dropFramesPerMinute = 2;
    const framesPerMinute = Math.round(frameRate * 60) - dropFramesPerMinute;
    const framesPerTenMinutes = Math.round(frameRate * 60 * 10);

    const tenMinuteBlocks = Math.floor(frames / framesPerTenMinutes);
    const remainingFrames = frames % framesPerTenMinutes;

    // Adjust for dropped frames
    frames += dropFramesPerMinute * (tenMinuteBlocks * 9 + Math.max(0, Math.floor((remainingFrames - dropFramesPerMinute) / framesPerMinute)));
  }

  const effectiveRate = Math.round(frameRate);
  const f = frames % effectiveRate;
  const totalSeconds = Math.floor(frames / effectiveRate);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  return { hours: h, minutes: m, seconds: s, frames: f, dropFrame, frameRate };
}

function timecodeToString(tc: AAFTimecode): string {
  const sep = tc.dropFrame ? ';' : ':';
  return [
    String(tc.hours).padStart(2, '0'),
    String(tc.minutes).padStart(2, '0'),
    String(tc.seconds).padStart(2, '0'),
  ].join(':') + sep + String(tc.frames).padStart(2, '0');
}

function timecodeToFrames(tc: AAFTimecode): number {
  const rate = Math.round(tc.frameRate);
  return tc.hours * 3600 * rate + tc.minutes * 60 * rate + tc.seconds * rate + tc.frames;
}

// ─── AAFExporter class ──────────────────────────────────────────────────────

/**
 * Generates AAF/OMF composition descriptors from editor project state.
 *
 * Usage:
 * ```ts
 * const exporter = new AAFExporter(project);
 * const composition = exporter.export({ format: 'aaf', includeMarkers: true });
 * const serialised = exporter.serialise(composition);
 * ```
 */
export class AAFExporter {
  private project: EditorProject;
  private assetMap: Map<string, EditorMediaAsset>;

  constructor(project: EditorProject) {
    if (!project || !project.id) {
      throw new AAFExportError('A valid project is required', 'INVALID_PROJECT');
    }
    this.project = project;
    this.assetMap = new Map();
    for (const asset of flattenAssets(project.bins)) {
      this.assetMap.set(asset.id, asset);
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────

  /**
   * Export the project as an AAF/OMF composition descriptor.
   */
  export(options: Partial<AAFExportOptions> = {}): AAFComposition {
    const opts: AAFExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    const frameRate = opts.frameRate ?? this.project.settings.frameRate;
    const dropFrame = opts.dropFrame ?? false;

    const tracks = this.getFilteredTracks(opts.trackFilter);
    if (tracks.length === 0) {
      throw new AAFExportError('No tracks available for export', 'NO_TRACKS');
    }

    const clips = this.buildClipDescriptors(tracks, frameRate, dropFrame, opts);
    const markers = opts.includeMarkers ? this.buildMarkerDescriptors(frameRate, dropFrame) : [];
    const audioAssignments = opts.audioTrackAssignments ?? this.buildDefaultAudioAssignments(tracks);

    const maxFrame = clips.reduce((max, c) => Math.max(max, c.timelineEndFrame), 0);
    const startTC = opts.startTimecode ?? framesToTimecode(0, frameRate, dropFrame);

    return {
      format: opts.format,
      name: this.project.name,
      frameRate,
      dropFrame,
      startTimecode: startTC,
      durationFrames: maxFrame,
      resolution: { width: this.project.settings.width, height: this.project.settings.height },
      sampleRate: this.project.settings.sampleRate,
      clips,
      markers,
      audioTrackAssignments: audioAssignments,
      createdAt: new Date().toISOString(),
      exportMetadata: {
        exporterVersion: '1.0.0',
        sourceProjectId: this.project.id,
        sourceProjectName: this.project.name,
        format: opts.format.toUpperCase(),
      },
    };
  }

  /**
   * Serialise a composition to a string representation.
   * In production this would produce binary AAF/OMF; here we produce
   * a human-readable descriptor for downstream encoding.
   */
  serialise(composition: AAFComposition): string {
    return JSON.stringify(composition, null, 2);
  }

  /**
   * Export to OMF format (convenience wrapper).
   */
  exportAsOMF(options: Partial<AAFExportOptions> = {}): AAFComposition {
    return this.export({ ...options, format: 'omf' });
  }

  // ── Import (re-link) ────────────────────────────────────────────────────

  /**
   * Parse an AAF composition back into partial project data that can be
   * merged into an existing project via `hydrateProject`.
   */
  static importFromComposition(composition: AAFComposition): {
    tracks: EditorTrack[];
    markers: EditorMarker[];
    settings: Partial<EditorProjectSettings>;
  } {
    try {
      const frameRate = composition.frameRate;
      const trackMap = new Map<number, { name: string; type: 'VIDEO' | 'AUDIO'; clips: EditorClip[] }>();

      for (const clipDesc of composition.clips) {
        if (!trackMap.has(clipDesc.trackIndex)) {
          trackMap.set(clipDesc.trackIndex, {
            name: clipDesc.trackName,
            type: clipDesc.trackType === 'audio' ? 'AUDIO' : 'VIDEO',
            clips: [],
          });
        }

        const track = trackMap.get(clipDesc.trackIndex)!;
        const startSeconds = clipDesc.timelineStartFrame / frameRate;
        const endSeconds = clipDesc.timelineEndFrame / frameRate;
        const trimStart = clipDesc.sourceStartFrame / frameRate;
        const trimEnd = 0;

        track.clips.push({
          id: clipDesc.uid,
          trackId: '', // Will be assigned during hydration
          name: clipDesc.clipName,
          startTime: startSeconds,
          endTime: endSeconds,
          trimStart,
          trimEnd,
          type: clipDesc.trackType === 'audio' ? 'audio' : 'video',
          assetId: clipDesc.sourceMediaRef || undefined,
        });
      }

      const tracks: EditorTrack[] = [];
      let sortOrder = 0;
      for (const [, trackData] of trackMap) {
        const trackId = `track-imported-${sortOrder}`;
        const clips = trackData.clips.map((c) => ({ ...c, trackId }));
        tracks.push({
          id: trackId,
          name: trackData.name,
          type: trackData.type,
          sortOrder: sortOrder++,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          clips,
          color: trackData.type === 'AUDIO' ? '#2bb672' : '#5b6af5',
        });
      }

      const markers: EditorMarker[] = composition.markers.map((m) => ({
        id: m.uid,
        time: m.positionFrame / frameRate,
        label: m.label,
        color: m.color,
      }));

      return {
        tracks,
        markers,
        settings: {
          frameRate,
          width: composition.resolution.width,
          height: composition.resolution.height,
          sampleRate: composition.sampleRate,
        },
      };
    } catch (err) {
      throw new AAFExportError(
        `Failed to parse AAF composition: ${err instanceof Error ? err.message : String(err)}`,
        'IMPORT_PARSE_ERROR',
      );
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private getFilteredTracks(filter?: number[]): EditorTrack[] {
    const sorted = [...this.project.tracks].sort((a, b) => a.sortOrder - b.sortOrder);
    if (!filter || filter.length === 0) return sorted;
    return sorted.filter((_, i) => filter.includes(i));
  }

  private buildClipDescriptors(
    tracks: EditorTrack[],
    frameRate: number,
    dropFrame: boolean,
    opts: AAFExportOptions,
  ): AAFClipDescriptor[] {
    const descriptors: AAFClipDescriptor[] = [];

    for (let trackIdx = 0; trackIdx < tracks.length; trackIdx++) {
      const track = tracks[trackIdx];
      const isAudio = track!.type === 'AUDIO';

      for (const clip of track!.clips) {
        const asset = clip.assetId ? this.assetMap.get(clip.assetId) : undefined;
        const reelName = asset?.technicalMetadata?.reelName ?? asset?.relinkIdentity?.reelName ?? 'AX';
        const sourceTC = asset?.technicalMetadata?.timecodeStart;
        const sourceStartFrame = secondsToFrames(clip.trimStart, frameRate);

        const effects: AAFEffectParam[] = [];
        if (opts.includeEffects && asset) {
          // Volume as an effect parameter for audio clips
          if (isAudio) {
            effects.push({
              name: 'AudioClipGain',
              value: track!.volume,
              interpolation: 'constant',
            });
          }
        }

        const metadata: Record<string, string> = {};
        if (opts.includeMetadata && asset) {
          metadata['originalFileName'] = asset.name;
          if (asset.technicalMetadata?.videoCodec) metadata['videoCodec'] = asset.technicalMetadata.videoCodec;
          if (asset.technicalMetadata?.audioCodec) metadata['audioCodec'] = asset.technicalMetadata.audioCodec;
          if (asset.duration) metadata['sourceDuration'] = String(asset.duration);
          if (asset.tags?.length) metadata['tags'] = asset.tags.join(',');
        }

        const descriptor: AAFClipDescriptor = {
          uid: clip.id,
          clipName: clip.name,
          trackIndex: trackIdx,
          trackName: track!.name,
          trackType: isAudio ? 'audio' : 'video',
          timelineStartFrame: secondsToFrames(clip.startTime, frameRate),
          timelineEndFrame: secondsToFrames(clip.endTime, frameRate),
          sourceStartFrame,
          sourceDurationFrames: secondsToFrames(clip.endTime - clip.startTime, frameRate),
          reelName,
          sourceMediaRef: clip.assetId ?? '',
          speedRatio: 1.0,
          audioClipGainDb: isAudio ? this.volumeToDb(track!.volume) : undefined,
          audioPan: isAudio ? 0 : undefined,
          effects,
          sourceTimecode: sourceTC
            ? this.parseTimecodeString(sourceTC, frameRate, dropFrame)
            : undefined,
          metadata,
        };

        descriptors.push(descriptor);
      }
    }

    return descriptors;
  }

  private buildMarkerDescriptors(frameRate: number, dropFrame: boolean): AAFMarkerDescriptor[] {
    return this.project.markers.map((marker) => ({
      uid: marker.id,
      label: marker.label,
      color: marker.color,
      positionFrame: secondsToFrames(marker.time, frameRate),
    }));
  }

  private buildDefaultAudioAssignments(tracks: EditorTrack[]): AAFAudioTrackAssignment[] {
    const audioTracks = tracks.filter((t) => t.type === 'AUDIO');
    const channelLabels = ['L', 'R', 'C', 'LFE', 'Ls', 'Rs', 'Lb', 'Rb'];

    return audioTracks.map((track, idx) => ({
      trackIndex: tracks.indexOf(track),
      trackName: track.name,
      channelCount: 1,
      outputChannel: channelLabels[idx % channelLabels.length]!,
    }));
  }

  private volumeToDb(volume: number): number {
    if (volume <= 0) return -Infinity;
    return 20 * Math.log10(volume);
  }

  private parseTimecodeString(tc: string, frameRate: number, dropFrame: boolean): AAFTimecode | undefined {
    // Supports HH:MM:SS:FF or HH:MM:SS;FF (drop-frame)
    const match = tc.match(/^(\d{2}):(\d{2}):(\d{2})[:;](\d{2})$/);
    if (!match) return undefined;

    return {
      hours: parseInt(match[1]!, 10),
      minutes: parseInt(match[2]!, 10),
      seconds: parseInt(match[3]!, 10),
      frames: parseInt(match[4]!, 10),
      dropFrame: tc.includes(';') || dropFrame,
      frameRate,
    };
  }
}

// ─── Re-export helpers ──────────────────────────────────────────────────────

export { secondsToFrames, framesToTimecode, timecodeToString, timecodeToFrames };
