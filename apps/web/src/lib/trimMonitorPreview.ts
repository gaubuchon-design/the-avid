import { useEffect, useMemo, useState } from 'react';
import {
  TrimMode,
  TrimSide,
  trimEngine,
  type SlideState,
  type SlipState,
  type TrimRoller,
  type TrimState,
} from '../engine/TrimEngine';
import type {
  Bin,
  MediaAsset,
  ProjectSettings,
  SequenceSettings,
  Track,
} from '../store/editor.store';
import { getClipSourceTime } from '../engine/clipTiming';
import { resolveEditorialFocusTrackIds } from './editorialTrackFocus';

export interface TrimMonitorPreviewState {
  tracks: Track[];
  bins: Bin[];
  selectedTrackId: string | null;
  enabledTrackIds: string[];
  videoMonitorTrackId: string | null;
  sequenceSettings: Pick<SequenceSettings, 'fps'>;
  projectSettings: Pick<ProjectSettings, 'frameRate'>;
  trimLoopPlaybackActive?: boolean;
  trimLoopOffsetFrames?: number;
}

export interface TrimPreviewSide {
  role: 'A' | 'B';
  monitorLabel: string;
  monitorContext: string;
  trackId: string;
  trackName: string;
  trackType: Track['type'];
  clipId: string;
  clipName: string;
  assetId: string | null;
  asset: MediaAsset | null;
  sourceTime: number;
  timelineTime: number;
  playable: boolean;
  selected: boolean;
  rollerSide: TrimSide;
}

export interface TrimMonitorPreview {
  active: boolean;
  selectionLabel: 'OFF' | 'A' | 'B' | 'AB' | 'ASYM';
  linkedSelection: boolean;
  aSide: TrimPreviewSide | null;
  bSide: TrimPreviewSide | null;
  sourceMonitor: TrimPreviewSide | null;
  recordMonitor: TrimPreviewSide | null;
}

interface SideCandidate extends TrimPreviewSide {
  score: number;
  preferredForSelection: boolean;
}

function getTrimSelectionLabel(trimState: TrimState): TrimMonitorPreview['selectionLabel'] {
  if (!trimState.active || trimState.rollers.length === 0) {
    return 'OFF';
  }

  const sides = new Set(trimState.rollers.map((roller) => roller.side));
  if (sides.size > 1) {
    return 'ASYM';
  }

  const [side] = sides;
  switch (side) {
    case TrimSide.A_SIDE:
      return 'A';
    case TrimSide.B_SIDE:
      return 'B';
    case TrimSide.BOTH:
      return 'AB';
    default:
      return 'OFF';
  }
}

function findAssetInBins(bins: Bin[], assetId: string): MediaAsset | null {
  for (const bin of bins) {
    const asset = bin.assets.find((candidate) => candidate.id === assetId);
    if (asset) {
      return asset;
    }

    const nestedAsset = findAssetInBins(bin.children, assetId);
    if (nestedAsset) {
      return nestedAsset;
    }
  }

  return null;
}

function isVisualTrack(track: Track): boolean {
  return track.type === 'VIDEO' || track.type === 'GRAPHIC';
}

function isPlayableAsset(asset: MediaAsset | null): boolean {
  return Boolean(asset && asset.type !== 'AUDIO' && asset.type !== 'DOCUMENT');
}

function getRolePreviewTime(
  role: 'A' | 'B',
  clip: { startTime: number; endTime: number },
  frameOffset: number,
): number {
  const minTime = clip.startTime;
  const maxTime = Math.max(clip.startTime, clip.endTime - frameOffset);

  if (role === 'A') {
    return Math.max(minTime, Math.min(maxTime, clip.endTime - frameOffset));
  }

  return Math.max(minTime, Math.min(maxTime, clip.startTime + frameOffset));
}

function getPlaybackOffsetSeconds(state: TrimMonitorPreviewState): number {
  const fps = Math.max(state.sequenceSettings.fps || state.projectSettings.frameRate || 24, 1);
  return (state.trimLoopPlaybackActive ? (state.trimLoopOffsetFrames ?? 0) : 0) / fps;
}

function getLoopAdjustedPreviewTime(
  clip: Track['clips'][number],
  timelineTime: number,
  frameOffset: number,
  playbackOffsetSeconds: number,
): { sourceTime: number; timelineTime: number } {
  const minTime = clip.startTime;
  const maxTime = Math.max(clip.startTime, clip.endTime - frameOffset);
  const adjustedTimelineTime = Math.max(
    minTime,
    Math.min(maxTime, timelineTime + playbackOffsetSeconds),
  );

  return {
    sourceTime: getClipSourceTime(clip, adjustedTimelineTime),
    timelineTime: adjustedTimelineTime,
  };
}

