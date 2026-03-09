// =============================================================================
//  Boris FX Film Look Effects
//  Film Damage, Day-for-Night, S-Curves
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** Simple seeded PRNG (xorshift32). */
function xorshift(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296); // 0-1
  };
}

// ─── Film Damage ─────────────────────────────────────────────────────────────

/**
 * Apply procedural film damage effects: scratches, dust, flicker, color shift, gate weave.
 *
 * @param imageData  Source image (modified in place)
 * @param scratches  0-100% — vertical scratch lines
 * @param dust       0-100% — dust specks and hair
 * @param flicker    0-100% — brightness flicker
 * @param colorShift 0-100% — random color channel shift
 * @param gate       0-100% — gate weave (vertical position jitter)
 * @param frame      Current frame number for animation
 */
export function applyFilmDamage(
  imageData: ImageData,
  scratches: number,
  dust: number,
  flicker: number,
  colorShift: number,
  gate: number,
  frame: number,
): void {
  if (scratches <= 0 && dust <= 0 && flicker <= 0 && colorShift <= 0 && gate <= 0) return;

  const { width, height, data } = imageData;
  const rng = xorshift(frame * 7919 + 42);

  // Gate weave — shift entire image vertically
  if (gate > 0) {
    const gateNorm = gate / 100;
    const shiftY = Math.round((rng() - 0.5) * gateNorm * 6);
    const shiftX = Math.round((rng() - 0.5) * gateNorm * 2);

    if (shiftY !== 0 || shiftX !== 0) {
      const src = new Uint8ClampedArray(data);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcY = y - shiftY;
          const srcX = x - shiftX;
          const dIdx = (y * width + x) * 4;

          if (srcY >= 0 && srcY < height && srcX >= 0 && srcX < width) {
            const sIdx = (srcY * width + srcX) * 4;
            data[dIdx] = src[sIdx];
            data[dIdx + 1] = src[sIdx + 1];
            data[dIdx + 2] = src[sIdx + 2];
            data[dIdx + 3] = src[sIdx + 3];
          } else {
            data[dIdx] = 0;
            data[dIdx + 1] = 0;
            data[dIdx + 2] = 0;
            data[dIdx + 3] = 255;
          }
        }
      }
    }
  }

  // Flicker — global brightness variation
  if (flicker > 0) {
    const flickerNorm = flicker / 100;
    const flickerAmount = 1.0 + (rng() - 0.5) * flickerNorm * 0.3;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] * flickerAmount);
      data[i + 1] = clamp(data[i + 1] * flickerAmount);
      data[i + 2] = clamp(data[i + 2] * flickerAmount);
    }
  }

  // Color shift — random per-channel offset
  if (colorShift > 0) {
    const csNorm = colorShift / 100;
    const rShift = (rng() - 0.5) * csNorm * 30;
    const gShift = (rng() - 0.5) * csNorm * 30;
    const bShift = (rng() - 0.5) * csNorm * 30;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp(data[i] + rShift);
      data[i + 1] = clamp(data[i + 1] + gShift);
      data[i + 2] = clamp(data[i + 2] + bShift);
    }
  }

  // Scratches — vertical lines
  if (scratches > 0) {
    const scratchNorm = scratches / 100;
    const numScratches = Math.round(scratchNorm * 5);

    for (let s = 0; s < numScratches; s++) {
      if (rng() > scratchNorm * 0.3) continue; // random appearance

      const scratchX = Math.round(rng() * width);
      const scratchWidth = Math.max(1, Math.round(rng() * 2));
      const scratchBrightness = 180 + rng() * 75;
      const startY = Math.round(rng() * height * 0.2);
      const endY = height - Math.round(rng() * height * 0.2);

      for (let y = startY; y < endY; y++) {
        for (let dx = 0; dx < scratchWidth; dx++) {
          const x = scratchX + dx;
          if (x < 0 || x >= width) continue;
          const idx = (y * width + x) * 4;
          const wobble = Math.round(Math.sin(y * 0.1) * 1);
          const wx = x + wobble;
          if (wx < 0 || wx >= width) continue;
          const wIdx = (y * width + wx) * 4;
          const alpha = 0.5 * scratchNorm;
          data[wIdx] = clamp(data[wIdx] * (1 - alpha) + scratchBrightness * alpha);
          data[wIdx + 1] = clamp(data[wIdx + 1] * (1 - alpha) + scratchBrightness * alpha);
          data[wIdx + 2] = clamp(data[wIdx + 2] * (1 - alpha) + scratchBrightness * alpha);
        }
      }
    }
  }

  // Dust — random specks
  if (dust > 0) {
    const dustNorm = dust / 100;
    const numDust = Math.round(dustNorm * 80);

    for (let d = 0; d < numDust; d++) {
      const dx = Math.round(rng() * width);
      const dy = Math.round(rng() * height);
      const dustSize = Math.max(1, Math.round(rng() * 3));
      const dustBright = rng() > 0.5 ? 220 + rng() * 35 : rng() * 40; // bright or dark specks

      for (let sy = -dustSize; sy <= dustSize; sy++) {
        for (let sx = -dustSize; sx <= dustSize; sx++) {
          if (sx * sx + sy * sy > dustSize * dustSize) continue;
          const px = dx + sx;
          const py = dy + sy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const idx = (py * width + px) * 4;
          const alpha = dustNorm * 0.6;
          data[idx] = clamp(data[idx] * (1 - alpha) + dustBright * alpha);
          data[idx + 1] = clamp(data[idx + 1] * (1 - alpha) + dustBright * alpha);
          data[idx + 2] = clamp(data[idx + 2] * (1 - alpha) + dustBright * alpha);
        }
      }
    }

    // Hair/fiber artifacts
    const numHairs = Math.round(dustNorm * 2);
    for (let h = 0; h < numHairs; h++) {
      if (rng() > dustNorm * 0.15) continue;
      const hx = Math.round(rng() * width);
      const hy = Math.round(rng() * height);
      const hLen = 10 + Math.round(rng() * 40);
      const hAngle = rng() * Math.PI;
      const hairBright = 20 + rng() * 30;

      for (let t = 0; t < hLen; t++) {
        const px = Math.round(hx + Math.cos(hAngle) * t + Math.sin(t * 0.3) * 2);
        const py = Math.round(hy + Math.sin(hAngle) * t + Math.cos(t * 0.2) * 2);
        if (px < 0 || px >= width || py < 0 || py >= height) continue;
        const idx = (py * width + px) * 4;
        const alpha = dustNorm * 0.4;
        data[idx] = clamp(data[idx] * (1 - alpha) + hairBright * alpha);
        data[idx + 1] = clamp(data[idx + 1] * (1 - alpha) + hairBright * alpha);
        data[idx + 2] = clamp(data[idx + 2] * (1 - alpha) + hairBright * alpha);
      }
    }
  }
}

