import { beforeEach, describe, expect, it } from 'vitest';

import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';
import { subscribeTrackPatchingStateToStore, syncTrackPatchingStateToStore } from '../../lib/trackPatchingStateBridge';
import { useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

describe('phase 1 track patching synchronization', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
    trackPatchingEngine.reset();
  });

  it('syncs engine state into the editor store', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
        {
          id: 't-a1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#22c55e',
          clips: [],
        },
      ],
    });
    trackPatchingEngine.setSourceTracks([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
    ]);
    trackPatchingEngine.patchSourceToRecord('src-v1', 't-v1');
    trackPatchingEngine.patchSourceToRecord('src-a1', 't-a1');
    trackPatchingEngine.enableRecordTrack('t-v1');
    trackPatchingEngine.enableRecordTrack('t-a1');
    trackPatchingEngine.toggleSyncLock('t-a1');
    trackPatchingEngine.setVideoMonitorTrack('t-v1');

    syncTrackPatchingStateToStore();

    const state = useEditorStore.getState();
    expect(state.enabledTrackIds).toEqual(['t-v1', 't-a1']);
    expect(state.syncLockedTrackIds).toEqual(['t-a1']);
    expect(state.videoMonitorTrackId).toBe('t-v1');
    expect(state.trackPatchLabels).toEqual(['V1->V1', 'A1->A1']);
  });

  it('keeps the store updated while subscribed to engine changes', () => {
    const unsubscribe = subscribeTrackPatchingStateToStore();

    trackPatchingEngine.enableRecordTrack('t-v2');
    trackPatchingEngine.toggleSyncLock('t-v2');

    let state = useEditorStore.getState();
    expect(state.enabledTrackIds).toContain('t-v2');
    expect(state.syncLockedTrackIds).toContain('t-v2');

    trackPatchingEngine.disableRecordTrack('t-v2');
    trackPatchingEngine.toggleSyncLock('t-v2');

    state = useEditorStore.getState();
    expect(state.enabledTrackIds).not.toContain('t-v2');
    expect(state.syncLockedTrackIds).not.toContain('t-v2');

    unsubscribe();
  });

  it('syncs mute, solo, and lock state from the engine into track flags', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
      ],
    });

    trackPatchingEngine.toggleMute('t-v1');
    trackPatchingEngine.toggleSolo('t-v1');
    trackPatchingEngine.toggleTrackLock('t-v1');

    syncTrackPatchingStateToStore();

    const track = useEditorStore.getState().tracks[0]!;
    expect(track.muted).toBe(true);
    expect(track.solo).toBe(true);
    expect(track.locked).toBe(true);
  });

  it('updates the engine when store patching actions are used', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
      ],
    });
    const state = useEditorStore.getState();

    state.enableTrack('t-v1');
    state.toggleSyncLock('t-v1');
    state.setVideoMonitorTrack('t-v1');
    state.toggleMute('t-v1');
    state.toggleSolo('t-v1');

    expect(trackPatchingEngine.isRecordTrackEnabled('t-v1')).toBe(true);
    expect(trackPatchingEngine.isSyncLocked('t-v1')).toBe(true);
    expect(trackPatchingEngine.getVideoMonitorTrack()).toBe('t-v1');
    expect(trackPatchingEngine.isMuted('t-v1')).toBe(true);
    expect(trackPatchingEngine.isSoloed('t-v1')).toBe(true);

    state.toggleLock('t-v1');

    expect(trackPatchingEngine.isTrackLocked('t-v1')).toBe(true);
    expect(trackPatchingEngine.isRecordTrackEnabled('t-v1')).toBe(false);

    state.disableTrack('t-v1');
    state.toggleSyncLock('t-v1');
    state.toggleMute('t-v1');
    state.toggleSolo('t-v1');
    state.toggleLock('t-v1');

    expect(trackPatchingEngine.isRecordTrackEnabled('t-v1')).toBe(false);
    expect(trackPatchingEngine.isSyncLocked('t-v1')).toBe(false);
    expect(trackPatchingEngine.isMuted('t-v1')).toBe(false);
    expect(trackPatchingEngine.isSoloed('t-v1')).toBe(false);
    expect(trackPatchingEngine.isTrackLocked('t-v1')).toBe(false);
  });

  it('round-trips persisted source context and patch maps through engine snapshots', () => {
    trackPatchingEngine.setSourceContext('asset-source', [
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
    ]);
    trackPatchingEngine.patchSourceToRecord('src-v1', 't-v1');
    trackPatchingEngine.patchSourceToRecord('src-a1', 't-a1');
    trackPatchingEngine.enableRecordTrack('t-v1');
    trackPatchingEngine.toggleSyncLock('t-a1');

    const snapshot = trackPatchingEngine.getState();

    trackPatchingEngine.reset();
    trackPatchingEngine.restoreState(snapshot);

    expect(trackPatchingEngine.getSourceAssetId()).toBe('asset-source');
    expect(trackPatchingEngine.getSourceTracks()).toEqual([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
      { id: 'src-a1', type: 'AUDIO', index: 1 },
    ]);
    expect(trackPatchingEngine.getPatches()).toEqual([
      {
        sourceTrackId: 'src-v1',
        sourceTrackType: 'VIDEO',
        sourceTrackIndex: 1,
        recordTrackId: 't-v1',
        enabled: true,
      },
      {
        sourceTrackId: 'src-a1',
        sourceTrackType: 'AUDIO',
        sourceTrackIndex: 1,
        recordTrackId: 't-a1',
        enabled: true,
      },
    ]);
    expect(trackPatchingEngine.getEnabledRecordTracks()).toEqual(['t-v1']);
    expect(trackPatchingEngine.getSyncLockedTracks()).toEqual(['t-a1']);
  });

  it('keeps disabled source patches out of active patch labels while preserving their mapping', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 't-v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [],
        },
      ],
    });

    trackPatchingEngine.setSourceTracks([
      { id: 'src-v1', type: 'VIDEO', index: 1 },
    ]);
    trackPatchingEngine.patchSourceToRecord('src-v1', 't-v1');
    trackPatchingEngine.setPatchEnabled('src-v1', false);

    syncTrackPatchingStateToStore();

    expect(trackPatchingEngine.getRecordTrackForSource('src-v1')).toBe('t-v1');
    expect(useEditorStore.getState().trackPatchLabels).toEqual([]);
  });
});
