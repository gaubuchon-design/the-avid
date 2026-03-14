import { beforeEach, describe, expect, it } from 'vitest';
import { handleEditorKeyboardEvent } from '../../hooks/useGlobalKeyboard';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

describe('handleEditorKeyboardEvent trim routing', () => {
  const initialEditorState = useEditorStore.getState();
  const initialPlayerState = usePlayerStore.getState();

  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    }

    useEditorStore.setState({
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
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
              trimEnd: 12,
              type: 'video',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Right',
              startTime: 5,
              endTime: 10,
              trimStart: 12,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      trimActive: true,
      trimMode: 'roll',
      trimSelectionLabel: 'AB',
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);
  });

  it('uses arrow keys as trim nudges while trim is active', () => {
    const handled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(handled).toBe(true);
    expect(trimEngine.getTrimDisplay().trimCounter).toBe(1);
  });

  it('uses shift-arrow as a larger trim nudge while trim is active', () => {
    const handled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));

    expect(handled).toBe(true);
    expect(trimEngine.getTrimDisplay().trimCounter).toBe(-10);
  });
});
