import { beforeEach, describe, expect, it } from 'vitest';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import {
  resolveTrimMonitorPreview,
  type TrimMonitorPreviewState,
} from '../../lib/trimMonitorPreview';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialEditorState = useEditorStore.getState();

function buildPreviewState(): TrimMonitorPreviewState {
  const state = useEditorStore.getState();
  return {
    tracks: state.tracks,
    bins: state.bins,
    selectedTrackId: state.selectedTrackId,
    enabledTrackIds: state.enabledTrackIds,
    videoMonitorTrackId: state.videoMonitorTrackId,
    sequenceSettings: { fps: state.sequenceSettings.fps },
    projectSettings: { frameRate: state.projectSettings.frameRate },
  };
}

describe('trim monitor preview', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    }
  });

  it('resolves outgoing and incoming trim frames for a standard roll trim', () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-left', name: 'Left Clip', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-right', name: 'Right Clip', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
        },
      ],
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
              trimEnd: 4,
              type: 'video',
              assetId: 'asset-left',
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
              assetId: 'asset-right',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);

    const preview = resolveTrimMonitorPreview(buildPreviewState(), trimEngine.getState());

    expect(preview.active).toBe(true);
    expect(preview.selectionLabel).toBe('AB');
    expect(preview.aSide?.clipId).toBe('left');
    expect(preview.bSide?.clipId).toBe('right');
    expect(preview.aSide?.trackId).toBe('v1');
    expect(preview.bSide?.trackId).toBe('v1');
    expect(preview.aSide?.sourceTime).toBeCloseTo(4.9791666, 4);
    expect(preview.bSide?.sourceTime).toBeCloseTo(2.0208333, 4);
  });

  it('prefers the asymmetrically selected track per monitor side', () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-v1-a', name: 'V1 Left', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-v1-b', name: 'V1 Right', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-v2-a', name: 'V2 Left', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-v2-b', name: 'V2 Right', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
        },
      ],
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
              trimEnd: 4,
              type: 'video',
              assetId: 'asset-v1-a',
            }),
            makeClip({
              id: 'v1-right',
              trackId: 'v1',
              name: 'V1 Right',
              startTime: 5,
              endTime: 10,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-v1-b',
            }),
          ],
        },
        {
          id: 'v2',
          name: 'V2',
          type: 'VIDEO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#818cf8',
          clips: [
            makeClip({
              id: 'v2-left',
              trackId: 'v2',
              name: 'V2 Left',
              startTime: 0,
              endTime: 5,
              trimStart: 1,
              trimEnd: 3,
              type: 'video',
              assetId: 'asset-v2-a',
            }),
            makeClip({
              id: 'v2-right',
              trackId: 'v2',
              name: 'V2 Right',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-v2-b',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1', 'v2'],
      videoMonitorTrackId: 'v1',
    });

    trimEngine.enterTrimMode(['v1', 'v2'], 5, TrimSide.BOTH);
    trimEngine.setAsymmetricRoller('v1', TrimSide.A_SIDE);
    trimEngine.setAsymmetricRoller('v2', TrimSide.B_SIDE);

    const preview = resolveTrimMonitorPreview(buildPreviewState(), trimEngine.getState());

    expect(preview.selectionLabel).toBe('ASYM');
    expect(preview.aSide?.trackId).toBe('v1');
    expect(preview.bSide?.trackId).toBe('v2');
    expect(preview.aSide?.selected).toBe(true);
    expect(preview.bSide?.selected).toBe(true);
  });

  it('maps slip mode to source-head and source-tail monitor previews', () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-main', name: 'Main Clip', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
        },
      ],
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
              id: 'main',
              trackId: 'v1',
              name: 'Main',
              startTime: 2,
              endTime: 6,
              trimStart: 3,
              trimEnd: 5,
              type: 'video',
              assetId: 'asset-main',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 4,
    });

    trimEngine.enterTrimMode(['v1'], 4, TrimSide.BOTH);
    trimEngine.cycleTrimMode();

    const preview = resolveTrimMonitorPreview(buildPreviewState(), trimEngine.getState());

    expect(preview.sourceMonitor?.monitorLabel).toBe('SLIP IN');
    expect(preview.recordMonitor?.monitorLabel).toBe('SLIP OUT');
    expect(preview.sourceMonitor?.sourceTime).toBeCloseTo(3.0208333, 4);
    expect(preview.recordMonitor?.sourceTime).toBeCloseTo(6.9791666, 4);
  });

  it('maps slide mode to surrounding cut previews', () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-left', name: 'Left', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-mid', name: 'Middle', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-right', name: 'Right', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
        },
      ],
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
              endTime: 3,
              trimStart: 0,
              trimEnd: 4,
              type: 'video',
              assetId: 'asset-left',
            }),
            makeClip({
              id: 'middle',
              trackId: 'v1',
              name: 'Middle',
              startTime: 3,
              endTime: 6,
              trimStart: 1,
              trimEnd: 1,
              type: 'video',
              assetId: 'asset-mid',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Right',
              startTime: 6,
              endTime: 9,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-right',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      playheadTime: 3,
    });

    trimEngine.enterTrimMode(['v1'], 3, TrimSide.BOTH);
    trimEngine.cycleTrimMode();
    trimEngine.cycleTrimMode();

    const preview = resolveTrimMonitorPreview(buildPreviewState(), trimEngine.getState());

    expect(preview.sourceMonitor?.monitorLabel).toBe('SLIDE LEFT');
    expect(preview.recordMonitor?.monitorLabel).toBe('SLIDE RIGHT');
    expect(preview.sourceMonitor?.clipId).toBe('left');
    expect(preview.recordMonitor?.clipId).toBe('right');
    expect(preview.sourceMonitor?.monitorContext).toBe('PREV CUT');
    expect(preview.recordMonitor?.monitorContext).toBe('NEXT CUT');
  });
});
