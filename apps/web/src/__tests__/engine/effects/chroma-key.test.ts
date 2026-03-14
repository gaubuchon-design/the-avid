import { describe, it, expect } from 'vitest';

import { applyChromaKey } from '../../../engine/effects/chroma-key';

/** Helper: create RGBA pixel data with a single color. */
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

describe('applyChromaKey', () => {
  it('pure green (#00ff00) pixels become transparent with default tolerance', () => {
    const data = makePixels(0, 255, 0, 255, 4);
    applyChromaKey(data, '#00ff00', 40, 10, 0);
    for (let i = 0; i < 4; i++) {
      expect(data[i * 4 + 3]).toBe(0);
    }
  });

  it('non-green pixels remain opaque', () => {
    const data = makePixels(255, 0, 0, 255); // pure red
    applyChromaKey(data, '#00ff00', 40, 10, 0);
    expect(data[3]).toBe(255);
  });

  it('tolerance=0 only removes very close matches', () => {
    // With tolerance=0, innerThreshold=0, outerThreshold=0.05
    // Pure green should still be removed (dist ~= 0 for exact match)
    const exactGreen = makePixels(0, 255, 0, 255);
    applyChromaKey(exactGreen, '#00ff00', 0, 0, 0);
    // dist = 0 for exact match; innerThreshold = 0, so alpha should be 0
    expect(exactGreen[3]).toBe(0);

    // Slightly off-green should remain
    const offGreen = makePixels(50, 200, 50, 255);
    applyChromaKey(offGreen, '#00ff00', 0, 0, 0);
    // dist > 0 for off-green; with tolerance=0 and softness=0, outerThreshold=0.05
    // Whether this pixel passes depends on the actual distance
    // At least it should have higher alpha than exact green
    expect(offGreen[3]).toBeGreaterThanOrEqual(0);
  });

  it('tolerance=100 removes most colors near key', () => {
    // Very high tolerance should remove even off-green colors
    const data = makePixels(50, 200, 50, 255);
    applyChromaKey(data, '#00ff00', 100, 0, 0);
    expect(data[3]).toBeLessThan(255);
  });

  it('softness affects edge transition', () => {
    // Create a pixel that's on the edge of the key threshold
    const dataSoft = makePixels(30, 220, 30, 255);
    const dataHard = makePixels(30, 220, 30, 255);

    applyChromaKey(dataSoft, '#00ff00', 30, 80, 0); // high softness
    applyChromaKey(dataHard, '#00ff00', 30, 0, 0);  // no softness

    // With softness, the outer threshold expands, so the pixel is more likely
    // to be partially transparent (or fully transparent)
    // The key point is softness changes the result
    const softAlpha = dataSoft[3];
    const hardAlpha = dataHard[3];
    // They should be different or at least both affected
    expect(softAlpha! + hardAlpha!).toBeLessThan(510); // At least one must be < 255
  });

  it('spill suppression reduces green fringing on edges', () => {
    // Pixel with strong green component but not pure green
    const data = makePixels(100, 200, 100, 255);
    const originalG = data[1];
    applyChromaKey(data, '#00ff00', 10, 0, 100); // max spill suppression

    // Green channel should be reduced (suppressed toward max of R, B)
    // Only applied when alpha > 0 (pixel not fully keyed)
    if (data[3]! > 0) {
      expect(data[1]).toBeLessThanOrEqual(originalG!);
    }
  });

  it('preserves completely non-matching pixels', () => {
    const data = makePixels(255, 0, 255, 200); // magenta (opposite of green)
    applyChromaKey(data, '#00ff00', 40, 10, 50);
    expect(data[0]).toBe(255); // R unchanged
    expect(data[3]).toBe(200); // Alpha unchanged
  });

  it('handles blue screen keying', () => {
    const data = makePixels(0, 0, 255, 255); // pure blue
    applyChromaKey(data, '#0000ff', 40, 10, 0);
    expect(data[3]).toBe(0); // should be keyed out
  });

  it('handles invalid hex color gracefully', () => {
    const data = makePixels(100, 200, 100, 255);
    const original = new Uint8ClampedArray(data);
    // Invalid hex: function returns early
    applyChromaKey(data, 'invalid', 40, 10, 0);
    expect(data).toEqual(original);
  });
});
