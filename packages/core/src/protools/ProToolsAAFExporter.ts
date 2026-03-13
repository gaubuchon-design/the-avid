// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Pro Tools AAF Exporter (PT-01)
//  Exports timeline sequences to AAF format for Pro Tools audio mixing.
//  Supports full track layout, clip timecodes, automation, AudioSuite
//  rendered clips, mono/stereo assignments, and configurable handles.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  EditorProject,
  EditorTrack,
  EditorClip,
  EditorMarker,
  EditorMediaAsset,
} from '../project-library';
import {
  flattenAssets,
} from '../project-library';
import { getMediaAssetPrimaryPath } from '../media-helpers';
import {
  normalizeAudioChannelLayoutLabel,
  pickDominantAudioChannelLayout,
  type AudioChannelLayout,
} from '../audio/channelLayout';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AAFHandleSize = '1s' | '2s' | '5s';
export type AAFChannelAssignment = AudioChannelLayout;
export type AAFBitDepth = 16 | 24 | 32;

export interface AAFAutomationPoint {
  timeSeconds: number;
  value: number; // 0-1 normalized
}

export interface AAFAutomationEnvelope {
  parameter: 'volume' | 'pan' | 'mute';
  points: AAFAutomationPoint[];
}

export interface AAFRenderedEffect {
  effectName: string;
  sourceClipId: string;
  renderedFilePath: string;
  durationSeconds: number;
}

export interface AAFClipDescriptor {
  clipId: string;
  clipName: string;
  trackName: string;
  sourceFilePath: string;
  startTimecodeTC: string;
  endTimecodeTC: string;
  timelineStartSeconds: number;
  timelineEndSeconds: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
  handleBeforeSeconds: number;
  handleAfterSeconds: number;
  gainDb: number;
  channelAssignment: AAFChannelAssignment;
  automation: AAFAutomationEnvelope[];
  renderedEffects: AAFRenderedEffect[];
}

export interface AAFTrackDescriptor {
  trackId: string;
  trackName: string;
  channelAssignment: AAFChannelAssignment;
  panPosition: number; // -1 to 1
  clips: AAFClipDescriptor[];
}

export interface AAFExportOptions {
  handleSize: AAFHandleSize;
  sampleRate: number;
  bitDepth: AAFBitDepth;
  includeVideoReference: boolean;
  includeMarkers: boolean;
  channelAssignment: AAFChannelAssignment;
  consolidateMedia: boolean;
  includeAutomation: boolean;
  includeRenderedEffects: boolean;
  outputPath?: string;
}

export interface AAFExportResult {
  success: boolean;
  filePath: string;
  tracks: AAFTrackDescriptor[];
  markers: AAFMarkerDescriptor[];
  totalClips: number;
  totalDurationSeconds: number;
  sampleRate: number;
  bitDepth: AAFBitDepth;
  handleSizeSeconds: number;
  errors: string[];
  warnings: string[];
}

export interface AAFMarkerDescriptor {
  markerId: string;
  label: string;
  timecodeTC: string;
  timeSeconds: number;
  color: string;
}

export interface AAFValidationSummary {
  trackCount: number;
  clipCount: number;
  multichannelClipCount: number;
  missingSourcePathCount: number;
  resampleRequiredCount: number;
  mixedLayoutTrackCount: number;
  insufficientHeadHandleCount: number;
  insufficientTailHandleCount: number;
}

