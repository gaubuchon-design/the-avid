// ═══════════════════════════════════════════════════════════════════════════
//  Curves Effect
//  Per-channel tone curve adjustment via shadow/midtone/highlight controls.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a 256-entry lookup table from three control values.
 * Uses a smooth cubic spline through (0, shadows), (128, midtones), (255, highlights).
 */
function buildLUT(shadows: number, midtones: number, highlights: number): Uint8Array {
  const lut = new Uint8Array(256);

  // Control points: input → output offset
  // shadows adjusts 0, midtones adjusts 128, highlights adjusts 255
  const p0 = Math.max(0, Math.min(255, 0 + shadows * 2.55));
  const p1 = Math.max(0, Math.min(255, 128 + midtones * 1.28));
  const p2 = Math.max(0, Math.min(255, 255 + highlights * 2.55));

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // Quadratic Bezier through 3 control points
    const u = 1 - t;
    const val = u * u * p0 + 2 * u * t * p1 + t * t * p2;
    lut[i] = Math.max(0, Math.min(255, Math.round(val)));
  }

  return lut;
}

/**
 * Apply curves adjustment to image data.
 *
 * @param data       Pixel data (RGBA)
 * @param channel    'rgb' | 'red' | 'green' | 'blue'
 * @param shadows    -100 to 100 shadow adjustment
 * @param midtones   -100 to 100 midtone adjustment
 * @param highlights -100 to 100 highlight adjustment
 */
export function applyCurves(
  data: Uint8ClampedArray,
  channel: string,
  shadows: number,
  midtones: number,
  highlights: number,
): void {
  if (shadows === 0 && midtones === 0 && highlights === 0) return;

  const lut = buildLUT(shadows, midtones, highlights);

  for (let i = 0; i < data.length; i += 4) {
    switch (channel) {
      case 'rgb':
        data[i] = lut[data[i]!]!;
        data[i + 1] = lut[data[i + 1]!]!;
        data[i + 2] = lut[data[i + 2]!]!;
        break;
      case 'red':
        data[i] = lut[data[i]!]!;
        break;
      case 'green':
        data[i + 1] = lut[data[i + 1]!]!;
        break;
      case 'blue':
        data[i + 2] = lut[data[i + 2]!]!;
        break;
    }
  }
}
