import { describe, it, expect } from 'vitest';

import { applyBrightnessContrast } from '../../../engine/effects/brightness-contrast';

/** Helper: create a Uint8ClampedArray of RGBA pixels with a uniform color. */
function makePixels(r: number, g: number, b: number, a: number, count = 1): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

describe('applyBrightnessContrast', () => {
  it('brightness=0, contrast=0 leaves pixels unchanged', () => {
    const data = makePixels(100, 150, 200, 255, 4);
    const original = new Uint8ClampedArray(data);
    applyBrightnessContrast(data, 0, 0);
    expect(data).toEqual(original);
  });

  it('positive brightness increases pixel values (modern mode)', () => {
    const data = makePixels(100, 100, 100, 255);
    applyBrightnessContrast(data, 50, 0, false);
    expect(data[0]).toBeGreaterThan(100);
    expect(data[1]).toBeGreaterThan(100);
    expect(data[2]).toBeGreaterThan(100);
  });

  it('negative brightness decreases pixel values (modern mode)', () => {
    const data = makePixels(100, 100, 100, 255);
    applyBrightnessContrast(data, -50, 0, false);
    expect(data[0]).toBeLessThan(100);
    expect(data[1]).toBeLessThan(100);
    expect(data[2]).toBeLessThan(100);
  });

  it('positive contrast expands range from midpoint (modern mode)', () => {
    // A pixel above midpoint should move further from midpoint
    const dataHigh = makePixels(200, 200, 200, 255);
    applyBrightnessContrast(dataHigh, 0, 50, false);
    expect(dataHigh[0]).toBeGreaterThan(200);

    // A pixel below midpoint should move further from midpoint
    const dataLow = makePixels(50, 50, 50, 255);
    applyBrightnessContrast(dataLow, 0, 50, false);
    expect(dataLow[0]).toBeLessThan(50);
  });

  it('negative contrast compresses range toward midpoint (modern mode)', () => {
    const dataHigh = makePixels(200, 200, 200, 255);
    applyBrightnessContrast(dataHigh, 0, -50, false);
    expect(dataHigh[0]).toBeLessThan(200);

    const dataLow = makePixels(50, 50, 50, 255);
    applyBrightnessContrast(dataLow, 0, -50, false);
    expect(dataLow[0]).toBeGreaterThan(50);
  });

  it('values are clamped to [0, 255]', () => {
    const dataMax = makePixels(250, 250, 250, 255);
    applyBrightnessContrast(dataMax, 100, 100, false);
    expect(dataMax[0]).toBeLessThanOrEqual(255);
    expect(dataMax[0]).toBeGreaterThanOrEqual(0);

    const dataMin = makePixels(5, 5, 5, 255);
    applyBrightnessContrast(dataMin, -100, 100, false);
    expect(dataMin[0]).toBeGreaterThanOrEqual(0);
    expect(dataMin[0]).toBeLessThanOrEqual(255);
  });

  it('alpha channel is preserved', () => {
    const data = makePixels(100, 100, 100, 128);
    applyBrightnessContrast(data, 50, 50, false);
    expect(data[3]).toBe(128);
  });

  it('useLegacy mode produces different results from modern mode', () => {
    const dataModern = makePixels(100, 100, 100, 255);
    const dataLegacy = makePixels(100, 100, 100, 255);

    applyBrightnessContrast(dataModern, 30, 30, false);
    applyBrightnessContrast(dataLegacy, 30, 30, true);

    // Legacy and modern should produce different R values for the same input
    expect(dataModern[0]).not.toBe(dataLegacy[0]);
  });

  it('legacy mode: positive brightness shifts all channels up', () => {
    const data = makePixels(100, 100, 100, 255);
    applyBrightnessContrast(data, 50, 0, true);
    expect(data[0]).toBeGreaterThan(100);
    expect(data[1]).toBeGreaterThan(100);
    expect(data[2]).toBeGreaterThan(100);
  });

  it('handles multiple pixels correctly', () => {
    const data = makePixels(80, 120, 160, 255, 10);
    applyBrightnessContrast(data, 20, 0, false);
    // All R channels should be increased and equal
    for (let i = 0; i < 10; i++) {
      expect(data[i * 4]).toBeGreaterThan(80);
    }
  });
});
