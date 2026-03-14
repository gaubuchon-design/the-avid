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
Object.defineProperty(globalThis, 'requestAnimationFrame', { value: vi.fn((_cb: FrameRequestCallback) => ++rafId), writable: true });
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

function createMockCanvasContext(canvas: HTMLCanvasElement) {
  const gradient = { addColorStop: vi.fn() };

  return {
    canvas,
    globalAlpha: 1,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '16px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    measureText: vi.fn((text: string) => ({
      width: text.length * 8,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 4,
    })),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    createPattern: vi.fn(() => ({})),
    getImageData: vi.fn((_sx = 0, _sy = 0, sw = canvas.width || 1, sh = canvas.height || 1) => (
      new ImageData(Math.max(sw, 1), Math.max(sh, 1))
    )),
    putImageData: vi.fn(),
  };
}

const canvasContexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof createMockCanvasContext>>();
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(function getContext(this: HTMLCanvasElement, contextId: string) {
    if (contextId !== '2d') {
      return null;
    }

    let context = canvasContexts.get(this);

    if (!context) {
      context = createMockCanvasContext(this);
      canvasContexts.set(this, context);
    }

    return context;
  }),
  writable: true,
  configurable: true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
  value: vi.fn(function toBlob(this: HTMLCanvasElement, callback: BlobCallback) {
    callback(new Blob([], { type: 'image/png' }));
  }),
  writable: true,
  configurable: true,
});
Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
  value: vi.fn(() => 'data:image/png;base64,mock'),
  writable: true,
  configurable: true,
});

// Mock OffscreenCanvas
Object.defineProperty(globalThis, 'OffscreenCanvas', { value: undefined, writable: true });

// Mock navigator.gpu (not available by default)
Object.defineProperty(navigator, 'gpu', { value: undefined, writable: true, configurable: true });

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true, configurable: true });
Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
  value: vi.fn(),
  writable: true,
  configurable: true,
});

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
