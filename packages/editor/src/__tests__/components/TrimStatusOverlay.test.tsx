import React, { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { TrimMode, TrimSide, trimEngine } from '../../engine/TrimEngine';
import { TrimStatusOverlay } from '../../components/Editor/TrimStatusOverlay';
import { makeClip, useEditorStore } from '../../store/editor.store';

const initialEditorState = useEditorStore.getState();

function setInputValue(input: HTMLInputElement, nextValue: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('trim status overlay', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    if (trimEngine.getState().active) {
      trimEngine.cancelTrim();
    }

    useEditorStore.setState({
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
              trimEnd: 4,
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
          id: 'v2',
          name: 'V2',
          type: 'VIDEO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#818cf8',
          clips: [
            makeClip({
              id: 'v2-left',
              trackId: 'v2',
              name: 'V2 Left',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 4,
              type: 'video',
            }),
            makeClip({
              id: 'v2-right',
              trackId: 'v2',
              name: 'V2 Right',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
      ],
      sequenceSettings: {
        ...useEditorStore.getState().sequenceSettings,
        fps: 24,
      },
      projectSettings: {
        ...useEditorStore.getState().projectSettings,
        frameRate: 24,
      },
      trimActive: true,
      trimMode: 'roll',
      trimSelectionLabel: 'AB',
    });

    trimEngine.enterTrimMode(['v1', 'v2'], 5, TrimSide.BOTH);
  });

  it('switches side selection, trims by frame, and exposes asymmetrical roller controls', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrimStatusOverlay />);
    });

    const aButton = container.querySelector('[aria-label="Set trim to A-side"]');
    const slipModeButton = container.querySelector('[aria-label="Switch to slip trim mode"]');
    const slideModeButton = container.querySelector('[aria-label="Switch to slide trim mode"]');
    const rightOneButton = container.querySelector('[aria-label="Trim right 1 frame"]');
    const v2BButton = container.querySelector('[aria-label="Trim V2 on B-side"]');

    expect(aButton).toBeInstanceOf(HTMLButtonElement);
    expect(slipModeButton).toBeInstanceOf(HTMLButtonElement);
    expect(slideModeButton).toBeInstanceOf(HTMLButtonElement);
    expect(rightOneButton).toBeInstanceOf(HTMLButtonElement);
    expect(v2BButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      aButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getState().rollers.every((roller) => roller.side === TrimSide.A_SIDE)).toBe(true);

    await act(async () => {
      rightOneButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getTrimDisplay().aSideFrame).toBe(1);

    await act(async () => {
      v2BButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const v2Roller = trimEngine.getState().rollers.find((roller) => roller.trackId === 'v2');
    expect(v2Roller?.side).toBe(TrimSide.B_SIDE);

    await act(async () => {
      slipModeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getCurrentMode()).toBe(TrimMode.SLIP);

    await act(async () => {
      slideModeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(trimEngine.getCurrentMode()).toBe(TrimMode.SLIDE);

    await act(async () => {
      root.unmount();
    });
  });

  it('can transition from hidden to visible without hook-order errors', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      useEditorStore.setState({
        trimActive: false,
        trimMode: 'off',
        trimSelectionLabel: 'OFF',
      });
      trimEngine.exitTrimMode();
      root.render(<TrimStatusOverlay />);
    });

    expect(container.textContent).toBe('');

    await act(async () => {
      useEditorStore.setState({
        trimActive: true,
        trimMode: 'roll',
        trimSelectionLabel: 'AB',
      });
      trimEngine.enterTrimMode(['v1', 'v2'], 5, TrimSide.BOTH);
      root.render(<TrimStatusOverlay />);
    });

    expect(container.textContent).toContain('TRIM');
    expect(
      consoleError.mock.calls.some((call) => String(call[0]).includes('Rendered more hooks')),
    ).toBe(false);

    await act(async () => {
      root.unmount();
    });

    consoleError.mockRestore();
  });

  it('toggles trim loop playback and trim view mode from the overlay', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrimStatusOverlay />);
    });

    const loopButton = container.querySelector('[aria-label="Start trim loop playback"]');
    const viewButton = container.querySelector('[aria-label="Toggle big and small trim view"]');

    expect(loopButton).toBeInstanceOf(HTMLButtonElement);
    expect(viewButton).toBeInstanceOf(HTMLButtonElement);
    expect(useEditorStore.getState().trimLoopPlaybackActive).toBe(false);
    expect(useEditorStore.getState().trimViewMode).toBe('small');

    await act(async () => {
      loopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useEditorStore.getState().trimLoopPlaybackActive).toBe(true);

    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useEditorStore.getState().trimViewMode).toBe('big');

    const longDurationButton = container.querySelector('[aria-label="Set long trim playback duration"]');
    expect(longDurationButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      longDurationButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(useEditorStore.getState().trimLoopDurationPreset).toBe('long');
    expect(useEditorStore.getState().trimLoopPreRollFrames).toBe(48);
    expect(useEditorStore.getState().trimLoopPostRollFrames).toBe(48);

    const preRollInput = container.querySelector('[aria-label="Set trim preroll frames"]') as HTMLInputElement | null;
    const postRollInput = container.querySelector('[aria-label="Set trim postroll frames"]') as HTMLInputElement | null;

    expect(preRollInput).toBeInstanceOf(HTMLInputElement);
    expect(postRollInput).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      if (preRollInput) {
        setInputValue(preRollInput, '30');
      }
    });

    await act(async () => {
      if (postRollInput) {
        setInputValue(postRollInput, '18');
      }
    });

    expect(useEditorStore.getState().trimLoopDurationPreset).toBe('custom');
    expect(useEditorStore.getState().trimLoopPreRollFrames).toBe(30);
    expect(useEditorStore.getState().trimLoopPostRollFrames).toBe(18);

    await act(async () => {
      root.unmount();
    });
  });

  it('shows trim diagnostics and disables unavailable trim directions', async () => {
    useEditorStore.setState({
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
              id: 'v1-left-tight',
              trackId: 'v1',
              name: 'V1 Left Tight',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
            makeClip({
              id: 'v1-right-tight',
              trackId: 'v1',
              name: 'V1 Right Tight',
              startTime: 5,
              endTime: 10,
              trimStart: 0,
              trimEnd: 0,
              type: 'video',
            }),
          ],
        },
        {
          id: 'v2',
          name: 'V2',
          type: 'VIDEO',
          sortOrder: 1,
          muted: false,
          locked: false,
          solo: false,
          volume: 1,
          color: '#818cf8',
          clips: [
            makeClip({
              id: 'v2-left',
              trackId: 'v2',
              name: 'V2 Left',
              startTime: 0,
              endTime: 5,
              trimStart: 0,
              trimEnd: 4,
              type: 'video',
            }),
            makeClip({
              id: 'v2-right',
              trackId: 'v2',
              name: 'V2 Right',
              startTime: 5,
              endTime: 10,
              trimStart: 2,
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
    trimEngine.enterTrimMode(['v1', 'v2'], 5, TrimSide.BOTH);
    useEditorStore.setState((state) => ({
      tracks: state.tracks.map((track) => (
        track.id === 'v2'
          ? { ...track, locked: true }
          : track
      )),
    }));

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<TrimStatusOverlay />);
    });

    expect(container.textContent).toContain('LOCKED V2');
    expect(container.textContent).toContain('L 0f');
    expect(container.textContent).toContain('R 0f');

    const leftOneButton = container.querySelector('[aria-label="Trim left 1 frame"]') as HTMLButtonElement | null;
    const rightOneButton = container.querySelector('[aria-label="Trim right 1 frame"]') as HTMLButtonElement | null;

    expect(leftOneButton?.disabled).toBe(true);
    expect(rightOneButton?.disabled).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });
});
