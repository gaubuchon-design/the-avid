import type {
  Clip,
  ProjectSettings,
  SequenceSettings,
  SubtitleTrack,
  TitleClipData,
  Track,
} from '../store/editor.store';
import type { ScopeType } from '../store/player.store';

export type PlaybackConsumer = 'record-monitor' | 'program-monitor' | 'scope' | 'export';

export interface PlaybackVideoLayer {
  trackId: string;
  trackType: Track['type'];
  sortOrder: number;
  trackBlendMode?: Track['blendMode'];
  clip: Clip;
  assetId: string | null;
  sourceTime: number;
}

export interface PlaybackTitleLayer {
  trackId: string;
  clipId: string;
  titleId: string;
  frameOffset: number;
  titleClip: TitleClipData;
}

export interface PlaybackSubtitleCue {
  trackId: string;
  clipId: string;
  subtitleTrackId: string;
  cue: SubtitleTrack['cues'][number];
}

export interface PlaybackSnapshot {
  consumer: PlaybackConsumer;
  sequenceRevision: string;
  frameKey: string;
  playheadTime: number;
  frameNumber: number;
  duration: number;
  fps: number;
  aspectRatio: number;
  isPlaying: boolean;
  showSafeZones: boolean;
  activeMonitor: 'source' | 'record';
  activeScope: ScopeType | null;
  primaryVideoLayer: PlaybackVideoLayer | null;
  videoLayers: PlaybackVideoLayer[];
  titleLayers: PlaybackTitleLayer[];
  subtitleCues: PlaybackSubtitleCue[];
}

export interface PlaybackFrameSignatureSource {
  sequenceRevision: string;
  frameNumber: number;
  playheadTime: number;
}

export interface PlaybackSnapshotSource {
  tracks: Track[];
  subtitleTracks: SubtitleTrack[];
  titleClips: TitleClipData[];
  playheadTime: number;
  duration: number;
  isPlaying: boolean;
  showSafeZones: boolean;
  activeMonitor: 'source' | 'record';
  activeScope: ScopeType | null;
  sequenceSettings: Pick<SequenceSettings, 'fps' | 'width' | 'height'>;
  projectSettings?: Pick<ProjectSettings, 'frameRate' | 'width' | 'height'> | null;
}

function resolveFps(source: PlaybackSnapshotSource): number {
  return source.sequenceSettings.fps || source.projectSettings?.frameRate || 24;
}

function resolveAspectRatio(source: PlaybackSnapshotSource): number {
  const width = source.sequenceSettings.width || source.projectSettings?.width || 1920;
  const height = source.sequenceSettings.height || source.projectSettings?.height || 1080;
  return height > 0 ? width / height : 16 / 9;
}

function mapTimelineTimeToSourceTime(clip: Clip, playheadTime: number): number {
  return clip.trimStart + (playheadTime - clip.startTime);
}

function buildVideoLayers(source: PlaybackSnapshotSource): PlaybackVideoLayer[] {
  return source.tracks
    .filter((track) => (track.type === 'VIDEO' || track.type === 'GRAPHIC') && !track.muted)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((track) => {
      const clip = track.clips.find((candidate) => {
        return source.playheadTime >= candidate.startTime && source.playheadTime < candidate.endTime;
      });
      if (!clip) {
        return [];
      }

      return [{
        trackId: track.id,
        trackType: track.type,
        sortOrder: track.sortOrder,
        trackBlendMode: track.blendMode,
        clip,
        assetId: clip.assetId ?? null,
        sourceTime: mapTimelineTimeToSourceTime(clip, source.playheadTime),
      }];
    });
}

function buildTitleLayers(source: PlaybackSnapshotSource, fps: number): PlaybackTitleLayer[] {
  return source.tracks
    .filter((track) => track.type === 'GRAPHIC' && !track.muted)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((track) => {
      return track.clips.flatMap((clip) => {
        if (source.playheadTime < clip.startTime || source.playheadTime >= clip.endTime) {
          return [];
        }

        const titleClip = source.titleClips.find((candidate) => candidate.id === clip.assetId);
        if (!titleClip) {
          return [];
        }

        return [{
          trackId: track.id,
          clipId: clip.id,
          titleId: titleClip.id,
          frameOffset: Math.floor((source.playheadTime - clip.startTime) * fps),
          titleClip,
        }];
      });
    });
}

function buildSubtitleCues(source: PlaybackSnapshotSource): PlaybackSubtitleCue[] {
  return source.tracks
    .filter((track) => track.type === 'SUBTITLE' && !track.muted)
    .flatMap((track) => {
      return track.clips.flatMap((clip) => {
        if (source.playheadTime < clip.startTime || source.playheadTime >= clip.endTime) {
          return [];
        }

        return source.subtitleTracks.flatMap((subtitleTrack) => {
          return subtitleTrack.cues
            .filter((cue) => source.playheadTime >= cue.start && source.playheadTime < cue.end)
            .map((cue) => ({
              trackId: track.id,
              clipId: clip.id,
              subtitleTrackId: subtitleTrack.id,
              cue,
            }));
        });
      });
    });
}

export function buildPlaybackSequenceRevision(source: PlaybackSnapshotSource): string {
  return JSON.stringify({
    sequenceSettings: source.sequenceSettings,
    projectSettings: source.projectSettings ?? null,
    tracks: source.tracks.map((track) => ({
      id: track.id,
      type: track.type,
      sortOrder: track.sortOrder,
      muted: track.muted,
      locked: track.locked,
      clips: track.clips.map((clip) => ({
        id: clip.id,
        assetId: clip.assetId ?? null,
        startTime: clip.startTime,
        endTime: clip.endTime,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        type: clip.type,
        intrinsicVideo: clip.intrinsicVideo,
      })),
    })),
    titleClips: source.titleClips,
    subtitleTracks: source.subtitleTracks,
  });
}

export function buildPlaybackFrameSignature(source: PlaybackFrameSignatureSource): string {
  return `${source.sequenceRevision}:${source.frameNumber}:${source.playheadTime.toFixed(6)}`;
}

export function buildPlaybackSnapshot(
  source: PlaybackSnapshotSource,
  consumer: PlaybackConsumer,
): PlaybackSnapshot {
  const fps = resolveFps(source);
  const frameNumber = Math.round(source.playheadTime * fps);
  const sequenceRevision = buildPlaybackSequenceRevision(source);
  const videoLayers = buildVideoLayers(source);
  const primaryVideoLayer = [...videoLayers].reverse().find((layer) => layer.trackType === 'VIDEO')
    ?? videoLayers[videoLayers.length - 1]
    ?? null;

  return {
    consumer,
    sequenceRevision,
    frameKey: `${consumer}:${buildPlaybackFrameSignature({ sequenceRevision, frameNumber, playheadTime: source.playheadTime })}:${source.activeMonitor}:${source.activeScope ?? 'none'}:${source.showSafeZones ? 1 : 0}`,
    playheadTime: source.playheadTime,
    frameNumber,
    duration: source.duration,
    fps,
    aspectRatio: resolveAspectRatio(source),
    isPlaying: source.isPlaying,
    showSafeZones: source.showSafeZones,
    activeMonitor: source.activeMonitor,
    activeScope: source.activeScope,
    primaryVideoLayer,
    videoLayers,
    titleLayers: buildTitleLayers(source, fps),
    subtitleCues: buildSubtitleCues(source),
  };
}
