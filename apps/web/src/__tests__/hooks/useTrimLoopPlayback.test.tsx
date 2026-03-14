import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTrimLoopPlayback } from '../../hooks/useTrimLoopPlayback';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

function TrimLoopHarness() {
  useTrimLoopPlayback();
  return null;
}

describe('useTrimLoopPlayback', () => {
  const initialEditorState = useEditorStore.getState();
  const initialPlayerState = usePlayerStore.getState();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let rafQueue: FrameRequestCallback[] = [];

  async function flushAnimationFrame(timestamp: number) {
    const pending = [...rafQueue];
    rafQueue = [];
    await act(async () => {
      pending.forEach((callback) => callback(timestamp));
    });
  }

  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    rafQueue = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it('starts from preroll for forward trim playback and advances offsets over time', async () => {
    useEditorStore.setState({
      trimActive: true,
      trimLoopPlaybackActive: true,
      trimLoopPlaybackDirection: 1,
      trimLoopPlaybackRate: 1,
      trimLoopPreRollFrames: 4,
      trimLoopPostRollFrames: 4,
      trimLoopOffsetFrames: 0,
      isPlaying: false,
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
    });

    render(<TrimLoopHarness />);

    expect(useEditorStore.getState().trimLoopOffsetFrames).toBe(-4);

    await flushAnimationFrame(1);
    await flushAnimationFrame(251);

    expect(useEditorStore.getState().trimLoopOffsetFrames).toBeGreaterThan(-4);
  });

  it('starts from postroll for reverse trim playback and moves backward', async () => {
    useEditorStore.setState({
      trimActive: true,
      trimLoopPlaybackActive: true,
      trimLoopPlaybackDirection: -1,
      trimLoopPlaybackRate: 2,
      trimLoopPreRollFrames: 4,
      trimLoopPostRollFrames: 4,
      trimLoopOffsetFrames: 0,
      isPlaying: false,
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
    });

    render(<TrimLoopHarness />);

    expect(useEditorStore.getState().trimLoopOffsetFrames).toBe(4);

    await flushAnimationFrame(1);
    await flushAnimationFrame(126);

    expect(useEditorStore.getState().trimLoopOffsetFrames).toBeLessThan(4);
  });
});
