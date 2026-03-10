import { useEffect } from 'react';
import { useCollabStore } from '../store/collab.store';
import { useEditorStore } from '../store/editor.store';

const PRESENCE_SYNC_INTERVAL_MS = 250;
const PLAYHEAD_DELTA_EPSILON = 0.001;

export function useEditorCollabPresenceSync(projectId?: string): void {
  const connected = useCollabStore((state) => state.connected);
  const syncPresenceFromEditor = useCollabStore((state) => state.syncPresenceFromEditor);

  useEffect(() => {
    if (!projectId || projectId === 'new' || !connected) {
      return;
    }

    let lastTrackId: string | null = null;
    let lastPlayheadTime = Number.NaN;
    let lastSyncAt = 0;

    const syncFromState = (state: ReturnType<typeof useEditorStore.getState>) => {
      const nextPlayheadTime = Number.isFinite(state.playheadTime) ? state.playheadTime : 0;
      const trackChanged = state.selectedTrackId !== lastTrackId;
      const playheadChanged =
        !Number.isFinite(lastPlayheadTime)
        || Math.abs(nextPlayheadTime - lastPlayheadTime) > PLAYHEAD_DELTA_EPSILON;

      if (!trackChanged && !playheadChanged) {
        return;
      }

      const now = Date.now();
      if (!trackChanged && now - lastSyncAt < PRESENCE_SYNC_INTERVAL_MS) {
        return;
      }

      lastTrackId = state.selectedTrackId;
      lastPlayheadTime = nextPlayheadTime;
      lastSyncAt = now;
      const fps = state.sequenceSettings?.fps || state.projectSettings.frameRate || 24;
      syncPresenceFromEditor({
        playheadTime: nextPlayheadTime,
        selectedTrackId: state.selectedTrackId,
        fps,
      });
    };

    syncFromState(useEditorStore.getState());
    const unsubscribe = useEditorStore.subscribe((state) => {
      syncFromState(state);
    });
    return () => {
      unsubscribe();
    };
  }, [connected, projectId, syncPresenceFromEditor]);
}
