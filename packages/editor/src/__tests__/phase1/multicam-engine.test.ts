import { beforeEach, describe, expect, it } from 'vitest';
import { multicamEngine } from '../../engine/MulticamEngine';
import { useEditorStore } from '../../store/editor.store';

const initialEditorState = useEditorStore.getState();

describe('phase 1 multicam engine', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    multicamEngine.reset();
  });

  it('parks on a new angle without creating a cut, then records and applies multicam cuts to the timeline', () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'b-cam',
          name: 'Scene Bin',
          color: '#6b7280',
          isOpen: true,
          children: [],
          assets: [
            {
              id: 'cam-a',
              name: 'Camera A',
              type: 'VIDEO',
              status: 'READY',
              duration: 12,
              codec: 'ProRes',
              fps: 23.976,
              tags: [],
              isFavorite: false,
            },
            {
              id: 'cam-b',
              name: 'Camera B',
              type: 'VIDEO',
              status: 'READY',
              duration: 12,
              codec: 'H.264',
              fps: 23.976,
              tags: [],
              isFavorite: false,
            },
          ],
        },
      ],
      activeBinAssets: [
        {
          id: 'cam-a',
          name: 'Camera A',
          type: 'VIDEO',
          status: 'READY',
          duration: 12,
          codec: 'ProRes',
          fps: 23.976,
          tags: [],
          isFavorite: false,
        },
        {
          id: 'cam-b',
          name: 'Camera B',
          type: 'VIDEO',
          status: 'READY',
          duration: 12,
          codec: 'H.264',
          fps: 23.976,
          tags: [],
          isFavorite: false,
        },
      ],
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
          color: '#7f8ca3',
          clips: [],
        },
      ],
      playheadTime: 0,
    });

    const group = multicamEngine.createGroup('Interview', ['cam-a', 'cam-b'], 'timecode');
    multicamEngine.enterMulticamMode(group.id);

    multicamEngine.setActiveAngle(1);
    expect(multicamEngine.getState().activeAngleIndex).toBe(1);
    expect(multicamEngine.getCuts()).toHaveLength(0);

    useEditorStore.setState({ playheadTime: 3 });
    multicamEngine.cutToAngle(1);

    expect(multicamEngine.getCuts()).toHaveLength(1);
    expect(multicamEngine.getCuts()[0]?.angleIndex).toBe(1);

    const { clipIds } = multicamEngine.applyCutsToTimeline('t-v1');
    expect(clipIds).toHaveLength(1);
    expect(useEditorStore.getState().tracks[0]?.clips[0]?.assetId).toBe('cam-b');
  });

  it('flattens multicam edits back into normal timeline clips and exits multicam mode', () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'b-cam',
          name: 'Scene Bin',
          color: '#6b7280',
          isOpen: true,
          children: [],
          assets: [
            {
              id: 'cam-a',
              name: 'Camera A',
              type: 'VIDEO',
              status: 'READY',
              duration: 12,
              tags: [],
              isFavorite: false,
            },
            {
              id: 'cam-b',
              name: 'Camera B',
              type: 'VIDEO',
              status: 'READY',
              duration: 12,
              tags: [],
              isFavorite: false,
            },
          ],
        },
      ],
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
          color: '#7f8ca3',
          clips: [],
        },
      ],
      playheadTime: 0,
    });

    const group = multicamEngine.createGroup('Performance', ['cam-a', 'cam-b'], 'timecode');
    multicamEngine.enterMulticamMode(group.id);
    multicamEngine.cutToAngle(0);
    useEditorStore.setState({ playheadTime: 5 });
    multicamEngine.cutToAngle(1);

    multicamEngine.flattenMulticamToTimeline();

    expect(multicamEngine.isActive()).toBe(false);
    expect(useEditorStore.getState().tracks[0]?.clips.length).toBeGreaterThan(0);
  });

  it('derives deterministic waveform and slate-clap sync offsets from asset waveforms', async () => {
    const referenceWaveform = [0, 0, 0.08, 0.92, 0.44, 0.12, 0, 0];
    const delayedWaveform = [0, 0, 0, 0.08, 0.92, 0.44, 0.12, 0];

    useEditorStore.setState({
      bins: [
        {
          id: 'b-cam',
          name: 'Scene Bin',
          color: '#6b7280',
          isOpen: true,
          children: [],
          assets: [
            {
              id: 'cam-a',
              name: 'Camera A',
              type: 'VIDEO',
              status: 'READY',
              duration: 8,
              waveformData: referenceWaveform,
              tags: [],
              isFavorite: false,
            },
            {
              id: 'cam-b',
              name: 'Camera B',
              type: 'VIDEO',
              status: 'READY',
              duration: 8,
              waveformData: delayedWaveform,
              tags: [],
              isFavorite: false,
            },
          ],
        },
      ],
      activeBinAssets: [
        {
          id: 'cam-a',
          name: 'Camera A',
          type: 'VIDEO',
          status: 'READY',
          duration: 8,
          waveformData: referenceWaveform,
          tags: [],
          isFavorite: false,
        },
        {
          id: 'cam-b',
          name: 'Camera B',
          type: 'VIDEO',
          status: 'READY',
          duration: 8,
          waveformData: delayedWaveform,
          tags: [],
          isFavorite: false,
        },
      ],
    });

    const waveformGroup = multicamEngine.createGroup('Waveform Sync', ['cam-a', 'cam-b'], 'audio-waveform');
    expect(waveformGroup.angles[0]?.syncOffset).toBe(0);
    expect(waveformGroup.angles[1]?.syncOffset).toBeGreaterThan(0);

    const slateGroup = multicamEngine.createGroup('Slate Sync', ['cam-a', 'cam-b'], 'slate-clap');
    expect(slateGroup.angles[1]?.syncOffset).toBeGreaterThan(0);

    const resynced = await multicamEngine.resyncGroup(slateGroup.id, 'audio-waveform');
    expect(resynced?.angles[1]?.syncOffset).toBeCloseTo(waveformGroup.angles[1]?.syncOffset ?? 0, 3);
  });
});
