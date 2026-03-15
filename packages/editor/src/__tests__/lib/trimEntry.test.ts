import { describe, expect, it } from 'vitest';
import { TrimSide } from '../../engine/TrimEngine';
import { resolveTrimEntryTarget } from '../../lib/trimEntry';
import { makeClip } from '../../store/editor.store';

describe('trim entry', () => {
  it('locks trim entry to a single shared cut across focused tracks', () => {
    const target = resolveTrimEntryTarget({
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
              trimStart: 2,
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
              trimStart: 2,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
        {
          id: 'v2',
          name: 'V2',
          type: 'VIDEO',
          sortOrder: 2,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#818cf8',
          clips: [
            makeClip({
              id: 'v2-only',
              trackId: 'v2',
              name: 'V2 Only',
              startTime: 7,
              endTime: 12,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1', 'a1', 'v2'],
      videoMonitorTrackId: 'v1',
      sequenceSettings: { fps: 24 },
      projectSettings: { frameRate: 24 },
      playheadTime: 5.1,
    });

    expect(target).not.toBeNull();
    expect(target?.anchorTrackId).toBe('v1');
    expect(target?.editPointTime).toBe(5);
    expect(target?.trackIds).toEqual(['v1', 'a1']);
    expect(target?.rollerSelections).toEqual([
      { trackId: 'v1', editPointTime: 5, side: TrimSide.BOTH },
      { trackId: 'a1', editPointTime: 5, side: TrimSide.BOTH },
    ]);
  });

  it('honors an explicit anchor track and side selection', () => {
    const target = resolveTrimEntryTarget({
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
              name: 'Left',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 1,
              type: 'video',
            }),
            makeClip({
              id: 'v1-right',
              trackId: 'v1',
              name: 'Right',
              startTime: 4,
              endTime: 8,
              trimStart: 1,
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
              name: 'Audio Left',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 1,
              type: 'audio',
            }),
            makeClip({
              id: 'a1-right',
              trackId: 'a1',
              name: 'Audio Right',
              startTime: 4,
              endTime: 8,
              trimStart: 1,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
      ],
      selectedTrackId: 'a1',
      enabledTrackIds: ['v1', 'a1'],
      videoMonitorTrackId: 'v1',
      sequenceSettings: { fps: 24 },
      projectSettings: { frameRate: 24 },
      playheadTime: 3.8,
    }, {
      anchorTrackId: 'a1',
      editPointTime: 4,
      side: TrimSide.B_SIDE,
    });

    expect(target).toEqual(expect.objectContaining({
      anchorTrackId: 'a1',
      editPointTime: 4,
      trackIds: ['a1', 'v1'],
      side: TrimSide.B_SIDE,
      rollerSelections: [
        { trackId: 'a1', editPointTime: 4, side: TrimSide.B_SIDE },
        { trackId: 'v1', editPointTime: 4, side: TrimSide.B_SIDE },
      ],
    }));
  });

  it('uses explicit cut selections to build an asymmetrical trim entry group', () => {
    const target = resolveTrimEntryTarget({
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
              name: 'Left',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 1,
              type: 'video',
            }),
            makeClip({
              id: 'v1-right',
              trackId: 'v1',
              name: 'Right',
              startTime: 4,
              endTime: 8,
              trimStart: 1,
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
              name: 'Audio Left',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 1,
              type: 'audio',
            }),
            makeClip({
              id: 'a1-right',
              trackId: 'a1',
              name: 'Audio Right',
              startTime: 4,
              endTime: 8,
              trimStart: 1,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      selectedTrimEditPoints: [
        { trackId: 'v1', editPointTime: 4, side: 'A_SIDE' },
        { trackId: 'a1', editPointTime: 4, side: 'B_SIDE' },
      ],
      enabledTrackIds: ['v1', 'a1'],
      videoMonitorTrackId: 'v1',
      sequenceSettings: { fps: 24 },
      projectSettings: { frameRate: 24 },
      playheadTime: 2,
    });

    expect(target).toEqual(expect.objectContaining({
      anchorTrackId: 'v1',
      editPointTime: 4,
      trackIds: ['v1', 'a1'],
      side: TrimSide.BOTH,
      rollerSelections: [
        { trackId: 'v1', editPointTime: 4, side: TrimSide.A_SIDE },
        { trackId: 'a1', editPointTime: 4, side: TrimSide.B_SIDE },
      ],
    }));
  });

  it('preserves explicitly selected cuts across different edit times', () => {
    const target = resolveTrimEntryTarget({
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
              name: 'Left',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 1,
              type: 'video',
            }),
            makeClip({
              id: 'v1-right',
              trackId: 'v1',
              name: 'Right',
              startTime: 4,
              endTime: 8,
              trimStart: 1,
              trimEnd: 0,
              type: 'video',
            }),
            makeClip({
              id: 'v1-tail',
              trackId: 'v1',
              name: 'Tail',
              startTime: 8,
              endTime: 12,
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
          color: '#22c55e',
          clips: [
            makeClip({
              id: 'a1-left',
              trackId: 'a1',
              name: 'Audio Left',
              startTime: 0,
              endTime: 6,
              trimStart: 0,
              trimEnd: 1,
              type: 'audio',
            }),
            makeClip({
              id: 'a1-right',
              trackId: 'a1',
              name: 'Audio Right',
              startTime: 6,
              endTime: 12,
              trimStart: 1,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
      ],
      selectedTrackId: 'a1',
      selectedTrimEditPoints: [
        { trackId: 'v1', editPointTime: 4, side: 'A_SIDE' },
        { trackId: 'a1', editPointTime: 6, side: 'B_SIDE' },
      ],
      enabledTrackIds: ['v1', 'a1'],
      videoMonitorTrackId: 'v1',
      sequenceSettings: { fps: 24 },
      projectSettings: { frameRate: 24 },
      playheadTime: 6,
    });

    expect(target).toEqual(expect.objectContaining({
      anchorTrackId: 'a1',
      editPointTime: 6,
      trackIds: ['a1', 'v1'],
      side: TrimSide.BOTH,
      rollerSelections: [
        { trackId: 'a1', editPointTime: 6, side: TrimSide.B_SIDE },
        { trackId: 'v1', editPointTime: 4, side: TrimSide.A_SIDE },
      ],
    }));
  });
});
