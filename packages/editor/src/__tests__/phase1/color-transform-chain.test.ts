// =============================================================================
//  THE AVID -- Color Transform Chain Tests (CPU Fallback)
// =============================================================================
// Validates the CPU-fallback color transform pipeline since WebGPU is not
// available in the jsdom test environment.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ColorTransformPipeline,
  type ColorSpaceId,
} from '../../engine/gpu/shaders/colorSpaceTransform';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a 2x2 ImageData with known RGBA pixel values. */
function makeImageData(r: number, g: number, b: number, a = 255): ImageData {
  const img = new ImageData(2, 2);
  for (let i = 0; i < 4; i++) {
    const off = i * 4;
    img.data[off] = r;
    img.data[off + 1] = g;
    img.data[off + 2] = b;
    img.data[off + 3] = a;
  }
  return img;
}

/**
 * Compare two ImageData buffers and assert every RGB channel is within
 * the given tolerance. Alpha is expected to be identical.
 */
function expectImageDataClose(
  actual: ImageData,
  expected: ImageData,
  tolerance: number,
): void {
  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);
  const len = actual.data.length;
  for (let i = 0; i < len; i++) {
    const channel = i % 4;
    if (channel === 3) {
      // Alpha must match exactly
      expect(actual.data[i]).toBe(expected.data[i]);
    } else {
      const diff = Math.abs(actual.data[i]! - expected.data[i]!);
      if (diff > tolerance) {
        throw new Error(
          `Pixel byte [${i}] (channel ${channel}): ` +
            `expected ${expected.data[i]} +/-${tolerance}, got ${actual.data[i]} (diff=${diff})`,
        );
      }
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ColorTransformPipeline (CPU fallback)', () => {
  let pipeline: ColorTransformPipeline;

  beforeEach(async () => {
    pipeline = new ColorTransformPipeline();
    await pipeline.waitForInit();
  });

  // ── 1. Identity transform ──────────────────────────────────────────────

  it('identity transform: same space returns identical ImageData', () => {
    const src = makeImageData(128, 64, 200);
    const result = pipeline.transformFrame(src, 'rec709', 'rec709');
    // transformFrame short-circuits on same space and returns the same object
    expect(result).toBe(src);
  });

  // ── 2. Rec.709 -> Rec.2020 roundtrip ──────────────────────────────────

  it('Rec.709 -> Rec.2020 -> Rec.709 roundtrip is approximately equal', () => {
    const src = makeImageData(180, 100, 60);
    const intermediate = pipeline.transformFrame(src, 'rec709', 'rec2020');
    const roundtrip = pipeline.transformFrame(intermediate, 'rec2020', 'rec709');
    expectImageDataClose(roundtrip, src, 2);
  });

  // ── 3. Rec.709 -> DCI-P3 roundtrip ────────────────────────────────────

  it('Rec.709 -> DCI-P3 -> Rec.709 roundtrip is approximately equal', () => {
    const src = makeImageData(200, 150, 100);
    const intermediate = pipeline.transformFrame(src, 'rec709', 'dci-p3');
    const roundtrip = pipeline.transformFrame(intermediate, 'dci-p3', 'rec709');
    expectImageDataClose(roundtrip, src, 2);
  });

  // ── 4. sRGB linearize -> encode roundtrip ─────────────────────────────

  it('sRGB linearize -> encode roundtrip preserves values', () => {
    const src = makeImageData(220, 130, 45);
    const linear = pipeline.applyTransferFunction(src, 'srgb-linearize');
    const encoded = pipeline.applyTransferFunction(linear, 'srgb-encode');
    expectImageDataClose(encoded, src, 2);
  });

  // ── 5. PQ EOTF -> inverse EOTF roundtrip ─────────────────────────────

  it('PQ EOTF -> inverse EOTF roundtrip is within tolerance', () => {
    const src = makeImageData(200, 150, 100);
    const decoded = pipeline.applyTransferFunction(src, 'pq-eotf');
    const reencoded = pipeline.applyTransferFunction(decoded, 'pq-inv-eotf');
    // PQ curve has steep gradients that amplify 8-bit quantization error
    expectImageDataClose(reencoded, src, 8);
  });

  // ── 6. HLG OETF -> EOTF roundtrip ────────────────────────────────────

  it('HLG OETF -> EOTF roundtrip is within tolerance', () => {
    const src = makeImageData(160, 80, 40);
    const hlgEncoded = pipeline.applyTransferFunction(src, 'hlg-oetf');
    const hlgDecoded = pipeline.applyTransferFunction(hlgEncoded, 'hlg-eotf');
    expectImageDataClose(hlgDecoded, src, 2);
  });

  // ── 7. ACEScct encode -> decode roundtrip ─────────────────────────────

  it('ACEScct encode -> decode roundtrip preserves values', () => {
    const src = makeImageData(180, 120, 60);
    const encoded = pipeline.applyTransferFunction(src, 'acescct-encode');
    const decoded = pipeline.applyTransferFunction(encoded, 'acescct-decode');
    expectImageDataClose(decoded, src, 2);
  });

  // ── 8. GPU not available in test environment ──────────────────────────

  it('GPU is not available in the jsdom test environment', () => {
    expect(pipeline.isGPUAvailable).toBe(false);
  });
});
