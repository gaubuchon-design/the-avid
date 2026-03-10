import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { editEngine } from '../../engine/EditEngine';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import { subscribeTrimHistoryToEditEngine } from '../../lib/trimHistoryBridge';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

function makeTrimTrack(trackId: string) {
  return {
    id: trackId,
    name: trackId.toUpperCase(),
    type: 'VIDEO' as const,
    sortOrder: 0,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    color: '#5b6af5',
    clips: [
      makeClip({
        id: `${trackId}-left`,
        trackId,
        name: `${trackId} Left`,
        startTime: 0,
        endTime: 5,
        trimStart: 0,
        trimEnd: 3,
        type: 'video',
      }),
      makeClip({
        id: `${trackId}-right`,
        trackId,
        name: `${trackId} Right`,
        startTime: 5,
        endTime: 10,
        trimStart: 3,
        trimEnd: 0,
        type: 'video',
      }),
      makeClip({
        id: `${trackId}-tail`,
        trackId,
        name: `${trackId} Tail`,
        startTime: 10,
        endTime: 15,
        trimStart: 0,
        trimEnd: 0,
        type: 'video',
      }),
    ],
  };
}

describe('phase 1 trim history bridge', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
    useEditorStore.setState({
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
      tracks: [makeTrimTrack('v1')],
    });
    editEngine.clear();
    trimEngine.setOverwriteTrim(false);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    } else {
      trimEngine.exitTrimMode();
    }
  });

  afterEach(() => {
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    }
  });

  it('records completed trim sessions in the undo stack', () => {
    const unsubscribe = subscribeTrimHistoryToEditEngine();

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.A_SIDE);
    trimEngine.trimByFrames(24, 24);
    trimEngine.exitTrimMode();

    let clips = useEditorStore.getState().tracks[0]!.clips;
    expect(editEngine.undoCount).toBe(1);
    expect(clips.find((clip) => clip.id === 'v1-left')!.endTime).toBe(6);
    expect(clips.find((clip) => clip.id === 'v1-right')!.startTime).toBe(6);

    expect(editEngine.undo()).toBe(true);

    clips = useEditorStore.getState().tracks[0]!.clips;
    expect(clips.find((clip) => clip.id === 'v1-left')!.endTime).toBe(5);
    expect(clips.find((clip) => clip.id === 'v1-right')!.startTime).toBe(5);

    expect(editEngine.redo()).toBe(true);

    clips = useEditorStore.getState().tracks[0]!.clips;
    expect(clips.find((clip) => clip.id === 'v1-left')!.endTime).toBe(6);
    expect(clips.find((clip) => clip.id === 'v1-right')!.startTime).toBe(6);

    unsubscribe();
  });

  it('does not record canceled trim sessions', () => {
    const unsubscribe = subscribeTrimHistoryToEditEngine();

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.A_SIDE);
    trimEngine.trimByFrames(24, 24);
    trimEngine.cancelTrim();

    const clips = useEditorStore.getState().tracks[0]!.clips;
    expect(editEngine.undoCount).toBe(0);
    expect(clips.find((clip) => clip.id === 'v1-left')!.endTime).toBe(5);
    expect(clips.find((clip) => clip.id === 'v1-right')!.startTime).toBe(5);

    unsubscribe();
  });
});