function getFocusRank(trackId: string, focusedTrackIds: string[]): number {
  const focusedIndex = focusedTrackIds.indexOf(trackId);
  if (focusedIndex < 0) {
    return 0;
  }

  return Math.max(0, 80 - (focusedIndex * 10));
}

function buildPreviewSide(args: {
  role: 'A' | 'B';
  track: Track;
  clip: Track['clips'][number];
  asset: MediaAsset | null;
  timelineTime: number;
  sourceTime?: number;
  selected: boolean;
  rollerSide: TrimSide;
  monitorLabel: string;
  monitorContext: string;
}): TrimPreviewSide {
  return {
    role: args.role,
    monitorLabel: args.monitorLabel,
    monitorContext: args.monitorContext,
    trackId: args.track.id,
    trackName: args.track.name,
    trackType: args.track.type,
    clipId: args.clip.id,
    clipName: args.clip.name,
    assetId: args.clip.assetId ?? null,
    asset: args.asset,
    sourceTime: args.sourceTime ?? getClipSourceTime(args.clip, args.timelineTime),
    timelineTime: args.timelineTime,
    playable: isVisualTrack(args.track) && isPlayableAsset(args.asset),
    selected: args.selected,
    rollerSide: args.rollerSide,
  };
}

function getTrimLoopSourceTime(
  role: 'A' | 'B',
  clip: Track['clips'][number],
  frameOffset: number,
  playbackOffsetSeconds: number,
): { sourceTime: number; timelineTime: number } {
  const clipVisibleDuration = clip.endTime - clip.startTime;
  const totalSourceDuration = clipVisibleDuration + clip.trimStart + clip.trimEnd;
  const anchorSourceTime = role === 'A'
    ? clip.trimStart + clipVisibleDuration - frameOffset
    : clip.trimStart;
  const clampedSourceTime = Math.max(
    0,
    Math.min(totalSourceDuration - frameOffset, anchorSourceTime + playbackOffsetSeconds),
  );
  const timelineAnchor = role === 'A'
    ? clip.endTime - frameOffset
    : clip.startTime;

  return {
    sourceTime: clampedSourceTime,
    timelineTime: timelineAnchor + playbackOffsetSeconds,
  };
}

function buildSideCandidate(
  role: 'A' | 'B',
  roller: TrimRoller,
  state: TrimMonitorPreviewState,
  trimSelectionLabel: TrimMonitorPreview['selectionLabel'],
  frameOffset: number,
  focusedTrackIds: string[],
): SideCandidate | null {
  const track = state.tracks.find((candidate) => candidate.id === roller.trackId);
  if (!track) {
    return null;
  }

  const clipId = role === 'A' ? roller.clipAId : roller.clipBId;
  if (!clipId) {
    return null;
  }

  const clip = track.clips.find((candidate) => candidate.id === clipId);
  if (!clip) {
    return null;
  }

  const asset = clip.assetId ? findAssetInBins(state.bins, clip.assetId) : null;
  const preferredForSelection = role === 'A'
    ? roller.side === TrimSide.A_SIDE || roller.side === TrimSide.BOTH
    : roller.side === TrimSide.B_SIDE || roller.side === TrimSide.BOTH;
  const playbackOffsetSeconds = getPlaybackOffsetSeconds(state);
  const loopPreviewTime = state.trimLoopPlaybackActive
    ? getTrimLoopSourceTime(role, clip, frameOffset, playbackOffsetSeconds)
    : null;
  const timelineTime = loopPreviewTime?.timelineTime ?? getRolePreviewTime(role, clip, frameOffset);
  const preview = buildPreviewSide({
    role,
    track,
    clip,
    asset,
    timelineTime,
    sourceTime: loopPreviewTime?.sourceTime,
    selected: trimSelectionLabel === 'AB'
      || trimSelectionLabel === role
      || (trimSelectionLabel === 'ASYM' && preferredForSelection),
    rollerSide: roller.side,
    monitorLabel: role === 'A' ? 'A-SIDE' : 'B-SIDE',
    monitorContext: role === 'A' ? 'OUTGOING' : 'INCOMING',
  });

  let score = getFocusRank(track.id, focusedTrackIds);
  if (preview.playable) {
    score += 120;
  } else if (isVisualTrack(track)) {
    score += 70;
  }

  if (track.id === state.selectedTrackId) {
    score += 36;
  }

  if (track.id === state.videoMonitorTrackId && isVisualTrack(track)) {
    score += 28;
  }

  if (preferredForSelection) {
    score += 44;
  }

  if (trimSelectionLabel === 'ASYM' && preferredForSelection) {
    score += 18;
  }

  return {
    ...preview,
    preferredForSelection,
    score,
  };
}

