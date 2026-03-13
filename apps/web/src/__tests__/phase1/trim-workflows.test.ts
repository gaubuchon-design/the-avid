import { beforeEach, describe, expect, it } from 'vitest';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

function makeTrimTrack(trackId: string, type: 'VIDEO' | 'AUDIO', color: string) {
  return {
    id: trackId,
    name: trackId.toUpperCase(),
    type,
    sortOrder: type === 'VIDEO' ? 0 : 1,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    color,
    clips: [
      makeClip({
        id: `${trackId}-left`,
        trackId,
        name: `${trackId} Left`,
        startTime: 0,
        endTime: 5,
        trimStart: 0,
        trimEnd: 3,
        type: type === 'VIDEO' ? 'video' : 'audio',
      }),
      makeClip({
        id: `${trackId}-right`,
        trackId,
        name: `${trackId} Right`,
        startTime: 5,
        endTime: 10,
        trimStart: 3,
        trimEnd: 0,
        type: type === 'VIDEO' ? 'video' : 'audio',
      }),
      makeClip({
        id: `${trackId}-tail`,
        trackId,
        name: `${trackId} Tail`,
        startTime: 10,
        endTime: 15,
        trimStart: 0,
        trimEnd: 0,
        type: type === 'VIDEO' ? 'video' : 'audio',
      }),
    ],
  };
}

describe('phase 1 trim workflows', () => {
  beforeEach(() => {
    trimEngine.setOverwriteTrim(false);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    } else {
      trimEngine.exitTrimMode();
    }

    useEditorStore.setState(initialState, true);
    useEditorStore.setState({
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
    });
  });

  it('ripple trims the A-side and shifts downstream clips', () => {
    useEditorStore.setState({
      tracks: [makeTrimTrack('v1', 'VIDEO', '#5b6af5')],
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.A_SIDE);
    trimEngine.trimByFrames(24, 24);

    const clips = useEditorStore.getState().tracks[0]!.clips;
    const left = clips.find((clip) => clip.id === 'v1-left');
    const right = clips.find((clip) => clip.id === 'v1-right');
    const tail = clips.find((clip) => clip.id === 'v1-tail');

    expect(left!.endTime).toBe(6);
    expect(left!.trimEnd).toBe(2);
    expect(right!.startTime).toBe(6);
    expect(right!.endTime).toBe(11);
    expect(tail!.startTime).toBe(11);
    expect(tail!.endTime).toBe(16);
  });

  it('supports overwrite trim without rippling sequence duration', () => {
    useEditorStore.setState({
      tracks: [makeTrimTrack('v1', 'VIDEO', '#5b6af5')],
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.A_SIDE);
    trimEngine.setOverwriteTrim(true);
    const result = trimEngine.trimByFrames(24, 24);

    const clips = useEditorStore.getState().tracks[0]!.clips;
    const left = clips.find((clip) => clip.id === 'v1-left');
    const right = clips.find((clip) => clip.id === 'v1-right');
    const tail = clips.find((clip) => clip.id === 'v1-tail');

    expect(result.durationChange).toBe(0);
    expect(left!.endTime).toBe(6);
    expect(right!.startTime).toBe(5);
    expect(tail!.startTime).toBe(10);
  });

  it('applies asymmetric trims independently across tracks', () => {
    useEditorStore.setState({
      tracks: [
        makeTrimTrack('v1', 'VIDEO', '#5b6af5'),
        makeTrimTrack('a1', 'AUDIO', '#22c55e'),
      ],
    });

    trimEngine.enterTrimMode(['v1', 'a1'], 5, TrimSide.BOTH);
    trimEngine.setAsymmetricRoller('v1', TrimSide.A_SIDE);
    trimEngine.setAsymmetricRoller('a1', TrimSide.B_SIDE);
    trimEngine.trimByFrames(24, 24);

    const [videoTrack, audioTrack] = useEditorStore.getState().tracks;
    const videoLeft = videoTrack!.clips.find((clip) => clip.id === 'v1-left');
    const videoRight = videoTrack!.clips.find((clip) => clip.id === 'v1-right');
    const audioLeft = audioTrack!.clips.find((clip) => clip.id === 'a1-left');
    const audioRight = audioTrack!.clips.find((clip) => clip.id === 'a1-right');

    expect(trimEngine.getCurrentMode()).toBe('ASYMMETRIC');
    expect(videoLeft!.endTime).toBe(6);
    expect(videoRight!.startTime).toBe(6);
    expect(audioLeft!.endTime).toBe(5);
    expect(audioRight!.startTime).toBe(6);
  });

  it('recalls the previous trim configuration including slip mode', () => {
    useEditorStore.setState({
      tracks: [makeTrimTrack('v1', 'VIDEO', '#5b6af5')],
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);
    trimEngine.cycleTrimMode();
    trimEngine.exitTrimMode();

    const recalledState = trimEngine.recallPreviousConfiguration();

    expect(recalledState.active).toBe(true);
    expect(trimEngine.getCurrentMode()).toBe('SLIP');
    expect(recalledState.rollers.find((roller) => roller.trackId === 'v1')?.side).toBe(TrimSide.BOTH);
  });

  it('recalls an explicit multi-cut trim configuration without collapsing edit times', () => {
    useEditorStore.setState({
      tracks: [
        makeTrimTrack('v1', 'VIDEO', '#5b6af5'),
        {
          ...makeTrimTrack('a1', 'AUDIO', '#22c55e'),
          clips: [
            makeClip({
              id: 'a1-left',
              trackId: 'a1',
              name: 'a1 Left',
              startTime: 0,
              endTime: 6,
              trimStart: 0,
              trimEnd: 3,
              type: 'audio',
            }),
            makeClip({
              id: 'a1-right',
              trackId: 'a1',
              name: 'a1 Right',
              startTime: 6,
              endTime: 11,
              trimStart: 3,
              trimEnd: 0,
              type: 'audio',
            }),
          ],
        },
      ],
    });

    trimEngine.enterTrimModeWithSelections([
      { trackId: 'v1', editPointTime: 5, side: TrimSide.A_SIDE },
      { trackId: 'a1', editPointTime: 6, side: TrimSide.B_SIDE },
    ]);
    trimEngine.exitTrimMode();

    const recalledState = trimEngine.recallPreviousConfiguration();

    expect(recalledState.active).toBe(true);
    expect(recalledState.rollers).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackId: 'v1', editPointTime: 5, side: TrimSide.A_SIDE }),
      expect.objectContaining({ trackId: 'a1', editPointTime: 6, side: TrimSide.B_SIDE }),
    ]));
    expect(trimEngine.getCurrentMode()).toBe('ASYMMETRIC');
  });
});
