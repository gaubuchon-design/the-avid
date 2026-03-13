import { trackPatchingEngine } from '../engine/TrackPatchingEngine';
import { useEditorStore } from '../store/editor.store';

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export function getTrackPatchingStateSnapshot(): {
  enabledTrackIds: string[];
  syncLockedTrackIds: string[];
  videoMonitorTrackId: string | null;
  trackPatchLabels: string[];
} {
  const tracks = useEditorStore.getState().tracks;
  const trackNameById = new Map(tracks.map((track) => [track.id, track.name]));
  const trackPatchLabels = trackPatchingEngine
    .getPatches()
    .filter((patch) => patch.enabled)
    .sort((a, b) => {
      if (a.sourceTrackType !== b.sourceTrackType) {
        return a.sourceTrackType === 'VIDEO' ? -1 : 1;
      }
      return a.sourceTrackIndex - b.sourceTrackIndex;
    })
    .map((patch) => {
      const sourceLabel = `${patch.sourceTrackType === 'VIDEO' ? 'V' : 'A'}${patch.sourceTrackIndex}`;
      const recordLabel = trackNameById.get(patch.recordTrackId) ?? patch.recordTrackId;
      return `${sourceLabel}->${recordLabel}`;
    });

  return {
    enabledTrackIds: trackPatchingEngine.getEnabledRecordTracks(),
    syncLockedTrackIds: trackPatchingEngine.getSyncLockedTracks(),
    videoMonitorTrackId: trackPatchingEngine.getVideoMonitorTrack(),
    trackPatchLabels,
  };
}

export function syncTrackPatchingStateToStore(): void {
  const next = getTrackPatchingStateSnapshot();
  const current = useEditorStore.getState();
  const trackStateChanged = current.tracks.some((track) => {
    return (
      track.muted !== trackPatchingEngine.isMuted(track.id)
      || track.solo !== trackPatchingEngine.isSoloed(track.id)
      || track.locked !== trackPatchingEngine.isTrackLocked(track.id)
    );
  });

  if (
    arraysEqual(current.enabledTrackIds, next.enabledTrackIds)
    && arraysEqual(current.syncLockedTrackIds, next.syncLockedTrackIds)
    && current.videoMonitorTrackId === next.videoMonitorTrackId
    && arraysEqual(current.trackPatchLabels, next.trackPatchLabels)
    && !trackStateChanged
  ) {
    return;
  }

  useEditorStore.setState((state) => ({
    enabledTrackIds: next.enabledTrackIds,
    syncLockedTrackIds: next.syncLockedTrackIds,
    videoMonitorTrackId: next.videoMonitorTrackId,
    trackPatchLabels: next.trackPatchLabels,
    tracks: trackStateChanged
      ? state.tracks.map((track) => ({
          ...track,
          muted: trackPatchingEngine.isMuted(track.id),
          solo: trackPatchingEngine.isSoloed(track.id),
          locked: trackPatchingEngine.isTrackLocked(track.id),
        }))
      : state.tracks,
  }));
}

export function subscribeTrackPatchingStateToStore(): () => void {
  syncTrackPatchingStateToStore();
  return trackPatchingEngine.subscribe(() => {
    syncTrackPatchingStateToStore();
  });
}
