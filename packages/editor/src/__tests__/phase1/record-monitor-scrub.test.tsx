import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { RecordMonitor } from '../../components/RecordMonitor/RecordMonitor';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const pointerEventDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'PointerEvent');
let rafQueue: FrameRequestCallback[] = [];

async function flushAnimationFrames() {
  const pending = [...rafQueue];
  rafQueue = [];
  await act(async () => {
    pending.forEach((callback) => callback(0));
  });
}

function dispatchScrubEvent(target: EventTarget, type: 'down' | 'move' | 'up', clientX: number) {
  const eventType = type === 'down' ? 'mousedown' : type === 'move' ? 'mousemove' : 'mouseup';
  target.dispatchEvent(new MouseEvent(eventType, { bubbles: true, clientX }));
}

describe('record monitor scrub', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    rafQueue = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(globalThis, 'PointerEvent', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    if (pointerEventDescriptor) {
      Object.defineProperty(globalThis, 'PointerEvent', pointerEventDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'PointerEvent');
    }
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
    await flushAnimationFrames();

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
      dispatchScrubEvent(scrubBar!, 'down', 35);
    });
    await flushAnimationFrames();

    expect(useEditorStore.getState().playheadTime).toBeCloseTo(5, 5);

    await act(async () => {
      dispatchScrubEvent(globalThis, 'move', 70);
      dispatchScrubEvent(globalThis, 'up', 70);
    });
    await flushAnimationFrames();

    expect(useEditorStore.getState().playheadTime).toBeCloseTo(12, 5);

    await act(async () => {
      root.unmount();
    });
  });
});
