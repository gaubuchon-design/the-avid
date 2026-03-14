import { useEditorStore } from '../store/editor.store';

export interface VersionedEditorSnapshot {
  tracks: ReturnType<typeof useEditorStore.getState>['tracks'];
  markers: ReturnType<typeof useEditorStore.getState>['markers'];
  bins: ReturnType<typeof useEditorStore.getState>['bins'];
  smartBins: ReturnType<typeof useEditorStore.getState>['smartBins'];
  selectedBinId: ReturnType<typeof useEditorStore.getState>['selectedBinId'];
  selectedSmartBinId: ReturnType<typeof useEditorStore.getState>['selectedSmartBinId'];
  activeBinAssets: ReturnType<typeof useEditorStore.getState>['activeBinAssets'];
  sourceAsset: ReturnType<typeof useEditorStore.getState>['sourceAsset'];
  playheadTime: number;
  duration: number;
  selectedClipIds: ReturnType<typeof useEditorStore.getState>['selectedClipIds'];
  selectedTrackId: ReturnType<typeof useEditorStore.getState>['selectedTrackId'];
  inPoint: ReturnType<typeof useEditorStore.getState>['inPoint'];
  outPoint: ReturnType<typeof useEditorStore.getState>['outPoint'];
  sourceInPoint: ReturnType<typeof useEditorStore.getState>['sourceInPoint'];
  sourceOutPoint: ReturnType<typeof useEditorStore.getState>['sourceOutPoint'];
  sourcePlayhead: number;
  enabledTrackIds: ReturnType<typeof useEditorStore.getState>['enabledTrackIds'];
  syncLockedTrackIds: ReturnType<typeof useEditorStore.getState>['syncLockedTrackIds'];
  trimMode: ReturnType<typeof useEditorStore.getState>['trimMode'];
  trimActive: boolean;
  sequenceSettings: ReturnType<typeof useEditorStore.getState>['sequenceSettings'];
  subtitleTracks: ReturnType<typeof useEditorStore.getState>['subtitleTracks'];
  titleClips: ReturnType<typeof useEditorStore.getState>['titleClips'];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function captureEditorVersionSnapshot(): VersionedEditorSnapshot {
  const state = useEditorStore.getState();
  return deepClone({
    tracks: state.tracks,
    markers: state.markers,
    bins: state.bins,
    smartBins: state.smartBins,
    selectedBinId: state.selectedBinId,
    selectedSmartBinId: state.selectedSmartBinId,
    activeBinAssets: state.activeBinAssets,
    sourceAsset: state.sourceAsset,
    playheadTime: state.playheadTime,
    duration: state.duration,
    selectedClipIds: state.selectedClipIds,
    selectedTrackId: state.selectedTrackId,
    inPoint: state.inPoint,
    outPoint: state.outPoint,
    sourceInPoint: state.sourceInPoint,
    sourceOutPoint: state.sourceOutPoint,
    sourcePlayhead: state.sourcePlayhead,
    enabledTrackIds: state.enabledTrackIds,
    syncLockedTrackIds: state.syncLockedTrackIds,
    trimMode: state.trimMode,
    trimActive: state.trimActive,
    sequenceSettings: state.sequenceSettings,
    subtitleTracks: state.subtitleTracks,
    titleClips: state.titleClips,
  });
}

function isVersionedEditorSnapshot(candidate: unknown): candidate is VersionedEditorSnapshot {
  if (!candidate || typeof candidate !== 'object') return false;
  const snapshot = candidate as Partial<VersionedEditorSnapshot>;
  return Array.isArray(snapshot.tracks) && Array.isArray(snapshot.bins) && typeof snapshot.playheadTime === 'number';
}

export function applyEditorVersionSnapshot(snapshotData: unknown): boolean {
  if (!isVersionedEditorSnapshot(snapshotData)) {
    return false;
  }

  const snapshot = deepClone(snapshotData) as VersionedEditorSnapshot;
  useEditorStore.setState({
    tracks: snapshot.tracks,
    markers: snapshot.markers,
    bins: snapshot.bins,
    smartBins: snapshot.smartBins,
    selectedBinId: snapshot.selectedBinId,
    selectedSmartBinId: snapshot.selectedSmartBinId,
    activeBinAssets: snapshot.activeBinAssets,
    sourceAsset: snapshot.sourceAsset,
    playheadTime: snapshot.playheadTime,
    duration: snapshot.duration,
    selectedClipIds: snapshot.selectedClipIds,
    selectedTrackId: snapshot.selectedTrackId,
    inPoint: snapshot.inPoint,
    outPoint: snapshot.outPoint,
    sourceInPoint: snapshot.sourceInPoint,
    sourceOutPoint: snapshot.sourceOutPoint,
    sourcePlayhead: snapshot.sourcePlayhead,
    enabledTrackIds: snapshot.enabledTrackIds,
    syncLockedTrackIds: snapshot.syncLockedTrackIds,
    trimMode: snapshot.trimMode,
    trimActive: snapshot.trimActive,
    sequenceSettings: snapshot.sequenceSettings,
    subtitleTracks: snapshot.subtitleTracks,
    titleClips: snapshot.titleClips,
  });
  return true;
}
