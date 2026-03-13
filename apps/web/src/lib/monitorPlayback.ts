import { audioEngine } from '../engine/AudioEngine';
import { getClipSourceTime } from '../engine/clipTiming';
import type { Clip, Track } from '../store/editor.store';

export interface TimelineMonitorMediaSource {
  trackId: string;
  clip: Clip;
  assetId: string;
  sourceTime: number;
  sourceKind: 'audio' | 'video';
}

interface MonitorAudioChannelState {
  element: HTMLMediaElement | null;
  previewTimeoutId: number | null;
  lastPreviewAt: number;
  lastPreviewSourceTime: number | null;
}

const monitorAudioChannels = new Map<string, MonitorAudioChannelState>();

function getSourceTime(clip: Clip, timelineTime: number): number {
  return getClipSourceTime(clip, timelineTime);
}

function findActiveClipInTracks(tracks: Track[], time: number, allowedTypes: Track['type'][]): TimelineMonitorMediaSource | null {
  const orderedTracks = tracks
    .filter((track) => allowedTypes.includes(track.type) && !track.muted)
    .sort((left, right) => {
      if (allowedTypes.length === 1 && allowedTypes[0] === 'AUDIO') {
        return left.sortOrder - right.sortOrder;
      }
      return right.sortOrder - left.sortOrder;
    });

  for (const track of orderedTracks) {
    const clip = track.clips.find((candidate) => (
      Boolean(candidate.assetId)
      && time >= candidate.startTime
      && time < candidate.endTime
    ));

    if (!clip?.assetId) {
      continue;
    }

    return {
      trackId: track.id,
      clip,
      assetId: clip.assetId,
      sourceTime: getSourceTime(clip, time),
      sourceKind: track.type === 'AUDIO' ? 'audio' : 'video',
    };
  }

  return null;
}

function ensureAudioContextReady(): void {
  audioEngine.init();
  void audioEngine.context?.resume?.().catch(() => {});
}

function getMonitorAudioChannelState(channelId: string): MonitorAudioChannelState {
  const existing = monitorAudioChannels.get(channelId);
  if (existing) {
    return existing;
  }

  const created: MonitorAudioChannelState = {
    element: null,
    previewTimeoutId: null,
    lastPreviewAt: 0,
    lastPreviewSourceTime: null,
  };
  monitorAudioChannels.set(channelId, created);
  return created;
}

function clearPreviewTimeout(state: MonitorAudioChannelState): void {
  if (state.previewTimeoutId !== null) {
    window.clearTimeout(state.previewTimeoutId);
    state.previewTimeoutId = null;
  }
}

function attachMonitorAudioChannel(channelId: string, element: HTMLMediaElement): MonitorAudioChannelState {
  const state = getMonitorAudioChannelState(channelId);
  ensureAudioContextReady();

  if (state.element === element) {
    return state;
  }

  clearPreviewTimeout(state);

  if (state.element && !state.element.paused) {
    state.element.pause();
  }

  audioEngine.disconnectVideoSource(channelId);
  element.muted = true;
  audioEngine.connectVideoSource(channelId, element as HTMLVideoElement);
  state.element = element;
  return state;
}

export function attachMonitorAudioOutput(
  channelId: string,
  element: HTMLMediaElement,
): void {
  attachMonitorAudioChannel(channelId, element);
}

export function findTimelineMonitorMediaSource(tracks: Track[], time: number): TimelineMonitorMediaSource | null {
  return (
    findActiveClipInTracks(tracks, time, ['AUDIO'])
    ?? findActiveClipInTracks(tracks, time, ['VIDEO'])
  );
}

export function syncMonitorAudioOutput(
  channelId: string,
  element: HTMLMediaElement,
  sourceTime: number,
  isPlaying: boolean,
  fps: number,
): void {
  if (!Number.isFinite(sourceTime)) {
    return;
  }

  attachMonitorAudioChannel(channelId, element);

  const frameDuration = fps > 0 ? 1 / fps : 1 / 24;
  const safeTime = Math.max(0, sourceTime);

  if (isPlaying) {
    if (element.paused) {
      element.currentTime = safeTime;
      void element.play().catch(() => {});
    }

    if (Math.abs(element.currentTime - safeTime) > frameDuration * 2) {
      element.currentTime = safeTime;
    }

    return;
  }

  if (!element.paused) {
    element.pause();
  }

  if (Math.abs(element.currentTime - safeTime) > 0.02) {
    element.currentTime = safeTime;
  }
}

export function previewMonitorAudioOutput(
  channelId: string,
  element: HTMLMediaElement,
  sourceTime: number,
): void {
  if (!Number.isFinite(sourceTime)) {
    return;
  }

  const state = attachMonitorAudioChannel(channelId, element);
  clearPreviewTimeout(state);
  state.lastPreviewAt = performance.now();
  state.lastPreviewSourceTime = sourceTime;

  element.currentTime = Math.max(0, sourceTime);
  element.playbackRate = 1;
  void element.play().catch(() => {});

  state.previewTimeoutId = window.setTimeout(() => {
    const currentState = monitorAudioChannels.get(channelId);
    if (!currentState || currentState.element !== element) {
      return;
    }

    element.pause();
    currentState.previewTimeoutId = null;
  }, 45);
}

export function reviewMonitorAudioOutput(
  channelId: string,
  element: HTMLMediaElement,
  sourceTime: number,
  options: {
    active: boolean;
    direction: -1 | 1;
    rate: number;
    fps: number;
  },
): void {
  const safeRate = Math.max(0.25, Math.min(8, options.rate || 1));
  if (!options.active) {
    syncMonitorAudioOutput(channelId, element, sourceTime, false, options.fps);
    return;
  }

  if (options.direction > 0 && Math.abs(safeRate - 1) < 0.01) {
    syncMonitorAudioOutput(channelId, element, sourceTime, true, options.fps);
    return;
  }

  const state = getMonitorAudioChannelState(channelId);
  const frameDuration = options.fps > 0 ? 1 / options.fps : 1 / 24;
  const previewThresholdMs = Math.max(45, 120 / safeRate);
  const now = performance.now();
  const sourceDrift = state.lastPreviewSourceTime === null
    ? Number.POSITIVE_INFINITY
    : Math.abs(state.lastPreviewSourceTime - sourceTime);

  if ((now - state.lastPreviewAt) < previewThresholdMs && sourceDrift < frameDuration * 2) {
    return;
  }

  previewMonitorAudioOutput(channelId, element, sourceTime);
}

export function releaseMonitorAudioOutput(channelId: string): void {
  const state = monitorAudioChannels.get(channelId);
  if (!state) {
    audioEngine.disconnectVideoSource(channelId);
    return;
  }

  clearPreviewTimeout(state);

  if (state.element && !state.element.paused) {
    state.element.pause();
  }

  audioEngine.disconnectVideoSource(channelId);
  monitorAudioChannels.delete(channelId);
}
