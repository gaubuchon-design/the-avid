import { playbackEngine } from '../engine/PlaybackEngine';
import { findActiveMediaClip, getSourceTime } from '../engine/compositeRecordFrame';
import type { Bin, MediaAsset } from '../store/editor.store';
import { useEditorStore } from '../store/editor.store';
import { usePlayerStore } from '../store/player.store';

let sourceShuttleJ = 0;
let sourceShuttleL = 0;

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