function chooseSideCandidate(
  role: 'A' | 'B',
  trimState: TrimState,
  state: TrimMonitorPreviewState,
  trimSelectionLabel: TrimMonitorPreview['selectionLabel'],
  frameOffset: number,
  focusedTrackIds: string[],
): TrimPreviewSide | null {
  const candidates = trimState.rollers
    .map((roller) => buildSideCandidate(role, roller, state, trimSelectionLabel, frameOffset, focusedTrackIds))
    .filter((candidate): candidate is SideCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }

  const preferredCandidate = candidates.find((candidate) => candidate.preferredForSelection && candidate.playable)
    ?? candidates.find((candidate) => candidate.preferredForSelection)
    ?? candidates.find((candidate) => candidate.playable)
    ?? candidates[0];

  return preferredCandidate ? {
    role: preferredCandidate.role,
    monitorLabel: preferredCandidate.monitorLabel,
    monitorContext: preferredCandidate.monitorContext,
    trackId: preferredCandidate.trackId,
    trackName: preferredCandidate.trackName,
    trackType: preferredCandidate.trackType,
    clipId: preferredCandidate.clipId,
    clipName: preferredCandidate.clipName,
    assetId: preferredCandidate.assetId,
    asset: preferredCandidate.asset,
    sourceTime: preferredCandidate.sourceTime,
    timelineTime: preferredCandidate.timelineTime,
    playable: preferredCandidate.playable,
    selected: preferredCandidate.selected,
    rollerSide: preferredCandidate.rollerSide,
  } : null;
}

function resolvePreviewFromState(
  state: TrimMonitorPreviewState,
  trackId: string,
  clipId: string | null,
  timelineTime: number,
  role: 'A' | 'B',
  monitorLabel: string,
  monitorContext: string,
  frameOffset: number,
): TrimPreviewSide | null {
  if (!clipId) {
    return null;
  }

  const track = state.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    return null;
  }

  const clip = track.clips.find((candidate) => candidate.id === clipId);
  if (!clip) {
    return null;
  }

  const asset = clip.assetId ? findAssetInBins(state.bins, clip.assetId) : null;
  const playbackOffsetSeconds = getPlaybackOffsetSeconds(state);
  const loopPreviewTime = state.trimLoopPlaybackActive
    ? getLoopAdjustedPreviewTime(clip, timelineTime, frameOffset, playbackOffsetSeconds)
    : null;

  return buildPreviewSide({
    role,
    track,
    clip,
    asset,
    timelineTime: loopPreviewTime?.timelineTime ?? timelineTime,
    sourceTime: loopPreviewTime?.sourceTime,
    selected: true,
    rollerSide: TrimSide.BOTH,
    monitorLabel,
    monitorContext,
  });
}

function resolveSlipPreview(
  state: TrimMonitorPreviewState,
  slipState: SlipState | null,
  frameOffset: number,
): Pick<TrimMonitorPreview, 'aSide' | 'bSide' | 'sourceMonitor' | 'recordMonitor'> {
  if (!slipState) {
    return {
      aSide: null,
      bSide: null,
      sourceMonitor: null,
      recordMonitor: null,
    };
  }

  const track = state.tracks.find((candidate) => candidate.id === slipState.trackId);
  const clip = track?.clips.find((candidate) => candidate.id === slipState.clipId) ?? null;
  if (!track || !clip) {
    return {
      aSide: null,
      bSide: null,
      sourceMonitor: null,
      recordMonitor: null,
    };
  }

  const sourceMonitor = resolvePreviewFromState(
    state,
    track.id,
    clip.id,
    Math.max(clip.startTime, Math.min(clip.endTime - frameOffset, clip.startTime + frameOffset)),
    'A',
    'SLIP IN',
    'SOURCE HEAD',
    frameOffset,
  );
  const recordMonitor = resolvePreviewFromState(
    state,
    track.id,
    clip.id,
    Math.max(clip.startTime, Math.min(clip.endTime - frameOffset, clip.endTime - frameOffset)),
    'B',
    'SLIP OUT',
    'SOURCE TAIL',
    frameOffset,
  );

  return {
    aSide: sourceMonitor,
    bSide: recordMonitor,
    sourceMonitor,
    recordMonitor,
  };
}

