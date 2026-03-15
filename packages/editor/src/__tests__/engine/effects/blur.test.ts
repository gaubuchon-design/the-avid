import { describe, it, expect } from 'vitest';
import { applyGaussianBlur } from '../../../engine/effects/blur';

/** Helper: create a simple ImageData-like object. */
function createImageData(w: number, h: number, fill = 128): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill;
    data[i + 1] = fill;
    data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

/** Create an image with a single bright pixel in the center for blur testing. */
function createDotImage(w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  // All black background
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  // Single white pixel in center
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const idx = (cy * w + cx) * 4;
  data[idx] = 255;
  data[idx + 1] = 255;
  data[idx + 2] = 255;
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

describe('applyGaussianBlur', () => {
  it('radius=0 returns unchanged image data', () => {
    const img = createImageData(4, 4, 100);
    const original = new Uint8ClampedArray(img.data);
    const result = applyGaussianBlur(img, 0);
    expect(result.data).toEqual(original);
  });

  it('blur produces averaged pixel values', () => {
    // A dot image: single white pixel surrounded by black.
    // After blur, the center pixel should be dimmer (averaged with surrounding black)
    const img = createDotImage(10, 10);
    const cx = Math.floor(10 / 2);
    const cy = Math.floor(10 / 2);
    const centerIdx = (cy * 10 + cx) * 4;

    const originalCenter = img.data[centerIdx]; // 255
    applyGaussianBlur(img, 2, 1);
    // Center should be less than 255 because it's averaged with neighbors
    expect(img.data[centerIdx]).toBeLessThan(originalCenter!);
    // A neighbor pixel should now have some brightness (spread from center)
    const neighborIdx = ((cy - 1) * 10 + cx) * 4;
    expect(img.data[neighborIdx]).toBeGreaterThan(0);
  });

  it('iterations > 1 increases blur effect', () => {
    const img1 = createDotImage(10, 10);
    const img2 = createDotImage(10, 10);
    const cx = Math.floor(10 / 2);
    const cy = Math.floor(10 / 2);
    const centerIdx = (cy * 10 + cx) * 4;

    applyGaussianBlur(img1, 2, 1);
    applyGaussianBlur(img2, 2, 3);

    // More iterations = more blur = lower peak at center
    expect(img2.data[centerIdx]).toBeLessThanOrEqual(img1.data[centerIdx]!);
  });

  it('handles 1x1 images without error', () => {
    const img = createImageData(1, 1, 200);
    // For 1x1, radius is clamped to min(round(5), min(1,1)/2) = min(5, 0) = 0
    // So it returns unchanged
    const result = applyGaussianBlur(img, 5, 1);
    // The function should not throw. Pixel value may or may not change
    // depending on the clamp logic. Just verify no crash.
    expect(result.data.length).toBe(4);
  });

  it('preserves alpha channel for uniform input', () => {
    const img = createImageData(6, 6, 128);
    // Set specific alpha
    for (let i = 3; i < img.data.length; i += 4) {
      img.data[i] = 200;
    }
    applyGaussianBlur(img, 1, 1);
    // All alpha values should be 200 (uniform input => uniform output)
    for (let i = 3; i < img.data.length; i += 4) {
      expect(img.data[i]).toBe(200);
    }
  });

  it('returns the same ImageData object', () => {
    const img = createImageData(4, 4);
    const result = applyGaussianBlur(img, 1);
    expect(result).toBe(img);
  });
});
