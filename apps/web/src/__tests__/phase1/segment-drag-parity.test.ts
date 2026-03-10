import { beforeEach, describe, expect, it } from 'vitest';
import { smartToolEngine } from '../../engine/SmartToolEngine';
import { editEngine } from '../../engine/EditEngine';
import { SegmentMoveCommand } from '../../engine/commands';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialState = useEditorStore.getState();

function buildTrack(id: string, name: string, color: string) {
  return {
    id,
    name,
    type: 'VIDEO' as const,
    sortOrder: id === 'v1' ? 0 : 1,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    color,
    clips: [],
  };
}

describe('phase 1 segment drag parity', () => {
  beforeEach(() => {
    useEditorStore.setState(initialState, true);
    smartToolEngine.reset();
    editEngine.clear();
  });

  it('resolves upper and lower clip-body smart tool zones to overwrite and splice segment modes', () => {
    const upperZone = smartToolEngine.hitTest({
      x: 20,
      y: 8,
      timeAtX: 2,
      trackAtY: 'v1',
      clipAtPos: 'clip-v1',
      nearestEditPoint: 0,
      distanceToEdit: 20,
      relativeY: 0.2,
    });
    const lowerZone = smartToolEngine.hitTest({
      x: 20,
      y: 28,
      timeAtX: 2,
      trackAtY: 'v1',
      clipAtPos: 'clip-v1',
      nearestEditPoint: 0,
      distanceToEdit: 20,
      relativeY: 0.8,
    });

    expect(upperZone.mode).toBe('lift-overwrite-segment');
    expect(lowerZone.mode).toBe('extract-splice-segment');
  });

  it('resolves smart-tool trim zones near edit points', () => {
    const overwriteTrimZone = smartToolEngine.hitTest({
      x: 120,
      y: 8,
      timeAtX: 5.1,
      trackAtY: 'v1',
      clipAtPos: 'clip-v1',
      nearestEditPoint: 5,
      distanceToEdit: 6,
      relativeY: 0.2,
    });
    const rippleTrimZone = smartToolEngine.hitTest({
      x: 120,
      y: 28,
      timeAtX: 5.1,
      trackAtY: 'v1',
      clipAtPos: 'clip-v1',
      nearestEditPoint: 5,
      distanceToEdit: 6,
      relativeY: 0.8,
    });
    const rollTrimZone = smartToolEngine.hitTest({
      x: 120,
      y: 18,
      timeAtX: 5.01,
      trackAtY: 'v1',
      clipAtPos: 'clip-v1',
      nearestEditPoint: 5,
      distanceToEdit: 2,
      relativeY: 0.5,
    });

    expect(overwriteTrimZone.mode).toBe('overwrite-trim');
    expect(rippleTrimZone.mode).toBe('ripple-trim');
    expect(rollTrimZone.mode).toBe('roll-trim');
  });

  it('executes overwrite segment moves with undo support', () => {
    const sourceClip = makeClip({
      id: 'clip-v1',
      trackId: 'v1',
      name: 'Dragged Clip',
      startTime: 0,
      endTime: 4,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
    });
    const destinationClip = makeClip({
      id: 'clip-v2',
      trackId: 'v2',
      name: 'Destination Clip',
      startTime: 6,
      endTime: 10,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
    });

    useEditorStore.setState({
      tracks: [
        { ...buildTrack('v1', 'V1', '#5b6af5'), clips: [sourceClip] },
        { ...buildTrack('v2', 'V2', '#818cf8'), clips: [destinationClip] },
      ],
      selectedClipIds: ['clip-v1'],
      duration: 20,
    });

    editEngine.execute(new SegmentMoveCommand(['clip-v1'], 'v2', 6, 'overwrite'));

    let [track1, track2] = useEditorStore.getState().tracks;
    expect(track1!.clips).toHaveLength(0);
    expect(track2!.clips).toHaveLength(1);
    expect(track2!.clips[0]!.startTime).toBe(6);
    expect(track2!.clips[0]!.endTime).toBe(10);
    expect(track2!.clips[0]!.id).not.toBe('clip-v1');

    expect(editEngine.undo()).toBe(true);

    [track1, track2] = useEditorStore.getState().tracks;
    expect(track1!.clips).toHaveLength(1);
    expect(track1!.clips[0]!.id).toBe('clip-v1');
    expect(track2!.clips).toHaveLength(1);
    expect(track2!.clips[0]!.id).toBe('clip-v2');
  });

  it('executes splice segment moves by rippling destination content', () => {
    const sourceClip = makeClip({
      id: 'clip-v1',
      trackId: 'v1',
      name: 'Dragged Clip',
      startTime: 0,
      endTime: 4,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
    });
    const destinationClip = makeClip({
      id: 'clip-v2',
      trackId: 'v2',
      name: 'Destination Clip',
      startTime: 6,
      endTime: 10,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
    });

    useEditorStore.setState({
      tracks: [
        { ...buildTrack('v1', 'V1', '#5b6af5'), clips: [sourceClip] },
        { ...buildTrack('v2', 'V2', '#818cf8'), clips: [destinationClip] },
      ],
      selectedClipIds: ['clip-v1'],
      duration: 20,
    });

    editEngine.execute(new SegmentMoveCommand(['clip-v1'], 'v2', 6, 'splice'));

    const [, track2] = useEditorStore.getState().tracks;
    const clips = track2!.clips.slice().sort((a, b) => a.startTime - b.startTime);

    expect(clips).toHaveLength(2);
    expect(clips[0]!.startTime).toBe(6);
    expect(clips[0]!.endTime).toBe(10);
    expect(clips[1]!.startTime).toBe(10);
    expect(clips[1]!.endTime).toBe(14);
  });
});
