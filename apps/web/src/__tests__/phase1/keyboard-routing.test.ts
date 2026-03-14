import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { keyboardEngine } from '../../engine/KeyboardEngine';
import { handleEditorKeyboardEvent } from '../../hooks/useGlobalKeyboard';
import { matchFrameAtPlayhead, toggleMonitorFocus } from '../../lib/editorMonitorActions';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();

describe('phase 1 keyboard routing', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    keyboardEngine.resetToDefaults();
    keyboardEngine.registerAction('monitor.matchFrame', () => {
      if (usePlayerStore.getState().activeMonitor !== 'source') {
        matchFrameAtPlayhead();
      }
    });
    keyboardEngine.registerAction('monitor.toggleSourceRecord', () => {
      toggleMonitorFocus();
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    keyboardEngine.unregisterAction('view.fullScreen');
    keyboardEngine.unregisterAction('monitor.matchFrame');
    keyboardEngine.unregisterAction('monitor.toggleSourceRecord');
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

  it('routes arrow and home-end transport keys to the source monitor when it is active', () => {
    usePlayerStore.setState({ activeMonitor: 'source' });
    useEditorStore.setState({
      sourcePlayhead: 4,
      sourceAsset: {
        id: 'asset-source',
        name: 'Source',
        type: 'VIDEO',
        status: 'READY',
        duration: 10,
        tags: [],
        isFavorite: false,
      },
      playheadTime: 7,
      duration: 30,
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
    });

    handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(useEditorStore.getState().sourcePlayhead).toBeCloseTo(4 + (1 / 24), 5);
    expect(useEditorStore.getState().playheadTime).toBe(7);

    handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(useEditorStore.getState().sourcePlayhead).toBe(0);

    handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(useEditorStore.getState().sourcePlayhead).toBe(10);
    expect(useEditorStore.getState().playheadTime).toBe(7);
  });

  it('binds Tab to toggle source and record monitor focus', () => {
    usePlayerStore.setState({ activeMonitor: 'record' });

    const firstToggleHandled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(firstToggleHandled).toBe(true);
    expect(usePlayerStore.getState().activeMonitor).toBe('source');

    const secondToggleHandled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(secondToggleHandled).toBe(true);
    expect(usePlayerStore.getState().activeMonitor).toBe('record');
  });

  it('does not treat C or Y as legacy generic tool shortcuts', () => {
    useEditorStore.setState({
      activeTool: 'select',
      selectedClipIds: [],
    });

    const cutHandled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'c' }));
    const slipHandled = handleEditorKeyboardEvent(new KeyboardEvent('keydown', { key: 'y' }));

    expect(cutHandled).toBe(false);
    expect(slipHandled).toBe(false);
    expect(useEditorStore.getState().activeTool).toBe('select');
  });
});
