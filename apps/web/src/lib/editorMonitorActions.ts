import { playbackEngine } from '../engine/PlaybackEngine';
import { findActiveMediaClip, getSourceTime } from '../engine/compositeRecordFrame';
import { resolveEditorialFocusTrackIds } from './editorialTrackFocus';
import type { Bin, MediaAsset } from '../store/editor.store';
import { useEditorStore } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';

let sourceShuttleJ = 0;
let sourceShuttleL = 0;

function getSourceDuration(): number {
  const sourceDuration = useEditorStore.getState().sourceAsset?.duration;
  return Number.isFinite(sourceDuration) && sourceDuration !== undefined
    ? Math.max(0, sourceDuration)
    : Number.POSITIVE_INFINITY;
}

function clampSourceTime(time: number): number {
  const sourceDuration = getSourceDuration();
  return Number.isFinite(sourceDuration)
    ? Math.max(0, Math.min(time, sourceDuration))
    : Math.max(0, time);
}

export function activateSourceMonitor(): void {
  usePlayerStore.getState().setActiveMonitor('source');
}

export function activateRecordMonitor(): void {
  usePlayerStore.getState().setActiveMonitor('record');
}

export function toggleMonitorFocus(): void {
  const playerState = usePlayerStore.getState();
  playerState.setActiveMonitor(playerState.activeMonitor === 'source' ? 'record' : 'source');
}

export function stepFramesForActiveMonitor(frameDelta: number): void {
  const editorState = useEditorStore.getState();
  const fps = editorState.sequenceSettings?.fps || editorState.projectSettings.frameRate || 24;
  const timeDelta = frameDelta / fps;

  if (usePlayerStore.getState().activeMonitor === 'source') {
    editorState.setSourcePlayhead(clampSourceTime(editorState.sourcePlayhead + timeDelta));
    return;
  }

  editorState.setPlayhead(editorState.playheadTime + timeDelta);
}

export function goToStartForActiveMonitor(): void {
  const editorState = useEditorStore.getState();

  if (usePlayerStore.getState().activeMonitor === 'source') {
    editorState.setSourcePlayhead(0);
    return;
  }

  editorState.setPlayhead(0);
}

export function goToEndForActiveMonitor(): void {
  const editorState = useEditorStore.getState();

  if (usePlayerStore.getState().activeMonitor === 'source') {
    editorState.setSourcePlayhead(clampSourceTime(Number.POSITIVE_INFINITY));
    return;
  }

  editorState.setPlayhead(editorState.duration);
}

function findAssetInBins(bins: Bin[], assetId: string): MediaAsset | null {
  for (const bin of bins) {
    const asset = bin.assets.find((candidate) => candidate.id === assetId);
    if (asset) {
      return asset;
    }

    const childAsset = findAssetInBins(bin.children, assetId);
    if (childAsset) {
      return childAsset;
    }
  }

  return null;
}

export function resetSourceMonitorShuttleState(): void {
  sourceShuttleJ = 0;
  sourceShuttleL = 0;
}

export function sourceJklShuttle(key: 'j' | 'k' | 'l'): void {
  const playerState = usePlayerStore.getState();

  if (key === 'k') {
    playerState.pause();
    playerState.setSpeed(1);
    resetSourceMonitorShuttleState();
    return;
  }

  if (key === 'j') {
    sourceShuttleL = 0;
    sourceShuttleJ += 1;
    playerState.setSpeed(-Math.min(sourceShuttleJ, 8));
    playerState.play();
    return;
  }

  sourceShuttleJ = 0;
  sourceShuttleL += 1;
  playerState.setSpeed(Math.min(sourceShuttleL, 8));
  playerState.play();
}

export function togglePlayForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  if (playerState.activeMonitor === 'source') {
    playerState.togglePlayPause();
    return;
  }

  useEditorStore.getState().togglePlay();
}

export function stopActiveMonitorPlayback(): void {
  const playerState = usePlayerStore.getState();
  if (playerState.activeMonitor === 'source') {
    sourceJklShuttle('k');
    return;
  }

  const editorState = useEditorStore.getState();
  if (editorState.isPlaying) {
    editorState.togglePlay();
  }
}

export function playForwardForActiveMonitor(): void {
  if (usePlayerStore.getState().activeMonitor === 'source') {
    sourceJklShuttle('l');
    return;
  }

  playbackEngine.jklShuttle('l');
}

export function playReverseForActiveMonitor(): void {
  if (usePlayerStore.getState().activeMonitor === 'source') {
    sourceJklShuttle('j');
    return;
  }

  playbackEngine.jklShuttle('j');
}

export function markInForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    editorState.setSourceInPoint(editorState.sourcePlayhead);
    return;
  }

  editorState.setInPoint(editorState.playheadTime);
}

export function markOutForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    editorState.setSourceOutPoint(editorState.sourcePlayhead);
    return;
  }

  editorState.setOutPoint(editorState.playheadTime);
}

export function clearMarksForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    editorState.clearSourceInOut();
    return;
  }

  editorState.clearInOut();
}

export function clearInForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    editorState.setSourceInPoint(null);
    return;
  }

  editorState.setInPoint(null);
}

export function clearOutForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    editorState.setSourceOutPoint(null);
    return;
  }

  editorState.setOutPoint(null);
}

export function goToInForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    if (editorState.sourceInPoint !== null) {
      editorState.setSourcePlayhead(editorState.sourceInPoint);
    }
    return;
  }

  if (editorState.inPoint !== null) {
    editorState.setPlayhead(editorState.inPoint);
  }
}

export function goToOutForActiveMonitor(): void {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    if (editorState.sourceOutPoint !== null) {
      editorState.setSourcePlayhead(editorState.sourceOutPoint);
    }
    return;
  }

  if (editorState.outPoint !== null) {
    editorState.setPlayhead(editorState.outPoint);
  }
}

export function markClipForActiveMonitor(): boolean {
  const playerState = usePlayerStore.getState();
  const editorState = useEditorStore.getState();

  if (playerState.activeMonitor === 'source') {
    const sourceDuration = editorState.sourceAsset?.duration;
    if (sourceDuration === undefined || sourceDuration === null || sourceDuration <= 0) {
      return false;
    }

    editorState.setSourceInPoint(0);
    editorState.setSourceOutPoint(sourceDuration);
    return true;
  }

  const focusTrackIds = new Set(resolveEditorialFocusTrackIds(editorState));
  const candidateTracks = editorState.tracks.filter((track) => focusTrackIds.has(track.id));

  for (const track of candidateTracks) {
    const clip = track.clips.find((item) => item.startTime <= editorState.playheadTime && item.endTime >= editorState.playheadTime);
    if (!clip) {
      continue;
    }

    editorState.setInPoint(clip.startTime);
    editorState.setOutPoint(clip.endTime);
    return true;
  }

  return false;
}

export function matchFrameAtPlayhead(): boolean {
  const state = useEditorStore.getState();
  const { tracks, playheadTime, bins } = state;
  const clip = findActiveMediaClip(tracks, playheadTime);
  if (!clip?.assetId) {
    return false;
  }

  const asset = findAssetInBins(bins, clip.assetId);
  if (!asset) {
    return false;
  }

  state.setSourceAsset(asset);
  state.setSourcePlayhead(getSourceTime(clip, playheadTime));
  state.setInspectedClip(clip.id);
  usePlayerStore.getState().setActiveMonitor('source');
  return true;
}
