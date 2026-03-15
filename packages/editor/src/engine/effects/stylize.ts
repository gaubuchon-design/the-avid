// ═══════════════════════════════════════════════════════════════════════════
//  Stylize Effects: Vignette, Film Grain, Glow, Drop Shadow
// ═══════════════════════════════════════════════════════════════════════════

// ─── Vignette ─────────────────────────────────────────────────────────────

/**
 * Apply a vignette effect (darken edges).
 *
 * @param data        Pixel data (RGBA)
 * @param width       Image width
 * @param height      Image height
 * @param amount      0-100 — strength of darkening
 * @param midpoint    0-100 — where the vignette starts (% from center)
 * @param roundness   0-100 — 100 = circular, 0 = rectangular
 * @param feather     0-100 — softness of the vignette edge
 */
export function applyVignette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
  midpoint: number,
  roundness: number,
  feather: number,
): void {
  if (amount <= 0) return;

  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const midNorm = midpoint / 100;
  const featherNorm = Math.max(feather / 100, 0.01);
  const amountNorm = amount / 100;
  const roundNorm = roundness / 100;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;

      // Distance calculation — blend between rectangular and circular
      const circDist = Math.sqrt(dx * dx + dy * dy);
      const rectDist = Math.max(Math.abs(dx), Math.abs(dy));
      const dist = circDist * roundNorm + rectDist * (1 - roundNorm);

      // Vignette factor
      const edge = Math.max(0, (dist - midNorm) / featherNorm);
      const factor = 1 - Math.min(1, edge * edge) * amountNorm;

      const idx = (y * width + x) * 4;
      data[idx]     = Math.round(data[idx]! * factor);
      data[idx + 1] = Math.round(data[idx + 1]! * factor);
      data[idx + 2] = Math.round(data[idx + 2]! * factor);
    }
  }
}

// ─── Film Grain ───────────────────────────────────────────────────────────

/**
 * Apply film grain noise overlay.
 *
 * @param data     Pixel data (RGBA)
 * @param amount   0-100 — grain intensity
 * @param size     0.5-5 — grain size (not implemented at pixel level, affects intensity scaling)
 * @param softness 0-100 — blend softness
 * @param seed     Random seed for deterministic noise (frame number for animated grain)
 */
export function applyFilmGrain(
  data: Uint8ClampedArray,
  amount: number,
  size: number,
  softness: number,
  seed = 0,
): void {
  if (amount <= 0) return;

  const intensity = (amount / 100) * 60; // max ±60 levels of noise
  const softNorm = softness / 100;
  let rng = seed || (Date.now() % 1000000);

  for (let i = 0; i < data.length; i += 4) {
    // Simple PRNG (xorshift-like)
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    const noise = ((rng % 200) - 100) / 100 * intensity;

    // Apply noise with luminance-aware blending
    const lum = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255;
    const blend = 1 - softNorm * 0.5; // softness reduces effect

    data[i]     = clamp(data[i]! + noise * blend);
    data[i + 1] = clamp(data[i + 1]! + noise * blend);
    data[i + 2] = clamp(data[i + 2]! + noise * blend);
  }
}

// ─── Glow ─────────────────────────────────────────────────────────────────

/**
 * Apply a glow effect — brightens bright areas with a blurred halo.
 * Operates on imageData directly using a threshold and additive blend.
 *
 * @param imageData  Full ImageData
 * @param radius     Glow blur radius
 * @param intensity  Glow strength 0-100
 * @param threshold  Brightness threshold 0-100 — only pixels above this glow
 * @param color      Glow tint color (#RRGGBB, #ffffff = neutral)
 */
