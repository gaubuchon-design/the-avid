import '@testing-library/jest-dom';
import { vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock AudioContext and related Web Audio API
class MockAudioContext {
  destination = { maxChannelCount: 2 };
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  createGain() { return new MockGainNode(); }
  createStereoPanner() { return { pan: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createBiquadFilter() { return { type: 'peaking', frequency: { value: 1000 }, gain: { value: 0 }, Q: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() { return { threshold: { value: -24 }, ratio: { value: 4 }, attack: { value: 0.003 }, release: { value: 0.25 }, knee: { value: 10 }, connect: vi.fn(), disconnect: vi.fn() }; }
  createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }; }
  createMediaElementSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  close() { return Promise.resolve(); }
  resume() { return Promise.resolve(); }
}

class MockGainNode {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(globalThis, 'AudioContext', { value: MockAudioContext, writable: true });
Object.defineProperty(globalThis, 'GainNode', { value: MockGainNode, writable: true });

// Mock HTMLVideoElement properties
Object.defineProperty(HTMLVideoElement.prototype, 'load', { value: vi.fn() });
Object.defineProperty(HTMLVideoElement.prototype, 'play', { value: vi.fn().mockResolvedValue(undefined) });
Object.defineProperty(HTMLVideoElement.prototype, 'pause', { value: vi.fn() });

// Mock requestAnimationFrame
let rafId = 0;
Object.defineProperty(globalThis, 'requestAnimationFrame', { value: vi.fn((cb: FrameRequestCallback) => ++rafId), writable: true });
Object.defineProperty(globalThis, 'cancelAnimationFrame', { value: vi.fn(), writable: true });

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: MockResizeObserver, writable: true });

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

if (typeof globalThis.ImageData === 'undefined') {
  class MockImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      maybeHeight?: number,
    ) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
        return;
      }

      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = maybeHeight ?? Math.floor(dataOrWidth.length / (Math.max(widthOrHeight, 1) * 4));
    }
  }

  Object.defineProperty(globalThis, 'ImageData', {
    value: MockImageData,
    writable: true,
    configurable: true,
  });
}

// Mock OffscreenCanvas
Object.defineProperty(globalThis, 'OffscreenCanvas', { value: undefined, writable: true });

// Mock navigator.gpu (not available by default)
Object.defineProperty(navigator, 'gpu', { value: undefined, writable: true, configurable: true });

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true, configurable: true });

const localStorageState = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => localStorageState.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageState.set(key, value);
    },
    removeItem: (key: string) => {
      localStorageState.delete(key);
    },
    clear: () => {
      localStorageState.clear();
    },
  },
  writable: true,
  configurable: true,
});
