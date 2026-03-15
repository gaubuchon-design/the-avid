import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { Ruler } from '../../components/TimelinePanel/Ruler';

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
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

describe('timeline ruler scrub', () => {
  beforeEach(() => {
    rafQueue = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }) as typeof globalThis.requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof globalThis.cancelAnimationFrame;
    Object.defineProperty(globalThis, 'PointerEvent', {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    if (pointerEventDescriptor) {
      Object.defineProperty(globalThis, 'PointerEvent', pointerEventDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'PointerEvent');
    }
  });

  it('uses the shared pointer scrub transport for drag updates', async () => {
    const onScrub = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Ruler
          zoom={10}
          scrollLeft={20}
          duration={20}
          onScrub={onScrub}
        />,
      );
    });
    await flushAnimationFrames();

    const ruler = container.querySelector('.timeline-ruler') as HTMLDivElement | null;
    expect(ruler).not.toBeNull();

    Object.defineProperty(ruler!, 'getBoundingClientRect', {
      value: () => ({
        left: 10,
        width: 100,
        top: 0,
        bottom: 24,
        right: 110,
        height: 24,
        x: 10,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    await act(async () => {
      dispatchScrubEvent(ruler!, 'down', 30);
    });
    await flushAnimationFrames();

    expect(onScrub).toHaveBeenLastCalledWith(4);

    await act(async () => {
      dispatchScrubEvent(globalThis, 'move', 60);
      dispatchScrubEvent(globalThis, 'up', 60);
    });
    await flushAnimationFrames();

    expect(onScrub).toHaveBeenLastCalledWith(7);

    await act(async () => {
      root.unmount();
    });
  });
});
