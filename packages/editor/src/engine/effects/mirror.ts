// ═══════════════════════════════════════════════════════════════════════════
//  Mirror Effect
//  Mirrors image along horizontal, vertical, or both axes.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply mirror effect.
 *
 * @param imageData Source image (modified in place)
 * @param axis      'horizontal' | 'vertical' | 'both'
 * @param center    0-100 mirror center position (% of axis)
 */
export function applyMirror(
  imageData: ImageData,
  axis: string,
  center: number,
): void {
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);

  if (axis === 'horizontal' || axis === 'both') {
    const mirrorX = Math.round((center / 100) * width);
    for (let y = 0; y < height; y++) {
      for (let x = mirrorX; x < width; x++) {
        const mirroredX = 2 * mirrorX - x;
        if (mirroredX < 0 || mirroredX >= width) continue;
        const di = (y * width + x) * 4;
        const si = (y * width + mirroredX) * 4;
        data[di] = src[si]!;
        data[di + 1] = src[si + 1]!;
        data[di + 2] = src[si + 2]!;
        data[di + 3] = src[si + 3]!;
      }
    }
  }

  if (axis === 'vertical' || axis === 'both') {
    // Re-read current state for second axis
    const current = axis === 'both' ? new Uint8ClampedArray(data) : src;
    const mirrorY = Math.round((center / 100) * height);
    for (let y = mirrorY; y < height; y++) {
      const mirroredY = 2 * mirrorY - y;
      if (mirroredY < 0 || mirroredY >= height) continue;
      for (let x = 0; x < width; x++) {
        const di = (y * width + x) * 4;
        const si = (mirroredY * width + x) * 4;
        data[di] = current[si]!;
        data[di + 1] = current[si + 1]!;
        data[di + 2] = current[si + 2]!;
        data[di + 3] = current[si + 3]!;
      }
    }
  }
}