// ─── Day-for-Night ───────────────────────────────────────────────────────────

/**
 * Apply a day-for-night color transformation.
 * Darkens the image and applies a blue tint to simulate nighttime footage.
 *
 * @param data       Pixel data (RGBA) — modified in place
 * @param blueTint   0-100 — amount of blue tint
 * @param contrast   -100 to 100 — contrast adjustment
 * @param saturation -100 to 100 — saturation adjustment
 * @param brightness -100 to 100 — brightness adjustment
 */
export function applyDayForNight(
  data: Uint8ClampedArray,
  blueTint: number,
  contrast: number,
  saturation: number,
  brightness: number,
): void {
  const blueNorm = blueTint / 100;
  const contFactor = (contrast + 100) / 100; // 0-2 range
  const satNorm = (saturation + 100) / 200;  // 0-1 range (0.5 = neutral)
  const brightShift = (brightness / 100) * 100; // -100 to 100

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Step 1: Darken
    r = clamp(r * 0.4 + brightShift);
    g = clamp(g * 0.35 + brightShift);
    b = clamp(b * 0.5 + brightShift);

    // Step 2: Apply blue tint
    r = clamp(r * (1.0 - blueNorm * 0.4));
    g = clamp(g * (1.0 - blueNorm * 0.2));
    b = clamp(b + blueNorm * 40);

    // Step 3: Adjust contrast
    r = clamp(((r / 255 - 0.5) * contFactor + 0.5) * 255);
    g = clamp(((g / 255 - 0.5) * contFactor + 0.5) * 255);
    b = clamp(((b / 255 - 0.5) * contFactor + 0.5) * 255);

    // Step 4: Adjust saturation
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const satFactor = satNorm * 2; // 0-2 range (1 = neutral)
    r = clamp(lum + (r - lum) * satFactor);
    g = clamp(lum + (g - lum) * satFactor);
    b = clamp(lum + (b - lum) * satFactor);

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// ─── S-Curves ────────────────────────────────────────────────────────────────

/**
 * Apply an S-curve contrast enhancement.
 * Uses a sigmoid function to increase midtone contrast.
 *
 * @param data    Pixel data (RGBA) — modified in place
 * @param amount  0-100% — strength of the S-curve
 * @param channel 'rgb' | 'red' | 'green' | 'blue' — which channels to affect
 */
export function applySCurves(
  data: Uint8ClampedArray,
  amount: number,
  channel: string,
): void {
  if (amount <= 0) return;

  const strength = (amount / 100) * 3; // control sigmoid steepness

  // Build lookup table for the S-curve
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    // Sigmoid S-curve: maps 0-1 to 0-1 with increased midtone contrast
    const curved = 1.0 / (1.0 + Math.exp(-strength * (x - 0.5) * 10));
    // Normalize: the sigmoid doesn't map exactly 0->0 and 1->1
    const low = 1.0 / (1.0 + Math.exp(-strength * (-0.5) * 10));
    const high = 1.0 / (1.0 + Math.exp(-strength * (0.5) * 10));
    const normalized = (curved - low) / (high - low);
    // Blend between original and curved based on amount
    const blended = x + (normalized - x) * (amount / 100);
    lut[i] = clamp(blended * 255);
  }

  const affectR = channel === 'rgb' || channel === 'red';
  const affectG = channel === 'rgb' || channel === 'green';
  const affectB = channel === 'rgb' || channel === 'blue';

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    if (affectR) data[i] = lut[data[i]];
    if (affectG) data[i + 1] = lut[data[i + 1]];
    if (affectB) data[i + 2] = lut[data[i + 2]];
  }
}
