// ═══════════════════════════════════════════════════════════════════════════
//  Directional Blur Effect
//  1D motion blur along a specified angle.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply directional (motion) blur along an angle.
 *
 * @param imageData Source image data (modified in place)
 * @param angle     Direction in degrees (0 = horizontal right)
 * @param length    Blur length in pixels
 */
export function applyDirectionalBlur(
  imageData: ImageData,
  angle: number,
  length: number,
): void {
  if (length <= 0) return;

  const { width, height, data } = imageData;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const samples = Math.max(1, Math.round(length));
  const halfSamples = samples / 2;

  // Work on a copy so we read original values
  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;

      for (let s = -halfSamples; s <= halfSamples; s++) {
        const sx = Math.round(x + dx * s);
        const sy = Math.round(y + dy * s);
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

        const si = (sy * width + sx) * 4;
        r += src[si];
        g += src[si + 1];
        b += src[si + 2];
        a += src[si + 3];
        count++;
      }

      if (count > 0) {
        const di = (y * width + x) * 4;
        data[di] = Math.round(r / count);
        data[di + 1] = Math.round(g / count);
        data[di + 2] = Math.round(b / count);
        data[di + 3] = Math.round(a / count);
      }
    }
  }
}