export function applyGlow(
  imageData: ImageData,
  radius: number,
  intensity: number,
  threshold: number,
  color: string,
): void {
  if (intensity <= 0 || radius <= 0) return;

  const { width, height, data } = imageData;
  const tint = hexToRgb(color);
  const threshVal = (threshold / 100) * 255;
  const intNorm = intensity / 100;

  // Create bright-pass copy
  const bright = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
    if (lum > threshVal) {
      bright[i]     = data[i]!;
      bright[i + 1] = data[i + 1]!;
      bright[i + 2] = data[i + 2]!;
      bright[i + 3] = 255;
    }
  }

  // Simple box blur on bright pass
  const r = Math.min(Math.round(radius), 20);
  simpleBlur(bright, width, height, r);

  // Additive blend
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp(data[i]! + bright[i]! * intNorm * (tint.r / 255));
    data[i + 1] = clamp(data[i + 1]! + bright[i + 1]! * intNorm * (tint.g / 255));
    data[i + 2] = clamp(data[i + 2]! + bright[i + 2]! * intNorm * (tint.b / 255));
  }
}

// ─── Drop Shadow ──────────────────────────────────────────────────────────

/**
 * Apply a drop shadow to non-transparent areas.
 * Renders a shadow copy offset by angle/distance, blurs it, composites underneath.
 *
 * @param imageData Full ImageData
 * @param color     Shadow color hex
 * @param opacity   Shadow opacity 0-100
 * @param angle     Shadow direction in degrees
 * @param distance  Shadow offset in pixels
 * @param blur      Shadow blur radius
 */
export function applyDropShadow(
  imageData: ImageData,
  color: string,
  opacity: number,
  angle: number,
  distance: number,
  blur: number,
): void {
  if (opacity <= 0) return;

  const { width, height, data } = imageData;
  const shadowColor = hexToRgb(color);
  const opNorm = opacity / 100;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.round(Math.cos(rad) * distance);
  const dy = Math.round(Math.sin(rad) * distance);

  // Create shadow layer
  const shadow = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcX = x - dx;
      const srcY = y - dy;
      if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) continue;

      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;

      if (data[srcIdx + 3]! > 0) {
        shadow[dstIdx]     = shadowColor.r;
        shadow[dstIdx + 1] = shadowColor.g;
        shadow[dstIdx + 2] = shadowColor.b;
        shadow[dstIdx + 3] = Math.round(data[srcIdx + 3]! * opNorm);
      }
    }
  }

  // Blur shadow
  if (blur > 0) {
    simpleBlur(shadow, width, height, Math.min(Math.round(blur), 15));
  }

  // Composite: draw shadow underneath original
  for (let i = 0; i < data.length; i += 4) {
    const origAlpha = data[i + 3]! / 255;
    const shadowAlpha = shadow[i + 3]! / 255;

    if (shadowAlpha > 0 && origAlpha < 1) {
      const blendAlpha = shadowAlpha * (1 - origAlpha);
      data[i]     = clamp(data[i]! * origAlpha + shadow[i]! * blendAlpha);
      data[i + 1] = clamp(data[i + 1]! * origAlpha + shadow[i + 1]! * blendAlpha);
      data[i + 2] = clamp(data[i + 2]! * origAlpha + shadow[i + 2]! * blendAlpha);
      data[i + 3] = clamp((origAlpha + blendAlpha) * 255);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function simpleBlur(data: Uint8ClampedArray, width: number, height: number, r: number): void {
  if (r <= 0) return;
  const temp = new Uint8ClampedArray(data.length);

  // Horizontal
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.min(Math.max(x + dx, 0), width - 1);
        const idx = (y * width + nx) * 4;
        sr += data[idx]!; sg += data[idx + 1]!; sb += data[idx + 2]!; sa += data[idx + 3]!;
        count++;
      }
      const idx = (y * width + x) * 4;
      temp[idx] = Math.round(sr / count);
      temp[idx + 1] = Math.round(sg / count);
      temp[idx + 2] = Math.round(sb / count);
      temp[idx + 3] = Math.round(sa / count);
    }
  }

  // Vertical
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.min(Math.max(y + dy, 0), height - 1);
        const idx = (ny * width + x) * 4;
        sr += temp[idx]!; sg += temp[idx + 1]!; sb += temp[idx + 2]!; sa += temp[idx + 3]!;
        count++;
      }
      const idx = (y * width + x) * 4;
      data[idx] = Math.round(sr / count);
      data[idx + 1] = Math.round(sg / count);
      data[idx + 2] = Math.round(sb / count);
      data[idx + 3] = Math.round(sa / count);
    }
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