function resolveSlidePreview(
  state: TrimMonitorPreviewState,
  slideState: SlideState | null,
  frameOffset: number,
): Pick<TrimMonitorPreview, 'aSide' | 'bSide' | 'sourceMonitor' | 'recordMonitor'> {
  if (!slideState) {
    return {
      aSide: null,
      bSide: null,
      sourceMonitor: null,
      recordMonitor: null,
    };
  }

  const track = state.tracks.find((candidate) => candidate.id === slideState.trackId);
  const clip = track?.clips.find((candidate) => candidate.id === slideState.clipId) ?? null;
  if (!track || !clip) {
    return {
      aSide: null,
      bSide: null,
      sourceMonitor: null,
      recordMonitor: null,
    };
  }

  const leftPreview = resolvePreviewFromState(
    state,
    track.id,
    slideState.leftNeighborId ?? clip.id,
    slideState.leftNeighborId
      ? getRolePreviewTime('A', track.clips.find((candidate) => candidate.id === slideState.leftNeighborId) ?? clip, frameOffset)
      : getRolePreviewTime('A', clip, frameOffset),
    'A',
    'SLIDE LEFT',
    slideState.leftNeighborId ? 'PREV CUT' : 'CLIP HEAD',
    frameOffset,
  );
  const rightPreview = resolvePreviewFromState(
    state,
    track.id,
    slideState.rightNeighborId ?? clip.id,
    slideState.rightNeighborId
      ? getRolePreviewTime('B', track.clips.find((candidate) => candidate.id === slideState.rightNeighborId) ?? clip, frameOffset)
      : getRolePreviewTime('B', clip, frameOffset),
    'B',
    'SLIDE RIGHT',
    slideState.rightNeighborId ? 'NEXT CUT' : 'CLIP TAIL',
    frameOffset,
  );

  return {
    aSide: leftPreview,
    bSide: rightPreview,
    sourceMonitor: leftPreview,
    recordMonitor: rightPreview,
  };
}

export function useTrimEngineSnapshot(): TrimState {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    return trimEngine.subscribe(() => {
      setRevision((current) => current + 1);
    });
  }, []);

  return useMemo(() => {
    void revision;
    return trimEngine.getState();
  }, [revision]);
}

export function resolveTrimMonitorPreview(
  state: TrimMonitorPreviewState,
  trimState: TrimState,
): TrimMonitorPreview {
  const selectionLabel = getTrimSelectionLabel(trimState);
  if (!trimState.active || trimState.rollers.length === 0) {
    return {
      active: false,
      selectionLabel,
      linkedSelection: trimState.linkedSelection,
      aSide: null,
      bSide: null,
      sourceMonitor: null,
      recordMonitor: null,
    };
  }

  const fps = state.sequenceSettings.fps || state.projectSettings.frameRate || 24;
  const frameOffset = 0.5 / Math.max(fps, 1);
  const focusedTrackIds = resolveEditorialFocusTrackIds({
    tracks: state.tracks,
    selectedTrackId: state.selectedTrackId,
    enabledTrackIds: state.enabledTrackIds,
    videoMonitorTrackId: state.videoMonitorTrackId,
  });

  const aSide = chooseSideCandidate('A', trimState, state, selectionLabel, frameOffset, focusedTrackIds);
  const bSide = chooseSideCandidate('B', trimState, state, selectionLabel, frameOffset, focusedTrackIds);

  if (trimState.mode === TrimMode.SLIP) {
    return {
      active: trimState.active,
      selectionLabel,
      linkedSelection: trimState.linkedSelection,
      ...resolveSlipPreview(state, trimEngine.getSlipState(), frameOffset),
    };
  }

  if (trimState.mode === TrimMode.SLIDE) {
    return {
      active: trimState.active,
      selectionLabel,
      linkedSelection: trimState.linkedSelection,
      ...resolveSlidePreview(state, trimEngine.getSlideState(), frameOffset),
    };
  }

  return {
    active: trimState.active,
    selectionLabel,
    linkedSelection: trimState.linkedSelection,
    aSide,
    bSide,
    sourceMonitor: aSide ?? bSide,
    recordMonitor: bSide ?? aSide,
  };
}

export function useTrimMonitorPreview(state: TrimMonitorPreviewState): TrimMonitorPreview {
  const trimState = useTrimEngineSnapshot();

  return useMemo(() => {
    return resolveTrimMonitorPreview(state, trimState);
  }, [
    state.bins,
    state.enabledTrackIds,
    state.projectSettings.frameRate,
    state.selectedTrackId,
    state.sequenceSettings.fps,
    state.trimLoopOffsetFrames,
    state.trimLoopPlaybackActive,
    state.tracks,
    state.videoMonitorTrackId,
    trimState,
  ]);
}
