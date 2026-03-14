import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SourceMonitor } from '../../components/SourceMonitor/SourceMonitor';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';

const initialEditorState = useEditorStore.getState();
const initialPlayerState = usePlayerStore.getState();
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalCreateElement = document.createElement.bind(document);
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
  let eventType: 'mousedown' | 'mousemove' | 'mouseup';
  if (type === 'down') {
    eventType = 'mousedown';
  } else if (type === 'move') {
    eventType = 'mousemove';
  } else {
    eventType = 'mouseup';
  }
  target.dispatchEvent(new MouseEvent(eventType, { bubbles: true, clientX }));
}

describe('source monitor scrub', () => {
  beforeEach(() => {
    useEditorStore.setState(initialEditorState, true);
    usePlayerStore.setState(initialPlayerState, true);
    vi.restoreAllMocks();
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

  it('scrubs the source playhead without requiring a loaded video element', async () => {
    useEditorStore.setState({
      sourceAsset: {
        id: 'asset-source',
        name: 'Source Clip',
        type: 'VIDEO',
        duration: 20,
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      sourcePlayhead: 0,
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<SourceMonitor />);
    });
    await flushAnimationFrames();

    const scrubBar = container.querySelector('[aria-label="Source playback position"]') as HTMLDivElement | null;
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

    expect(useEditorStore.getState().sourcePlayhead).toBeCloseTo(5, 5);

    await act(async () => {
      dispatchScrubEvent(globalThis, 'move', 70);
      dispatchScrubEvent(globalThis, 'up', 70);
    });
    await flushAnimationFrames();

    expect(useEditorStore.getState().sourcePlayhead).toBeCloseTo(12, 5);

    await act(async () => {
      root.unmount();
    });
  });

  it('does not recreate the source video element when the source playhead changes', async () => {
    let videoCreateCount = 0;

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() !== 'video') {
        return element;
      }

      videoCreateCount += 1;
      let currentTime = 0;

      Object.defineProperty(element, 'currentTime', {
        configurable: true,
        get: () => currentTime,
        set: (value: number) => {
          currentTime = value;
        },
      });
      Object.defineProperty(element, 'duration', { configurable: true, value: 20 });
      Object.defineProperty(element, 'readyState', { configurable: true, value: 2 });
      Object.defineProperty(element, 'videoWidth', { configurable: true, value: 1920 });
      Object.defineProperty(element, 'videoHeight', { configurable: true, value: 1080 });
      Object.defineProperty(element, 'load', {
        configurable: true,
        value: () => {
          queueMicrotask(() => {
            element.dispatchEvent(new Event('loadedmetadata'));
          });
        },
      });
      Object.defineProperty(element, 'play', {
        configurable: true,
        value: vi.fn(() => Promise.resolve()),
      });
      Object.defineProperty(element, 'pause', {
        configurable: true,
        value: vi.fn(),
      });

      return element;
    }) as typeof document.createElement);

    useEditorStore.setState({
      sourceAsset: {
        id: 'asset-source',
        name: 'Source Clip',
        type: 'VIDEO',
        duration: 0,
        playbackUrl: 'https://example.com/source.mov',
        status: 'READY',
        tags: [],
        isFavorite: false,
      },
      sourcePlayhead: 0,
    });

    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(<SourceMonitor />);
    });
    await flushAnimationFrames();
    await act(async () => {
      await Promise.resolve();
    });

    expect(videoCreateCount).toBe(1);

    await act(async () => {
      useEditorStore.getState().setSourcePlayhead(5);
    });
    await flushAnimationFrames();
    await act(async () => {
      await Promise.resolve();
    });

    expect(videoCreateCount).toBe(1);

    await act(async () => {
      root.unmount();
    });
  });
});
