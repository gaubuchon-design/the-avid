// ═══════════════════════════════════════════════════════════════════════════
//  Noise Effect
//  Adds Gaussian or uniform random noise overlay.
// ═══════════════════════════════════════════════════════════════════════════

/** Simple seeded PRNG for deterministic animation. */
function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Box-Muller transform for Gaussian random values. */
function gaussianRandom(rand: () => number): number {
  const u1 = rand() || 0.0001;
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Add noise to image data.
 *
 * @param imageData Source image (modified in place)
 * @param amount    0-100 noise strength
 * @param type      'gaussian' | 'uniform'
 * @param colored   If true, apply different noise per channel; else monochrome
 * @param frame     Frame number for animated noise seed
 */
export function applyNoise(
  imageData: ImageData,
  amount: number,
  type: string,
  colored: boolean,
  frame: number,
): void {
  if (amount <= 0) return;

  const { data } = imageData;
  const strength = (amount / 100) * 128; // max +-128 noise range
  const rand = seededRandom(frame * 31337 + 42);

  for (let i = 0; i < data.length; i += 4) {
    if (colored) {
      for (let c = 0; c < 3; c++) {
        const n = type === 'gaussian'
          ? gaussianRandom(rand) * strength
          : (rand() - 0.5) * 2 * strength;
        data[i + c] = Math.max(0, Math.min(255, Math.round(data[i + c] + n)));
      }
    } else {
      const n = type === 'gaussian'
        ? gaussianRandom(rand) * strength
        : (rand() - 0.5) * 2 * strength;
      data[i] = Math.max(0, Math.min(255, Math.round(data[i] + n)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] + n)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] + n)));
    }
    // alpha unchanged
  }
}
