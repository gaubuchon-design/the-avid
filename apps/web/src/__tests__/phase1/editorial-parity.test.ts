import { beforeEach, describe, expect, it } from 'vitest';
import { trackPatchingEngine } from '../../engine/TrackPatchingEngine';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

describe('phase 1 editorial parity', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
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
});
