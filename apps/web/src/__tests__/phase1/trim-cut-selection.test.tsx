import React, { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { ClipView } from '../../components/TimelinePanel/ClipView';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import { enterTrimModeFromContext } from '../../lib/trimEntry';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialEditorState = useEditorStore.getState();

describe('phase 1 trim cut selection', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    }
  });

  it('selects cut points from clip handles and enters asymmetrical trim from the selected group', async () => {
    const videoTrack = {
      id: 'v1',
      name: 'V1',
      type: 'VIDEO' as const,
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
          name: 'Video Left',
          startTime: 0,
          endTime: 4,
          trimStart: 0,
          trimEnd: 1,
          type: 'video',
        }),
        makeClip({
          id: 'v1-right',
          trackId: 'v1',
          name: 'Video Right',
          startTime: 4,
          endTime: 8,
          trimStart: 1,
          trimEnd: 0,
          type: 'video',
        }),
      ],
    };
    const audioTrack = {
      id: 'a1',
      name: 'A1',
      type: 'AUDIO' as const,
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
    };

    useEditorStore.setState({
      tracks: [videoTrack, audioTrack],
      duration: 8,
      zoom: 60,
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1', 'a1'],
      videoMonitorTrackId: 'v1',
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <div style={{ position: 'relative', width: 800, height: 120 }}>
          <ClipView clip={videoTrack.clips[0]!} zoom={60} trackId="v1" trackColor="#5b6af5" />
          <ClipView clip={audioTrack.clips[1]!} zoom={60} trackId="a1" trackColor="#22c55e" />
        </div>,
      );
    });

    const rightHandles = container.querySelectorAll('[aria-label="Trim right edge"]');
    const leftHandles = container.querySelectorAll('[aria-label="Trim left edge"]');

    expect(rightHandles[0]).toBeInstanceOf(HTMLDivElement);
    expect(leftHandles[1]).toBeInstanceOf(HTMLDivElement);

    await act(async () => {
      rightHandles[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      leftHandles[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    });

    expect(useEditorStore.getState().selectedTrimEditPoints).toEqual([
      { trackId: 'v1', editPointTime: 4, side: 'A_SIDE' },
      { trackId: 'a1', editPointTime: 4, side: 'B_SIDE' },
    ]);

    const target = enterTrimModeFromContext(useEditorStore.getState());

    expect(target).toEqual(expect.objectContaining({
      anchorTrackId: 'a1',
      editPointTime: 4,
      trackIds: ['a1', 'v1'],
    }));
    expect(trimEngine.getState().active).toBe(true);
    expect(trimEngine.getState().rollers).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackId: 'v1', side: TrimSide.A_SIDE }),
      expect.objectContaining({ trackId: 'a1', side: TrimSide.B_SIDE }),
    ]));

    await act(async () => {
      root.unmount();
    });
  });
});
