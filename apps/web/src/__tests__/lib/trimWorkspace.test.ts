import { beforeEach, describe, expect, it } from 'vitest';

import { trimEngine } from '../../engine/TrimEngine';
import {
  requestTrimWorkspace,
  scrubTimelineTimecodeTrack,
} from '../../lib/trimWorkspace';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { useUserSettingsStore } from '../../store/userSettings.store';

const initialState = useEditorStore.getState();

describe('trimWorkspace', () => {
  beforeEach(() => {
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    } else {
      trimEngine.exitTrimMode();
    }
    useEditorStore.setState(initialState, true);
    useUserSettingsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        trimViewPreference: 'preserve-last',
        trimRulerExitsTrim: true,
      },
    }));
  });

  it('enters trim from the selected cut context and selects the anchor track', () => {
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
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 5,
      activeTool: 'select',
    });

    const request = requestTrimWorkspace();

    expect(request.outcome).toBe('entered');
    expect(trimEngine.getState().active).toBe(true);
    expect(useEditorStore.getState().selectedTrackId).toBe('v1');
    expect(useEditorStore.getState().activeTool).toBe('trim');
  });

  it('toggles big and small trim view instead of re-entering trim when trim is already active', () => {
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
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 5,
      trimViewMode: 'small',
    });

    requestTrimWorkspace();
    const request = requestTrimWorkspace();

    expect(request.outcome).toBe('toggled-view');
    expect(trimEngine.getState().active).toBe(true);
    expect(useEditorStore.getState().trimViewMode).toBe('big');
  });

  it('honors the user trim view preference on trim entry', () => {
    useUserSettingsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        trimViewPreference: 'big',
      },
    }));
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
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 5,
      trimViewMode: 'small',
    });

    requestTrimWorkspace();

    expect(useEditorStore.getState().trimViewMode).toBe('big');
  });

  it('exits trim when the timecode track is scrubbed', () => {
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
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 5,
      duration: 10,
      activeTool: 'trim',
    });

    requestTrimWorkspace();
    scrubTimelineTimecodeTrack(2.5);

    expect(trimEngine.getState().active).toBe(false);
    expect(useEditorStore.getState().playheadTime).toBe(2.5);
  });

  it('keeps trim active on ruler scrub when the user disables trim exit from the timecode track', () => {
    useUserSettingsStore.setState((state) => ({
      ...state,
      settings: {
        ...state.settings,
        trimRulerExitsTrim: false,
      },
    }));
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
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 5,
      duration: 10,
      activeTool: 'trim',
    });

    requestTrimWorkspace();
    scrubTimelineTimecodeTrack(4);

    expect(trimEngine.getState().active).toBe(true);
    expect(useEditorStore.getState().playheadTime).toBe(4);
  });
});
