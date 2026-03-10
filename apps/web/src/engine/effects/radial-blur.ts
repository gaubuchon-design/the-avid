// ═══════════════════════════════════════════════════════════════════════════
//  Radial Blur Effect
//  Spin (circular) or Zoom (radial) blur from a center point.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply radial blur — spin or zoom from a center point.
 *
 * @param imageData Source image data (modified in place)
 * @param amount    0-100 blur strength
 * @param type      'spin' or 'zoom'
 * @param centerX   0-100 center X position (%)
 * @param centerY   0-100 center Y position (%)
 */
export function applyRadialBlur(
  imageData: ImageData,
  amount: number,
  type: string,
  centerX: number,
  centerY: number,
): void {
  if (amount <= 0) return;

  const { width, height, data } = imageData;
  const cx = (centerX / 100) * width;
  const cy = (centerY / 100) * height;
  const samples = Math.max(3, Math.round(amount / 5) * 2 + 1);
  const strength = amount / 100;

  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      let count = 0;

      const dx = x - cx;
      const dy = y - cy;

      for (let s = 0; s < samples; s++) {
        const t = (s / (samples - 1) - 0.5) * strength;
        let sx: number, sy: number;

        if (type === 'spin') {
          // Rotate around center
          const cos = Math.cos(t);
          const sin = Math.sin(t);
          sx = Math.round(cx + dx * cos - dy * sin);
          sy = Math.round(cy + dx * sin + dy * cos);
        } else {
          // Zoom from center
          const scale = 1 + t;
          sx = Math.round(cx + dx * scale);
          sy = Math.round(cy + dy * scale);
        }

        if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

        const si = (sy * width + sx) * 4;
        r += src[si]!;
        g += src[si + 1]!;
        b += src[si + 2]!;
        a += src[si + 3]!;
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
