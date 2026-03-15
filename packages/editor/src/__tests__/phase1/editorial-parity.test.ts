import { beforeEach, describe, expect, it } from 'vitest';
import { editEngine } from '../../engine/EditEngine';
import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();

describe('phase 1 editorial parity', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
    usePlayerStore.setState(initialPlayerState, true);
    editEngine.clear();
    trackPatchingEngine.reset();
  });

  it('preserves head and tail media when overwrite lands inside an existing clip', () => {
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
              id: 'base',
              trackId: 'v1',
              name: 'Existing',
              startTime: 0,
              endTime: 10,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      playheadTime: 5,
      sourceAsset: {
        id: 'src-1',
        name: 'Source Shot',
        type: 'VIDEO',
        duration: 8,
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      sourceInPoint: 1,
      sourceOutPoint: 3,
      duration: 20,
    });

    useEditorStore.getState().overwriteEdit();

    const clips = useEditorStore.getState().tracks[0]!.clips.slice().sort((a, b) => a.startTime - b.startTime);
    expect(clips).toHaveLength(3);
    expect(clips[0]!.startTime).toBe(0);
    expect(clips[0]!.endTime).toBe(5);
    expect(clips[1]!.name).toBe('Source Shot');
    expect(clips[1]!.startTime).toBe(5);
    expect(clips[1]!.endTime).toBe(7);
    expect(clips[1]!.trimStart).toBe(1);
    expect(clips[1]!.trimEnd).toBe(5);
    expect(clips[2]!.startTime).toBe(7);
    expect(clips[2]!.endTime).toBe(10);
  });

  it('pushes sync-locked non-edited tracks during splice-in edits', () => {
    trackPatchingEngine.toggleSyncLock('a1');

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
              id: 'v1-a',
              trackId: 'v1',
              name: 'Video A',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
            makeClip({
              id: 'v1-b',
              trackId: 'v1',
              name: 'Video B',
              startTime: 10,
              endTime: 15,
              trimStart: 0,
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
          color: '#4ade80',
          clips: [
            makeClip({
              id: 'a1-a',
              trackId: 'a1',
              name: 'Audio A',
              startTime: 10,
              endTime: 15,
              trimStart: 0,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      playheadTime: 5,
      sourceAsset: {
        id: 'src-2',
        name: 'Inserted Shot',
        type: 'VIDEO',
        duration: 2,
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      sourceInPoint: 0,
      sourceOutPoint: 2,
      duration: 20,
    });

    useEditorStore.getState().insertEdit();

    const [videoTrack, audioTrack] = useEditorStore.getState().tracks;
    const insertedClip = videoTrack!.clips.find((clip) => clip.name === 'Inserted Shot');
    const shiftedVideo = videoTrack!.clips.find((clip) => clip.id === 'v1-b');
    const shiftedAudio = audioTrack!.clips.find((clip) => clip.id === 'a1-a');

    expect(insertedClip).toBeDefined();
    expect(insertedClip!.startTime).toBe(5);
    expect(insertedClip!.endTime).toBe(7);
    expect(shiftedVideo!.startTime).toBe(12);
    expect(shiftedVideo!.endTime).toBe(17);
    expect(shiftedAudio!.startTime).toBe(12);
    expect(shiftedAudio!.endTime).toBe(17);
  });

  it('targets patched record tracks instead of the selected track during overwrite', () => {
    trackPatchingEngine.setSourceTracks([{ id: 'src-v1', type: 'VIDEO', index: 1 }]);
    trackPatchingEngine.patchSourceToRecord('src-v1', 'v2');
    trackPatchingEngine.enableRecordTrack('v2');

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
          clips: [],
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
          clips: [],
        },
      ],
      selectedTrackId: 'v1',
      playheadTime: 4,
      sourceAsset: {
        id: 'src-3',
        name: 'Patched Shot',
        type: 'VIDEO',
        duration: 3,
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      sourceInPoint: 0,
      sourceOutPoint: 3,
      duration: 20,
    });

    useEditorStore.getState().overwriteEdit();

    const [track1, track2] = useEditorStore.getState().tracks;
    expect(track1!.clips).toHaveLength(0);
    expect(track2!.clips).toHaveLength(1);
    expect(track2!.clips[0]!.name).toBe('Patched Shot');
    expect(track2!.clips[0]!.startTime).toBe(4);
    expect(track2!.clips[0]!.endTime).toBe(7);
  });

  it('ignores disabled source patches during overwrite targeting', () => {
    trackPatchingEngine.setSourceTracks([{ id: 'src-v1', type: 'VIDEO', index: 1 }]);
    trackPatchingEngine.patchSourceToRecord('src-v1', 'v2');
    trackPatchingEngine.setPatchEnabled('src-v1', false);
    trackPatchingEngine.enableRecordTrack('v2');

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
          clips: [],
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
          clips: [],
        },
      ],
      selectedTrackId: 'v1',
      playheadTime: 4,
      sourceAsset: {
        id: 'src-3b',
        name: 'Selected Track Shot',
        type: 'VIDEO',
        duration: 3,
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      sourceInPoint: 0,
      sourceOutPoint: 3,
      duration: 20,
    });

    useEditorStore.getState().overwriteEdit();

    const [track1, track2] = useEditorStore.getState().tracks;
    expect(track1!.clips).toHaveLength(1);
    expect(track1!.clips[0]!.name).toBe('Selected Track Shot');
    expect(track2!.clips).toHaveLength(0);
  });

  it('match frame opens the source monitor on the topmost active media clip', () => {
    const baseAsset = {
      id: 'asset-video-1',
      name: 'Interview',
      type: 'VIDEO' as const,
      status: 'READY' as const,
      tags: [],
      isFavorite: false,
    };
    const overlayAsset = {
      id: 'asset-video-2',
      name: 'B-roll',
      type: 'VIDEO' as const,
      status: 'READY' as const,
      tags: [],
      isFavorite: false,
    };

    usePlayerStore.setState({ activeMonitor: 'record' });
    useEditorStore.setState({
      bins: [
        {
          id: 'b-master',
          name: 'Master',
          color: '#5b6af5',
          children: [],
          assets: [baseAsset, overlayAsset],
          isOpen: true,
          sequences: [],
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
              id: 'clip-v1',
              assetId: baseAsset.id,
              trackId: 'v1',
              name: 'Base Clip',
              startTime: 10,
              endTime: 14,
              trimStart: 3,
              trimEnd: 0,
              type: 'video',
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
              id: 'clip-v2',
              assetId: overlayAsset.id,
              trackId: 'v2',
              name: 'Overlay Clip',
              startTime: 10,
              endTime: 14,
              trimStart: 7,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
        {
          id: 'g1',
          name: 'G1',
          type: 'GRAPHIC',
          sortOrder: 2,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#f59e0b',
          clips: [
            makeClip({
              id: 'clip-title',
              assetId: 'title-1',
              trackId: 'g1',
              name: 'Title Overlay',
              startTime: 10,
              endTime: 14,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      playheadTime: 11.5,
      sourceAsset: null,
      sourcePlayhead: 0,
      inspectedClipId: null,
    });

    useEditorStore.getState().matchFrame();

    const state = useEditorStore.getState();
    expect(state.sourceAsset?.id).toBe(overlayAsset.id);
    expect(state.sourcePlayhead).toBe(8.5);
    expect(state.inspectedClipId).toBe('clip-v2');
    expect(usePlayerStore.getState().activeMonitor).toBe('source');
  });

  it('extracts selected segments with ripple and supports undo', () => {
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
              trimEnd: 0,
              type: 'video',
            }),
            makeClip({
              id: 'middle',
              trackId: 'v1',
              name: 'Middle',
              startTime: 5,
              endTime: 10,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Right',
              startTime: 10,
              endTime: 15,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      selectedClipIds: ['middle'],
      duration: 15,
    });

    useEditorStore.getState().extractSelection();

    let clips = useEditorStore.getState().tracks[0]!.clips;
    expect(clips.map((clip) => [clip.id, clip.startTime, clip.endTime])).toEqual([
      ['left', 0, 5],
      ['right', 5, 10],
    ]);
    expect(editEngine.undoCount).toBe(1);

    expect(editEngine.undo()).toBe(true);

    clips = useEditorStore.getState().tracks[0]!.clips;
    expect(clips.map((clip) => [clip.id, clip.startTime, clip.endTime])).toEqual([
      ['left', 0, 5],
      ['middle', 5, 10],
      ['right', 10, 15],
    ]);
  });

  it('extracts a marked record range and clears the marks after the edit', () => {
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
              endTime: 4,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Right',
              startTime: 8,
              endTime: 12,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      enabledTrackIds: ['v1'],
      playheadTime: 6,
      inPoint: 4,
      outPoint: 8,
      duration: 14,
    });

    useEditorStore.getState().extractSelection();

    const state = useEditorStore.getState();
    expect(state.tracks[0]!.clips.map((clip) => [clip.id, clip.startTime, clip.endTime])).toEqual([
      ['left', 0, 4],
      ['right', 4, 8],
    ]);
    expect(state.playheadTime).toBe(4);
    expect(state.inPoint).toBeNull();
    expect(state.outPoint).toBeNull();
    expect(editEngine.undoCount).toBe(1);
  });
});
