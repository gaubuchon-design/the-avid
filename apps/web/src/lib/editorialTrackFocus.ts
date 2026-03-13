import type { Track } from '../store/editor.store';

type FocusableTrack = Pick<Track, 'id' | 'type' | 'locked' | 'muted'>;

interface EditorialTrackFocusState {
  tracks: FocusableTrack[];
  selectedTrackId: string | null;
  enabledTrackIds: string[];
  videoMonitorTrackId: string | null;
}

function isEditableTrack(track: FocusableTrack | null | undefined): track is FocusableTrack {
  return Boolean(track && !track.locked && !track.muted);
}

export function resolveEditorialFocusTrackIds(state: EditorialTrackFocusState): string[] {
  const trackById = new Map(state.tracks.map((track) => [track.id, track]));

  const selectedTrack = state.selectedTrackId
    ? trackById.get(state.selectedTrackId) ?? null
    : null;
  if (isEditableTrack(selectedTrack)) {
    return [selectedTrack.id];
  }

  const enabledTracks = state.enabledTrackIds
    .map((trackId) => trackById.get(trackId) ?? null)
    .filter(isEditableTrack);
  if (enabledTracks.length > 0) {
    return enabledTracks.map((track) => track.id);
  }

  const monitoredVideoTrack = state.videoMonitorTrackId
    ? trackById.get(state.videoMonitorTrackId) ?? null
    : null;
  if (
    isEditableTrack(monitoredVideoTrack)
    && (monitoredVideoTrack.type === 'VIDEO' || monitoredVideoTrack.type === 'GRAPHIC')
  ) {
    return [monitoredVideoTrack.id];
  }

  return state.tracks.filter(isEditableTrack).map((track) => track.id);
}
