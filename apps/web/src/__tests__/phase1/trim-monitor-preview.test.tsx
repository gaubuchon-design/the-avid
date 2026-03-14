import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RecordMonitor } from '../../components/RecordMonitor/RecordMonitor';
import { SourceMonitor } from '../../components/SourceMonitor/SourceMonitor';
import { TrimSide, trimEngine } from '../../engine/TrimEngine';
import { makeClip, useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
let rafQueue: FrameRequestCallback[] = [];

async function flushAnimationFrames() {
  const pending = [...rafQueue];
  rafQueue = [];
  await act(async () => {
    pending.forEach((callback) => callback(0));
  });
}

describe('trim monitor preview', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    }

    rafQueue = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('shows outgoing and incoming trim context in the source and record monitor headers', async () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-left', name: 'Interview A', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-right', name: 'Interview B', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
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
              id: 'left',
              trackId: 'v1',
              name: 'Outgoing',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 4,
              type: 'video',
              assetId: 'asset-left',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Incoming',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-right',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      trimActive: true,
      trimMode: 'roll',
      trimSelectionLabel: 'AB',
      playheadTime: 5,
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <SourceMonitor />
          <RecordMonitor />
        </>,
      );
    });
    await flushAnimationFrames();

    expect(container.textContent).toContain('A-SIDE');
    expect(container.textContent).toContain('B-SIDE');
    expect(container.textContent).toContain('V1 · Outgoing');
    expect(container.textContent).toContain('V1 · Incoming');
    expect(container.querySelector('[aria-label="Source playback position"]')).toBeNull();
    expect(container.querySelector('[aria-label="Record playback position"]')).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it('uses monitor transport buttons as trim nudgers while trim is active', async () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-left', name: 'Interview A', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-right', name: 'Interview B', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
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
              id: 'left',
              trackId: 'v1',
              name: 'Outgoing',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 4,
              type: 'video',
              assetId: 'asset-left',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Incoming',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-right',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      trimActive: true,
      trimMode: 'roll',
      trimSelectionLabel: 'AB',
      playheadTime: 5,
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<RecordMonitor />);
    });
    await flushAnimationFrames();

    const trimRightButton = container.querySelector('[title="Trim Right 1 Frame"]');
    expect(trimRightButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      trimRightButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getTrimDisplay().trimCounter).toBe(1);

    await act(async () => {
      root.unmount();
    });
  });

  it('lets the source and record monitor labels switch the active trim side', async () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-left', name: 'Interview A', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
            { id: 'asset-right', name: 'Interview B', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
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
              id: 'left',
              trackId: 'v1',
              name: 'Outgoing',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 4,
              type: 'video',
              assetId: 'asset-left',
            }),
            makeClip({
              id: 'right',
              trackId: 'v1',
              name: 'Incoming',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
              assetId: 'asset-right',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      trimActive: true,
      trimMode: 'roll',
      trimSelectionLabel: 'AB',
      playheadTime: 5,
    });

    trimEngine.enterTrimMode(['v1'], 5, TrimSide.BOTH);

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <SourceMonitor />
          <RecordMonitor />
        </>,
      );
    });
    await flushAnimationFrames();

    const sourceButton = container.querySelector('[aria-label="Select A-side trim monitor"]');
    const recordButton = container.querySelector('[aria-label="Select B-side trim monitor"]');

    expect(sourceButton).toBeInstanceOf(HTMLButtonElement);
    expect(recordButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      sourceButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getState().rollers.every((roller) => roller.side === TrimSide.A_SIDE)).toBe(true);

    await act(async () => {
      recordButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getState().rollers.every((roller) => roller.side === TrimSide.B_SIDE)).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  it('keeps slip review mode-specific and does not expose A/B trim-side switching', async () => {
    useEditorStore.setState({
      bins: [
        {
          id: 'bin-master',
          name: 'Master',
          color: '#5b6af5',
          isOpen: true,
          children: [],
          assets: [
            { id: 'asset-main', name: 'Main Clip', type: 'VIDEO', status: 'READY', tags: [], isFavorite: false },
          ],
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
              id: 'main',
              trackId: 'v1',
              name: 'Main',
              startTime: 2,
              endTime: 6,
              trimStart: 3,
              trimEnd: 5,
              type: 'video',
              assetId: 'asset-main',
            }),
          ],
        },
      ],
      selectedTrackId: 'v1',
      enabledTrackIds: ['v1'],
      videoMonitorTrackId: 'v1',
      trimActive: true,
      trimMode: 'roll',
      trimSelectionLabel: 'AB',
      playheadTime: 4,
    });

    trimEngine.enterTrimMode(['v1'], 4, TrimSide.BOTH);
    trimEngine.cycleTrimMode();

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <SourceMonitor />
          <RecordMonitor />
        </>,
      );
    });
    await flushAnimationFrames();

    expect(container.textContent).toContain('SLIP IN');
    expect(container.textContent).toContain('SLIP OUT');
    expect(container.querySelector('[aria-label="Select both trim sides"]')).toBeNull();

    const sourceLabel = container.querySelector('.monitor-label-button.source');
    expect(sourceLabel).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      sourceLabel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getCurrentMode()).toBe('SLIP');

    await act(async () => {
      root.unmount();
    });
  });
});
