import '@testing-library/jest-dom';
import { vi } from 'vitest';

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

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Mock OffscreenCanvas
Object.defineProperty(globalThis, 'OffscreenCanvas', { value: undefined, writable: true });

// Mock navigator.gpu (not available by default)
Object.defineProperty(navigator, 'gpu', { value: undefined, writable: true, configurable: true });

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', { value: undefined, writable: true, configurable: true });
