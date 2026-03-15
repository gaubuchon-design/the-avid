// ═══════════════════════════════════════════════════════════════════════════
//  Sharpen Effect (Unsharp Mask)
//  Convolution-based sharpening with threshold control.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply unsharp mask sharpening.
 * Creates a blurred copy, then amplifies the difference between original
 * and blurred to enhance edges.
 *
 * @param imageData  Source image data (modified in place)
 * @param amount     Sharpening strength 0-200%
 * @param radius     Blur radius for the unsharp mask 0.5-10px
 * @param threshold  Minimum brightness difference to sharpen 0-255
 */
export function applySharpen(
  imageData: ImageData,
  amount: number,
  radius: number,
  threshold: number,
): ImageData {
  if (amount <= 0) return imageData;

  const { width, height, data } = imageData;
  const strength = amount / 100;
  const r = Math.max(1, Math.round(radius));

  // Create a simple box-blurred copy for the unsharp mask
  const blurred = new Uint8ClampedArray(data);
  simpleBoxBlur(blurred, width, height, r);

  // Apply unsharp mask: output = original + (original - blurred) * strength
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = data[i + c]! - blurred[i + c]!;
      // Only sharpen if difference exceeds threshold
      if (Math.abs(diff) >= threshold) {
        data[i + c] = clamp(data[i + c]! + diff * strength);
      }
    }
  }

  return imageData;
}

/** Simple single-pass box blur for unsharp mask computation. */
function simpleBoxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const temp = new Uint8ClampedArray(data.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.min(Math.max(x + dx, 0), width - 1);
        const idx = (y * width + nx) * 4;
        sumR += data[idx]!;
        sumG += data[idx + 1]!;
        sumB += data[idx + 2]!;
        count++;
      }
      const idx = (y * width + x) * 4;
      temp[idx]     = Math.round(sumR / count);
      temp[idx + 1] = Math.round(sumG / count);
      temp[idx + 2] = Math.round(sumB / count);
      temp[idx + 3] = data[idx + 3]!;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(Math.max(y + dy, 0), height - 1);
        const idx = (ny * width + x) * 4;
        sumR += temp[idx]!;
        sumG += temp[idx + 1]!;
        sumB += temp[idx + 2]!;
        count++;
      }
      const idx = (y * width + x) * 4;
      data[idx]     = Math.round(sumR / count);
      data[idx + 1] = Math.round(sumG / count);
      data[idx + 2] = Math.round(sumB / count);
    }
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
