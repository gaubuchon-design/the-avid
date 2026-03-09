// ═══════════════════════════════════════════════════════════════════════════
//  Glitch Effect
//  Digital glitch with block displacement, RGB split, and scanlines.
// ═══════════════════════════════════════════════════════════════════════════

/** Simple seeded PRNG for deterministic animation. */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Apply digital glitch effect.
 *
 * @param imageData Source image data (modified in place)
 * @param amount    0-100 glitch intensity
 * @param blockSize Block height in pixels for displacement
 * @param rgbSplit  RGB channel offset in pixels
 * @param scanlines Whether to add scanline overlay
 * @param frame     Frame number for animation seed
 */
export function applyGlitch(
  imageData: ImageData,
  amount: number,
  blockSize: number,
  rgbSplit: number,
  scanlines: boolean,
  frame: number,
): void {
  if (amount <= 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const rand = seededRandom(frame * 7919);
  const intensity = amount / 100;
  const numBlocks = Math.max(1, Math.round(intensity * 10));

  // Block displacement
  for (let n = 0; n < numBlocks; n++) {
    if (rand() > intensity) continue;

    const by = Math.floor(rand() * height);
    const bh = Math.max(2, Math.min(blockSize, Math.floor(rand() * blockSize)));
    const offset = Math.floor((rand() - 0.5) * width * 0.3 * intensity);

    for (let y = by; y < Math.min(height, by + bh); y++) {
      for (let x = 0; x < width; x++) {
        const sx = x - offset;
        if (sx < 0 || sx >= width) continue;

        const di = (y * width + x) * 4;
        const si = (y * width + sx) * 4;
        data[di] = src[si];
        data[di + 1] = src[si + 1];
        data[di + 2] = src[si + 2];
        data[di + 3] = src[si + 3];
      }
    }
  }

  // RGB channel split
  if (rgbSplit > 0) {
    const split = Math.round(rgbSplit * intensity);
    const current = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const di = (y * width + x) * 4;
        // Shift red channel left, blue channel right
        const rxSrc = Math.min(width - 1, Math.max(0, x + split));
        const bxSrc = Math.min(width - 1, Math.max(0, x - split));
        data[di] = current[(y * width + rxSrc) * 4];         // red from offset
        data[di + 2] = current[(y * width + bxSrc) * 4 + 2]; // blue from offset
      }
    }
  }

  // Scanlines
  if (scanlines) {
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x++) {
        const di = (y * width + x) * 4;
        data[di] = Math.round(data[di] * 0.85);
        data[di + 1] = Math.round(data[di + 1] * 0.85);
        data[di + 2] = Math.round(data[di + 2] * 0.85);
      }
    }
  }
}
