// ═══════════════════════════════════════════════════════════════════════════
//  Luma Key Effect
//  Keys out pixels based on luminance threshold.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply luma key — make pixels transparent based on brightness.
 *
 * @param data      Pixel data (RGBA Uint8ClampedArray)
 * @param threshold 0-100 — luminance cutoff (keyed below this value)
 * @param softness  0-100 — edge softness for anti-aliased keying
 * @param invert    If true, key bright pixels instead of dark
 */
export function applyLumaKey(
  data: Uint8ClampedArray,
  threshold: number,
  softness: number,
  invert: boolean,
): void {
  const threshNorm = threshold / 100;
  const softNorm = softness / 100;
  const innerThreshold = Math.max(0, threshNorm - softNorm * 0.5);
  const outerThreshold = Math.min(1, threshNorm + softNorm * 0.5);
  const range = outerThreshold - innerThreshold || 0.001;

  for (let i = 0; i < data.length; i += 4) {
    // ITU-R BT.709 luminance
    const luma = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const l = invert ? 1 - luma : luma;

    if (l < innerThreshold) {
      // Fully transparent (keyed)
      data[i + 3] = 0;
    } else if (l < outerThreshold) {
      // Soft edge — partial transparency
      const alpha = (l - innerThreshold) / range;
      data[i + 3] = Math.round(data[i + 3] * alpha);
    }
    // else: fully opaque, leave alpha unchanged
  }
}
