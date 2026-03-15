import { buildPlaybackSnapshot, type PlaybackSnapshot } from '../engine/PlaybackSnapshot';
import type {
  ProjectSettings,
  SequenceSettings,
  SubtitleTrack,
  TitleClipData,
  Track,
} from '../store/editor.store';

export type ExportSelectionMode = 'full' | 'inout' | 'selected';

export interface ExportSelectionSource {
  tracks: Track[];
  subtitleTracks: SubtitleTrack[];
  titleClips: TitleClipData[];
  selectedClipIds: string[];
  inPoint: number | null;
  outPoint: number | null;
  playheadTime: number;
  duration: number;
  showSafeZones: boolean;
  sequenceSettings: Pick<SequenceSettings, 'fps' | 'width' | 'height'>;
  projectSettings?: Pick<ProjectSettings, 'frameRate' | 'width' | 'height'> | null;
}

export interface ExportSelectionSummary {
  mode: ExportSelectionMode;
  label: string;
  valid: boolean;
  issue: string | null;
  inPoint: number;
  outPoint: number;
  duration: number;
  frameCount: number;
  selectedClipCount: number;
  previewTime: number;
}

function getSequenceDuration(source: ExportSelectionSource): number {
  const trackEnd = source.tracks.reduce((maxTrackEnd, track) => {
    const clipEnd = track.clips.reduce((maxClipEnd, clip) => Math.max(maxClipEnd, clip.endTime), 0);
    return Math.max(maxTrackEnd, clipEnd);
  }, 0);

  return Math.max(source.duration, trackEnd);
}

function clampTime(value: number, duration: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(duration, value));
}

function buildSummary(
  source: ExportSelectionSource,
  mode: ExportSelectionMode,
  label: string,
  inPoint: number,
  outPoint: number,
  issue: string | null = null,
  selectedClipCount: number = 0,
): ExportSelectionSummary {
  const duration = getSequenceDuration(source);
  const safeIn = clampTime(inPoint, duration);
  const safeOut = clampTime(outPoint, duration);
  const fps = source.sequenceSettings.fps || source.projectSettings?.frameRate || 24;
  const selectionDuration = Math.max(0, safeOut - safeIn);
  const valid = !issue && selectionDuration > 0;

  return {
    mode,
    label,
    valid,
    issue: valid ? null : issue ?? 'Selection is empty.',
    inPoint: valid ? safeIn : 0,
    outPoint: valid ? safeOut : 0,
    duration: valid ? selectionDuration : 0,
    frameCount: valid ? Math.max(1, Math.round(selectionDuration * fps)) : 0,
    selectedClipCount,
    previewTime: valid ? safeIn : clampTime(source.playheadTime, duration),
  };
}

export function buildExportSelectionSummary(
  source: ExportSelectionSource,
  mode: ExportSelectionMode,
): ExportSelectionSummary {
  const duration = getSequenceDuration(source);

  switch (mode) {
    case 'full':
      if (duration <= 0) {
        return buildSummary(source, mode, 'Full Sequence', 0, 0, 'Sequence is empty.');
      }
      return buildSummary(source, mode, 'Full Sequence', 0, duration);
    case 'inout':
      if (source.inPoint === null || source.outPoint === null) {
        return buildSummary(source, mode, 'In/Out Range', 0, 0, 'Set both sequence In and Out points first.');
      }
      if (source.outPoint <= source.inPoint) {
        return buildSummary(source, mode, 'In/Out Range', 0, 0, 'Sequence Out must be after sequence In.');
      }
      return buildSummary(source, mode, 'In/Out Range', source.inPoint, source.outPoint);
    case 'selected': {
      const selectedClips = source.tracks.flatMap((track) =>
        track.clips.filter((clip) => source.selectedClipIds.includes(clip.id)),
      );

      if (selectedClips.length === 0) {
        return buildSummary(source, mode, 'Selected Clips', 0, 0, 'Select one or more timeline clips first.');
      }

      const inPoint = selectedClips.reduce((min, clip) => Math.min(min, clip.startTime), Number.POSITIVE_INFINITY);
      const outPoint = selectedClips.reduce((max, clip) => Math.max(max, clip.endTime), 0);

      return buildSummary(source, mode, 'Selected Clips', inPoint, outPoint, null, selectedClips.length);
    }
  }
}

export function buildExportPlaybackSnapshot(
  source: ExportSelectionSource,
  mode: ExportSelectionMode,
): PlaybackSnapshot {
  const summary = buildExportSelectionSummary(source, mode);

  return buildPlaybackSnapshot({
    tracks: source.tracks,
    subtitleTracks: source.subtitleTracks,
    titleClips: source.titleClips,
    playheadTime: summary.previewTime,
    duration: getSequenceDuration(source),
    isPlaying: false,
    showSafeZones: source.showSafeZones,
    activeMonitor: 'record',
    activeScope: null,
    sequenceSettings: source.sequenceSettings,
    projectSettings: source.projectSettings,
  }, 'export');
}
