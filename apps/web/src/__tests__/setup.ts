import '@testing-library/jest-dom';

// Mock OffscreenCanvas
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) { this.width = w; this.height = h; }
  getContext() { return null; }
  transferToImageBitmap() { return null; }
}
(globalThis as any).OffscreenCanvas = MockOffscreenCanvas;

// Mock AudioContext
(globalThis as any).AudioContext = class {
  createGain() { return { gain: { value: 1 }, connect: () => {} }; }
  createStereoPanner() { return { pan: { value: 0 }, connect: () => {} }; }
  createDynamicsCompressor() { return { connect: () => {} }; }
  createAnalyser() { return { connect: () => {}, frequencyBinCount: 128, getFloatTimeDomainData: () => {} }; }
  get destination() { return {}; }
};

// Mock requestAnimationFrame
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
