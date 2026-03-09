// =============================================================================
//  Boris FX Edge & Matte Effects
//  Edge Cleaner, Matte Choker
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ─── Edge Cleaner ────────────────────────────────────────────────────────────

/**
 * Clean up alpha channel edges with erode, blur, contract, and softness operations.
 *
 * @param data     Pixel data (RGBA) — modified in place
 * @param width    Image width
 * @param height   Image height
 * @param erode    0-100 — erode/shrink the alpha edge
 * @param blur     0-100 — blur the alpha channel
 * @param contract 0-100 — contract the matte boundary
 * @param softness 0-100 — soften the alpha edges
 */
export function applyEdgeCleaner(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  erode: number,
  blur: number,
  contract: number,
  softness: number,
): void {
  if (erode <= 0 && blur <= 0 && contract <= 0 && softness <= 0) return;

  // Extract alpha channel
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    alpha[i / 4] = data[i + 3] / 255;
  }

  // Step 1: Erode — minimum filter on alpha
  if (erode > 0) {
    const erodeR = Math.max(1, Math.round((erode / 100) * 5));
    const temp = new Float32Array(alpha);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minVal = 1.0;
        for (let dy = -erodeR; dy <= erodeR; dy++) {
          for (let dx = -erodeR; dx <= erodeR; dx++) {
            if (dx * dx + dy * dy > erodeR * erodeR) continue;
            const ny = Math.min(Math.max(y + dy, 0), height - 1);
            const nx = Math.min(Math.max(x + dx, 0), width - 1);
            minVal = Math.min(minVal, temp[ny * width + nx]);
          }
        }
        alpha[y * width + x] = minVal;
      }
    }
  }

  // Step 2: Contract — threshold-based contraction
  if (contract > 0) {
    const contractThreshold = 1.0 - (contract / 100) * 0.5;
    for (let i = 0; i < alpha.length; i++) {
      if (alpha[i] < contractThreshold) {
        alpha[i] = Math.max(0, alpha[i] * (alpha[i] / contractThreshold));
      }
    }
  }

  // Step 3: Blur alpha channel
  if (blur > 0) {
    const blurR = Math.max(1, Math.round((blur / 100) * 8));

    // Horizontal pass
    const tempH = new Float32Array(alpha);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dx = -blurR; dx <= blurR; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), width - 1);
          sum += tempH[y * width + nx];
          count++;
        }
        alpha[y * width + x] = sum / count;
      }
    }

    // Vertical pass
    const tempV = new Float32Array(alpha);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0, count = 0;
        for (let dy = -blurR; dy <= blurR; dy++) {
          const ny = Math.min(Math.max(y + dy, 0), height - 1);
          sum += tempV[ny * width + x];
          count++;
        }
        alpha[y * width + x] = sum / count;
      }
    }
  }

  // Step 4: Softness — smoothstep on alpha to soften edges
  if (softness > 0) {
    const softNorm = softness / 100;
    const low = softNorm * 0.3;
    const high = 1.0 - softNorm * 0.1;

    for (let i = 0; i < alpha.length; i++) {
      const a = alpha[i];
      if (a > 0 && a < 1) {
        const t = Math.max(0, Math.min(1, (a - low) / (high - low)));
        alpha[i] = t * t * (3 - 2 * t); // smoothstep
      }
    }
  }

  // Write alpha back
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = clamp(alpha[i / 4] * 255);
  }
}

// ─── Matte Choker ────────────────────────────────────────────────────────────

/**
 * Expand or contract the matte (alpha channel) edge.
 * Positive choke contracts (shrinks) the matte, negative expands it.
 *
 * @param data        Pixel data (RGBA) — modified in place
 * @param width       Image width
 * @param height      Image height
 * @param chokeAmount -100 to 100 — positive = contract, negative = expand
 * @param softness    0-100 — edge softness after choking
 * @param graySmooth  0-100 — smooth semi-transparent areas
 */
export function applyMatteChoker(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  chokeAmount: number,
  softness: number,
  graySmooth: number,
): void {
  if (chokeAmount === 0 && softness <= 0 && graySmooth <= 0) return;

  // Extract alpha channel
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    alpha[i / 4] = data[i + 3] / 255;
  }

  // Step 1: Choke/expand using morphological operations
  if (chokeAmount !== 0) {
    const radius = Math.max(1, Math.round(Math.abs(chokeAmount) / 100 * 8));
    const isContract = chokeAmount > 0;
    const temp = new Float32Array(alpha);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let resultVal = isContract ? 1.0 : 0.0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const ny = Math.min(Math.max(y + dy, 0), height - 1);
            const nx = Math.min(Math.max(x + dx, 0), width - 1);
            const val = temp[ny * width + nx];

            if (isContract) {
              resultVal = Math.min(resultVal, val); // erosion
            } else {
              resultVal = Math.max(resultVal, val); // dilation
            }
          }
        }

        // Blend with original based on chokeAmount strength
        const strength = Math.abs(chokeAmount) / 100;
        alpha[y * width + x] = temp[y * width + x] * (1 - strength) + resultVal * strength;
      }
    }
  }

  // Step 2: Smooth semi-transparent (gray) values
  if (graySmooth > 0) {
    const smoothR = Math.max(1, Math.round((graySmooth / 100) * 4));
    const temp = new Float32Array(alpha);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const orig = temp[y * width + x];
        // Only smooth semi-transparent areas
        if (orig <= 0.01 || orig >= 0.99) continue;

        let sum = 0, count = 0;
        for (let dy = -smoothR; dy <= smoothR; dy++) {
          for (let dx = -smoothR; dx <= smoothR; dx++) {
            const ny = Math.min(Math.max(y + dy, 0), height - 1);
            const nx = Math.min(Math.max(x + dx, 0), width - 1);
            sum += temp[ny * width + nx];
            count++;
          }
        }
        alpha[y * width + x] = sum / count;
      }
    }
  }

  // Step 3: Softness — blur the alpha channel
  if (softness > 0) {
    const softR = Math.max(1, Math.round((softness / 100) * 5));

    // Horizontal
    const tempH = new Float32Array(alpha);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dx = -softR; dx <= softR; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), width - 1);
          sum += tempH[y * width + nx];
          count++;
        }
        alpha[y * width + x] = sum / count;
      }
    }

    // Vertical
    const tempV = new Float32Array(alpha);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0, count = 0;
        for (let dy = -softR; dy <= softR; dy++) {
          const ny = Math.min(Math.max(y + dy, 0), height - 1);
          sum += tempV[ny * width + x];
          count++;
        }
        alpha[y * width + x] = sum / count;
      }
    }
  }

  // Write alpha back
  for (let i = 0; i < data.length; i += 4) {
    data[i + 3] = clamp(alpha[i / 4] * 255);
  }
}
