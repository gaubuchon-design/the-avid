// ═══════════════════════════════════════════════════════════════════════════
//  Brightness & Contrast Effect
//  Canvas 2D pixel-level implementation.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply brightness and contrast adjustments to ImageData pixels.
 *
 * @param data     Pixel data (RGBA Uint8ClampedArray)
 * @param brightness  -100 to 100 (0 = no change)
 * @param contrast    -100 to 100 (0 = no change)
 * @param useLegacy   Legacy mode uses simpler linear math (like Photoshop legacy)
 */
export function applyBrightnessContrast(
  data: Uint8ClampedArray,
  brightness: number,
  contrast: number,
  useLegacy = false,
): void {
  if (brightness === 0 && contrast === 0) return;

  const len = data.length;

  if (useLegacy) {
    // Legacy: simple linear brightness + contrast
    const b = brightness * 2.55; // -255 to 255
    const c = contrast / 100;
    const factor = (259 * (c * 255 + 255)) / (255 * (259 - c * 255));

    for (let i = 0; i < len; i += 4) {
      data[i]     = clamp(factor * (data[i]     - 128 + b) + 128);
      data[i + 1] = clamp(factor * (data[i + 1] - 128 + b) + 128);
      data[i + 2] = clamp(factor * (data[i + 2] - 128 + b) + 128);
      // Alpha unchanged
    }
  } else {
    // Modern: apply brightness as a curve, contrast as S-curve
    // Brightness: shift via gamma-like curve
    const bNorm = brightness / 100; // -1 to 1
    // Contrast: S-curve via sigmoid
    const cNorm = contrast / 100; // -1 to 1
    const contrastFactor = Math.tan((cNorm + 1) * Math.PI / 4);

    for (let i = 0; i < len; i += 4) {
      for (let c = 0; c < 3; c++) {
        let val = data[i + c] / 255;
        // Brightness
        if (bNorm > 0) {
          val = val + (1 - val) * bNorm;
        } else {
          val = val + val * bNorm;
        }
        // Contrast
        val = (val - 0.5) * contrastFactor + 0.5;
        data[i + c] = clamp(val * 255);
      }
    }
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
