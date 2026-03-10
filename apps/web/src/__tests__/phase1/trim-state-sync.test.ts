import { beforeEach, describe, expect, it } from 'vitest';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import { getTrimStateSnapshot, subscribeTrimStateToStore, syncTrimStateToStore } from '../../lib/trimStateBridge';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

describe('phase 1 trim state synchronization', () => {
  beforeEach(() => {
    trimEngine.setOverwriteTrim(false);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    } else {
      trimEngine.exitTrimMode();
    }
    useEditorStore.setState(initialState, true);
  });

  it('syncs an active roll trim session into the editor store', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'left',
              trackId: 'v1',
              name: 'Left',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 2,
              type: 'video',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Right',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);
    syncTrimStateToStore();

    const state = useEditorStore.getState();
    expect(state.trimActive).toBe(true);
    expect(state.trimMode).toBe('roll');
    expect(state.trimSelectionLabel).toBe('AB');
    expect(state.trimCounterFrames).toBe(0);
    expect(state.trimASideFrames).toBe(0);
    expect(state.trimBSideFrames).toBe(0);
  });

  it('updates the store as trim mode changes and exits', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'left',
              trackId: 'v1',
              name: 'Left',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 2,
              type: 'video',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Right',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
    });

    const unsubscribe = subscribeTrimStateToStore();
    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);
    expect(useEditorStore.getState().trimMode).toBe('roll');

    trimEngine.selectASide();
    expect(useEditorStore.getState().trimMode).toBe('ripple');
    expect(useEditorStore.getState().trimSelectionLabel).toBe('A');

    trimEngine.selectBothSides();
    expect(useEditorStore.getState().trimMode).toBe('roll');
    expect(useEditorStore.getState().trimSelectionLabel).toBe('AB');

    trimEngine.cancelTrim();
    expect(useEditorStore.getState().trimActive).toBe(false);
    expect(useEditorStore.getState().trimMode).toBe('off');
    expect(useEditorStore.getState().trimSelectionLabel).toBe('OFF');

    unsubscribe();
  });

  it('captures trim counter and asymmetric roller labels in snapshots', () => {
    useEditorStore.setState({
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'v1-left',
              trackId: 'v1',
              name: 'V1 Left',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 3,
              type: 'video',
            }),
            makeClip({
              id: 'v1-right',
              trackId: 'v1',
              name: 'V1 Right',
              startTime: 5,
              endTime: 10,
              trimStart: 3,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
        {
          id: 'a1',
          name: 'A1',
          type: 'AUDIO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#22c55e',
          clips: [
            makeClip({
              id: 'a1-left',
              trackId: 'a1',
              name: 'A1 Left',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 3,
              type: 'audio',
            }),
            makeClip({
              id: 'a1-right',
              trackId: 'a1',
              name: 'A1 Right',
              startTime: 5,
              endTime: 10,
              trimStart: 3,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
      ],
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
    });

    trimEngine.enterTrimMode(['v1', 'a1'], 5, TrimSide.BOTH);
    trimEngine.setAsymmetricRoller('a1', TrimSide.A_SIDE);
    trimEngine.trimByFrames(2, 24);

    const snapshot = getTrimStateSnapshot();
    expect(snapshot.trimMode).toBe('asymmetric');
    expect(snapshot.trimSelectionLabel).toBe('ASYM');
    expect(snapshot.trimCounterFrames).toBe(2);
    expect(snapshot.trimASideFrames).toBe(-2);
    expect(snapshot.trimBSideFrames).toBe(2);
  });

  it('falls back to all tracks for edit-point navigation when no targets are enabled', () => {
    useEditorStore.setState({
      enabledTrackIds: [],
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          type: 'VIDEO',
          sortOrder: 0,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#5b6af5',
          clips: [
            makeClip({
              id: 'clip-1',
              trackId: 'v1',
              name: 'Clip 1',
              startTime: 2,
              endTime: 6,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      playheadTime: 0,
    });

    useEditorStore.getState().goToNextEditPoint();
    expect(useEditorStore.getState().playheadTime).toBe(2);
  });
});
