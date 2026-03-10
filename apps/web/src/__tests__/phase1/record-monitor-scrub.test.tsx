import React, { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { RecordMonitor } from '../../components/RecordMonitor/RecordMonitor';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();

describe('record monitor scrub', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
  });

  it('scrubs the record playhead by dragging the monitor scrub bar', async () => {
    useEditorStore.setState({
      duration: 20,
      playheadTime: 0,
      inPoint: 2,
      outPoint: 18,
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<RecordMonitor />);
    });

    const scrubBar = container.querySelector('[aria-label="Record playback position"]') as HTMLDivElement | null;
    expect(scrubBar).not.toBeNull();

    Object.defineProperty(scrubBar!, 'getBoundingClientRect', {
      value: () => ({
        left: 10,
        width: 100,
        top: 0,
        bottom: 6,
        right: 110,
        height: 6,
        x: 10,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      scrubBar!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 35 }));
    });

    expect(useEditorStore.getState().playheadTime).toBeCloseTo(5, 5);

    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 70 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expect(useEditorStore.getState().playheadTime).toBeCloseTo(12, 5);

    await act(async () => {
      root.unmount();
    });
  });
});