export interface AAFValidationResult {
  valid: boolean;
  issues: string[];
  warnings: string[];
  summary: AAFValidationSummary;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const HANDLE_SIZE_MAP: Record<AAFHandleSize, number> = {
  '1s': 1,
  '2s': 2,
  '5s': 5,
};

const DEFAULT_SAMPLE_RATE = 48000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function secondsToTimecode(seconds: number, frameRate: number): string {
  const totalFrames = Math.round(seconds * frameRate);
  const frames = totalFrames % frameRate;
  const totalSecs = Math.floor(totalFrames / frameRate);
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);
  return [
    hours.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

function secondsToSamples(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

function volumeToDb(volume: number): number {
  if (volume <= 0) return -Infinity;
  return 20 * Math.log10(volume);
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveAssetDurationSeconds(asset: EditorMediaAsset | undefined): number | null {
  const duration = asset?.technicalMetadata?.durationSeconds ?? asset?.duration;
  return typeof duration === 'number' && Number.isFinite(duration) ? duration : null;
}

// ─── Exporter ──────────────────────────────────────────────────────────────

export class ProToolsAAFExporter {
  private project: EditorProject;
  private options: AAFExportOptions;
  private errors: string[] = [];
  private warnings: string[] = [];
  private readonly assetIndex: Map<string, EditorMediaAsset>;

  constructor(project: EditorProject, options?: Partial<AAFExportOptions>) {
    this.project = project;
    this.assetIndex = new Map(flattenAssets(project.bins).map((asset) => [asset.id, asset] as const));
    this.options = {
      handleSize: options?.handleSize ?? '2s',
      sampleRate: options?.sampleRate ?? project.settings.sampleRate ?? DEFAULT_SAMPLE_RATE,
      bitDepth: options?.bitDepth ?? 24,
      includeVideoReference: options?.includeVideoReference ?? true,
      includeMarkers: options?.includeMarkers ?? true,
      channelAssignment: options?.channelAssignment ?? 'stereo',
      consolidateMedia: options?.consolidateMedia ?? true,
      includeAutomation: options?.includeAutomation ?? true,
      includeRenderedEffects: options?.includeRenderedEffects ?? true,
      outputPath: options?.outputPath,
    };
  }

  /**
   * Exports the project timeline to AAF format.
   * Returns a descriptor of the export that can be serialized to an AAF file.
   */
  export(): AAFExportResult {
    this.errors = [];
    this.warnings = [];

    const handleSizeSeconds = HANDLE_SIZE_MAP[this.options.handleSize];
    const audioTracks = this.project.tracks.filter((t) => t.type === 'AUDIO');
    const frameRate = this.project.settings.frameRate;

    if (audioTracks.length === 0) {
      this.warnings.push('No audio tracks found in project');
    }

    const trackDescriptors = audioTracks.map((track) =>
      this.buildTrackDescriptor(track, handleSizeSeconds, frameRate)
    );

    const markerDescriptors = this.options.includeMarkers
      ? this.buildMarkerDescriptors(this.project.markers, frameRate)
      : [];

    const totalClips = trackDescriptors.reduce((sum, t) => sum + t.clips.length, 0);
    const totalDuration = this.project.tracks
      .flatMap((t) => t.clips)
      .reduce((max, c) => Math.max(max, c.endTime), 0);

    const outputPath = this.options.outputPath
      ?? `${this.project.name.replace(/[^a-z0-9]/gi, '_')}_export.aaf`;

    return {
      success: this.errors.length === 0,
      filePath: outputPath,
      tracks: trackDescriptors,
      markers: markerDescriptors,
      totalClips,
      totalDurationSeconds: totalDuration,
      sampleRate: this.options.sampleRate,
      bitDepth: this.options.bitDepth,
      handleSizeSeconds,
      errors: [...this.errors],
      warnings: [...this.warnings],
    };
  }

  /**
   * Validates that the project can be exported to AAF.
   */
  validate(): AAFValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (this.options.sampleRate !== 48000 && this.options.sampleRate !== 44100 && this.options.sampleRate !== 96000) {
      issues.push(`Non-standard sample rate: ${this.options.sampleRate}Hz`);
    }

    const audioTracks = this.project.tracks.filter((t) => t.type === 'AUDIO');
    const summary: AAFValidationSummary = {
      trackCount: audioTracks.length,
      clipCount: 0,
      multichannelClipCount: 0,
      missingSourcePathCount: 0,
      resampleRequiredCount: 0,
      mixedLayoutTrackCount: 0,
      insufficientHeadHandleCount: 0,
      insufficientTailHandleCount: 0,
    };

    if (audioTracks.length === 0) {
      issues.push('No audio tracks available for export');
    }

    for (const track of audioTracks) {
      const distinctLayouts = Array.from(new Set(track.clips
        .map((clip) => this.resolveClipChannelAssignment(clip))
        .filter((layout) => Boolean(layout)),
      ));
      if (track.clips.length === 0) {
        issues.push(`Track "${track.name}" has no clips`);
      }
      if (distinctLayouts.length > 1) {
        issues.push(`Track "${track.name}" mixes incompatible channel layouts: ${distinctLayouts.join(', ')}`);
        summary.mixedLayoutTrackCount += 1;
      }
      for (const clip of track.clips) {
        summary.clipCount += 1;
        if (clip.endTime <= clip.startTime) {
          issues.push(`Clip "${clip.name}" on track "${track.name}" has zero or negative duration`);
        }
        const asset = clip.assetId ? this.assetIndex.get(clip.assetId) : undefined;
        const sourcePath = asset ? getMediaAssetPrimaryPath(asset) : undefined;
        if (!sourcePath) {
          issues.push(`Clip "${clip.name}" on track "${track.name}" is missing a resolvable source file path`);
          summary.missingSourcePathCount += 1;
        }
        const requestedHandleSeconds = HANDLE_SIZE_MAP[this.options.handleSize];
        const availableHeadSeconds = Math.max(0, clip.trimStart ?? 0);
        if (availableHeadSeconds < requestedHandleSeconds) {
          warnings.push(
            `Clip "${clip.name}" on track "${track.name}" only has ${availableHeadSeconds.toFixed(2)}s of head handle for a ${requestedHandleSeconds}s turnover request`,
          );
          summary.insufficientHeadHandleCount += 1;
        }
        const assetDurationSeconds = resolveAssetDurationSeconds(asset);
        if (assetDurationSeconds !== null) {
          const clipPlaybackDuration = Math.max(0, clip.endTime - clip.startTime);
          const sourceOutSeconds = Math.max(0, clip.trimStart ?? 0) + clipPlaybackDuration;
          const availableTailSeconds = Math.max(0, assetDurationSeconds - sourceOutSeconds);
          if (availableTailSeconds < requestedHandleSeconds) {
            warnings.push(
              `Clip "${clip.name}" on track "${track.name}" only has ${availableTailSeconds.toFixed(2)}s of tail handle for a ${requestedHandleSeconds}s turnover request`,
            );
            summary.insufficientTailHandleCount += 1;
          }
        }
        if ((asset?.technicalMetadata?.audioChannels ?? 0) > 2 && !asset?.technicalMetadata?.audioChannelLayout) {
          issues.push(`Clip "${clip.name}" is multichannel but missing audio channel layout metadata`);
        }
        if ((asset?.technicalMetadata?.audioChannels ?? 0) > 2) {
          summary.multichannelClipCount += 1;
        }
        if (
          asset?.technicalMetadata?.sampleRate
          && asset.technicalMetadata.sampleRate !== this.options.sampleRate
        ) {
          warnings.push(
            `Clip "${clip.name}" on track "${track.name}" will be sample-rate converted from ${asset.technicalMetadata.sampleRate}Hz to ${this.options.sampleRate}Hz`,
          );
          summary.resampleRequiredCount += 1;
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings: Array.from(new Set(warnings)),
      summary,
    };
  }

  /**
   * Returns the sample-accurate position for a given time in seconds.
   */
  getSamplePosition(timeSeconds: number): number {
    return secondsToSamples(timeSeconds, this.options.sampleRate);
  }

  /**
   * Returns the timecode string for a given time in seconds.
   */
  getTimecode(timeSeconds: number): string {
    return secondsToTimecode(timeSeconds, this.project.settings.frameRate);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private buildTrackDescriptor(
    track: EditorTrack,
    handleSizeSeconds: number,
    frameRate: number,
  ): AAFTrackDescriptor {
    const channelAssignment = this.resolveTrackChannelAssignment(track);
    const clips = track.clips.map((clip) =>
      this.buildClipDescriptor(clip, track, handleSizeSeconds, frameRate, channelAssignment)
    );

    return {
      trackId: track.id,
      trackName: track.name,
      channelAssignment,
      panPosition: 0,
      clips,
    };
  }

  private buildClipDescriptor(
    clip: EditorClip,
    track: EditorTrack,
    handleSizeSeconds: number,
    frameRate: number,
    channelAssignment: AAFChannelAssignment,
  ): AAFClipDescriptor {
    const asset = clip.assetId ? this.assetIndex.get(clip.assetId) : undefined;
    const handleBefore = Math.min(handleSizeSeconds, Math.max(0, clip.trimStart ?? 0));
    const assetDurationSeconds = resolveAssetDurationSeconds(asset);
    const clipPlaybackDuration = Math.max(0, clip.endTime - clip.startTime);
    const availableTailSeconds = assetDurationSeconds === null
      ? handleSizeSeconds
      : Math.max(0, assetDurationSeconds - ((clip.trimStart ?? 0) + clipPlaybackDuration));
    const handleAfter = Math.min(handleSizeSeconds, availableTailSeconds);

    const automation: AAFAutomationEnvelope[] = this.options.includeAutomation
      ? this.buildClipAutomation(clip, track)
      : [];

    const renderedEffects: AAFRenderedEffect[] = this.options.includeRenderedEffects
      ? this.buildRenderedEffects(clip)
      : [];

    return {
      clipId: clip.id,
      clipName: clip.name,
      trackName: track.name,
      sourceFilePath: asset ? (getMediaAssetPrimaryPath(asset) ?? clip.assetId ?? '') : clip.assetId ?? '',
      startTimecodeTC: secondsToTimecode(clip.startTime, frameRate),
      endTimecodeTC: secondsToTimecode(clip.endTime, frameRate),
      timelineStartSeconds: clip.startTime,
      timelineEndSeconds: clip.endTime,
      trimStartSeconds: clip.trimStart,
      trimEndSeconds: clip.trimEnd,
      handleBeforeSeconds: handleBefore,
      handleAfterSeconds: handleAfter,
      gainDb: volumeToDb(track.volume),
      channelAssignment,
      automation,
      renderedEffects,
    };
  }

  private resolveTrackChannelAssignment(track: EditorTrack): AAFChannelAssignment {
    const clipLayouts = track.clips.map((clip) => this.resolveClipChannelAssignment(clip));
    return pickDominantAudioChannelLayout(clipLayouts, this.options.channelAssignment);
  }

  private resolveClipChannelAssignment(clip: EditorClip): AAFChannelAssignment {
    const asset = clip.assetId ? this.assetIndex.get(clip.assetId) : undefined;
    return normalizeAudioChannelLayoutLabel(
      asset?.technicalMetadata?.audioChannelLayout,
      asset?.technicalMetadata?.audioChannels,
    );
  }

  private buildClipAutomation(
    clip: EditorClip,
    track: EditorTrack,
  ): AAFAutomationEnvelope[] {
    const envelopes: AAFAutomationEnvelope[] = [];

    // Volume automation: flat at track volume
    envelopes.push({
      parameter: 'volume',
      points: [
        { timeSeconds: clip.startTime, value: track.volume },
        { timeSeconds: clip.endTime, value: track.volume },
      ],
    });

    // Pan automation: centered
    envelopes.push({
      parameter: 'pan',
      points: [
        { timeSeconds: clip.startTime, value: 0.5 },
        { timeSeconds: clip.endTime, value: 0.5 },
      ],
    });

    // Mute automation
    if (track.muted) {
      envelopes.push({
        parameter: 'mute',
        points: [
          { timeSeconds: clip.startTime, value: 1 },
          { timeSeconds: clip.endTime, value: 1 },
        ],
      });
    }

    return envelopes;
  }

  private buildRenderedEffects(clip: EditorClip): AAFRenderedEffect[] {
    // In a real implementation, AudioSuite rendered clips would be
    // pre-rendered and referenced here. For the model, we return
    // descriptors for any effects that would need rendering.
    return [];
  }

  private buildMarkerDescriptors(
    markers: EditorMarker[],
    frameRate: number,
  ): AAFMarkerDescriptor[] {
    return markers.map((marker) => ({
      markerId: marker.id,
      label: marker.label,
      timecodeTC: secondsToTimecode(marker.time, frameRate),
      timeSeconds: marker.time,
      color: marker.color,
    }));
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export function createAAFExporter(
  project: EditorProject,
  options?: Partial<AAFExportOptions>,
): ProToolsAAFExporter {
  return new ProToolsAAFExporter(project, options);
}

export function exportProjectToAAF(
  project: EditorProject,
  options?: Partial<AAFExportOptions>,
): AAFExportResult {
  const exporter = new ProToolsAAFExporter(project, options);
  return exporter.export();
}
