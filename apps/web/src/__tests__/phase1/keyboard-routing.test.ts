import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keyboardEngine } from '../../engine/KeyboardEngine';
import { handleEditorKeyboardEvent } from '../../hooks/useGlobalKeyboard';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();

describe('phase 1 keyboard routing', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    keyboardEngine.resetToDefaults();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    keyboardEngine.unregisterAction('view.fullScreen');
    keyboardEngine.unregisterAction('nav.nextEdit');
  });

  it('uses match frame on the record monitor instead of the fullscreen binding', () => {
    const fullScreenSpy = vi.fn();
    keyboardEngine.registerAction('view.fullScreen', fullScreenSpy);

    const asset = {
      id: 'asset-video-1',
      name: 'Interview',
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
          assets: [asset],
          isOpen: true,
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
              assetId: asset.id,
              trackId: 'v1',
              name: 'Timeline Clip',
              startTime: 10,
              endTime: 14,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      playheadTime: 12,
      sourceAsset: null,
    });

    const handled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'f' }));

    expect(handled).toBe(true);
    expect(useEditorStore.getState().sourceAsset?.id).toBe(asset.id);
    expect(fullScreenSpy).not.toHaveBeenCalled();
  });

  it('consumes F as a source-monitor no-op so fullscreen does not fire', () => {
    const fullScreenSpy = vi.fn();
    keyboardEngine.registerAction('view.fullScreen', fullScreenSpy);
    usePlayerStore.setState({ activeMonitor: 'source' });

    const handled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'f' }));

    expect(handled).toBe(true);
    expect(fullScreenSpy).not.toHaveBeenCalled();
  });

  it('lets the keyboard engine own Avid navigation bindings like S for next edit', () => {
    const nextEditSpy = vi.fn();
    keyboardEngine.registerAction('nav.nextEdit', nextEditSpy);

    useEditorStore.setState({
      playheadTime: 1,
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
              id: 'clip-left',
              trackId: 'v1',
              name: 'Left',
              startTime: 0,
              endTime: 4,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      selectedClipIds: ['clip-left'],
    });

    const handled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 's' }));

    expect(handled).toBe(true);
    expect(nextEditSpy).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().tracks[0]!.clips).toHaveLength(1);
  });
});
