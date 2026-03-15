// =============================================================================
//  Boris FX Light Effects
//  Light Wrap, Lens Flare, Bokeh Blur, Light Rays, Prism
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function simpleBlur(data: Uint8ClampedArray, width: number, height: number, r: number): void {
  if (r <= 0) return;
  const temp = new Uint8ClampedArray(data.length);

  // Horizontal pass
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

  // Vertical pass
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

// ─── Light Wrap ──────────────────────────────────────────────────────────────

/**
 * Apply edge light bleed from the background to composite foreground.
 * Creates a soft wrap of background light around the edges of foreground elements.
 *
 * @param imageData    Source image (modified in place)
 * @param wrapWidth    0-100 — width of the light wrap effect
 * @param intensity    0-100 — brightness of the wrap
 * @param blurRadius   0-100 — blur applied to the wrap
 * @param lumaSoftness 0-100 — luminance-based softness of the wrap
 */
export function applyLightWrap(
  imageData: ImageData,
  wrapWidth: number,
  intensity: number,
  blurRadius: number,
  lumaSoftness: number,
): void {
  if (intensity <= 0 || wrapWidth <= 0) return;

  const { width, height, data } = imageData;
  const intNorm = intensity / 100;
  const wrapNorm = wrapWidth / 100;
  const softNorm = lumaSoftness / 100;
  const blurR = Math.min(Math.round((blurRadius / 100) * 15), 15);

  // Create an edge mask from the alpha channel
  const edgeMask = new Uint8ClampedArray(width * height);
  const wrapPx = Math.max(1, Math.round(wrapNorm * 20));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3]! / 255;

      if (alpha > 0.1 && alpha < 0.95) {
        // Semi-transparent edge — wrap candidate
        edgeMask[y * width + x] = 255;
      } else if (alpha >= 0.95) {
        // Check if near a transparent edge
        let nearEdge = false;
        for (let dy = -wrapPx; dy <= wrapPx && !nearEdge; dy++) {
          for (let dx = -wrapPx; dx <= wrapPx && !nearEdge; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const nIdx = (ny * width + nx) * 4;
              if (data[nIdx + 3]! < 26) { // < 10% alpha
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= wrapPx) {
                  nearEdge = true;
                }
              }
            }
          }
        }
        if (nearEdge) {
          edgeMask[y * width + x] = 128;
        }
      }
    }
  }

  // Create the light wrap layer — bright, blurred copy of the image
  const wrapLayer = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const maskIdx = i / 4;
    const mask = edgeMask[maskIdx]! / 255;
    if (mask > 0) {
      const lum = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255;
      const lumFactor = 1.0 - softNorm * (1.0 - lum);
      wrapLayer[i] = clamp(data[i]! * mask * lumFactor);
      wrapLayer[i + 1] = clamp(data[i + 1]! * mask * lumFactor);
      wrapLayer[i + 2] = clamp(data[i + 2]! * mask * lumFactor);
      wrapLayer[i + 3] = 255;
    }
  }

  // Blur the wrap layer
  if (blurR > 0) {
    simpleBlur(wrapLayer, width, height, blurR);
  }

  // Additive composite
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i]! + wrapLayer[i]! * intNorm);
    data[i + 1] = clamp(data[i + 1]! + wrapLayer[i + 1]! * intNorm);
    data[i + 2] = clamp(data[i + 2]! + wrapLayer[i + 2]! * intNorm);
  }
}

// ─── Lens Flare ──────────────────────────────────────────────────────────────

/**
 * Generate a procedural lens flare and composite onto the image.
 *
 * @param imageData  Source image (modified in place)
 * @param posX       0-100% — horizontal position of the flare source
 * @param posY       0-100% — vertical position of the flare source
 * @param brightness 0-200% — overall brightness of the flare
 * @param scale      0-200% — scale of the flare elements
 * @param anamorphic 0-100% — horizontal stretch for anamorphic flare look
 */
export function applyLensFlare(
  imageData: ImageData,
  posX: number,
  posY: number,
  brightness: number,
  scale: number,
  anamorphic: number,
): void {
  if (brightness <= 0) return;

  const { width, height, data } = imageData;
  const cx = (posX / 100) * width;
  const cy = (posY / 100) * height;
  const bright = brightness / 100;
  const scaleNorm = scale / 100;
  const anaStretch = 1 + (anamorphic / 100) * 3; // up to 4x horizontal stretch

  // Generate flare elements: main glow + ring + streak
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / anaStretch;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = Math.sqrt(width * width + height * height) * 0.5;

      const idx = (y * width + x) * 4;

      // Main glow — inverse square falloff
      const glowRadius = 60 * scaleNorm;
      const glow = Math.max(0, 1.0 - dist / glowRadius);
      const glowIntensity = glow * glow * bright * 0.8;

      // Ring element
      const ringRadius = 120 * scaleNorm;
      const ringWidth = 15 * scaleNorm;
      const ringDist = Math.abs(dist - ringRadius);
      const ring = ringDist < ringWidth ? (1.0 - ringDist / ringWidth) * 0.3 * bright : 0;

      // Anamorphic streak — horizontal line through center
      const streakWidth = 4 * scaleNorm;
      const streakFalloff = Math.abs(y - cy) < streakWidth
        ? (1.0 - Math.abs(y - cy) / streakWidth) * Math.max(0, 1.0 - Math.abs(x - cx) / (width * 0.4))
        : 0;
      const streak = streakFalloff * (anamorphic / 100) * bright * 0.5;

      // Ghost element — opposite side of center
      const ghostX = width - cx + (cx - x) * 0.3;
      const ghostY = height - cy + (cy - y) * 0.3;
      const ghostDist = Math.sqrt((x - ghostX) * (x - ghostX) + (y - ghostY) * (y - ghostY));
      const ghostRadius = 40 * scaleNorm;
      const ghost = ghostDist < ghostRadius ? (1.0 - ghostDist / ghostRadius) * 0.15 * bright : 0;

      // Composite — warm tint for flare
      const totalR = (glowIntensity + ring + streak + ghost) * 255;
      const totalG = (glowIntensity * 0.8 + ring * 0.9 + streak * 0.7 + ghost * 0.6) * 255;
      const totalB = (glowIntensity * 0.4 + ring * 0.5 + streak * 0.3 + ghost * 0.8) * 255;

      data[idx] = clamp(data[idx]! + totalR);
      data[idx + 1] = clamp(data[idx + 1]! + totalG);
      data[idx + 2] = clamp(data[idx + 2]! + totalB);
    }
  }
}

// ─── Bokeh Blur ──────────────────────────────────────────────────────────────

/**
 * Apply a shaped bokeh blur effect with highlight boost.
 *
 * @param imageData      Source image (modified in place)
 * @param radius         0-100px — blur kernel radius
 * @param shape          'hexagon' | 'octagon' | 'circle' — bokeh shape
 * @param rotation       0-360deg — rotation of the bokeh shape
 * @param highlightBoost 0-100% — boost bright areas for characteristic bokeh highlights
 */
export function applyBokehBlur(
  imageData: ImageData,
  radius: number,
  shape: string,
  rotation: number,
  highlightBoost: number,
): void {
  if (radius <= 0) return;

  const { width, height, data } = imageData;
  const r = Math.min(Math.round(radius), 30); // cap for performance
  const rotRad = (rotation * Math.PI) / 180;
  const boostNorm = highlightBoost / 100;
  const src = new Uint8ClampedArray(data);

  // Build kernel mask based on shape
  const kernelSize = r * 2 + 1;
  const kernel: boolean[][] = [];
  for (let ky = 0; ky < kernelSize; ky++) {
    kernel[ky] = [];
    for (let kx = 0; kx < kernelSize; kx++) {
      const dx = kx - r;
      const dy = ky - r;

      // Rotate
      const rdx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
      const rdy = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);

      const dist = Math.sqrt(rdx * rdx + rdy * rdy);

      if (shape === 'circle') {
        kernel[ky]![kx] = dist <= r;
      } else if (shape === 'hexagon') {
        // Hexagonal: 6-sided check
        const angle = Math.atan2(rdy, rdx);
        const hexR = r * Math.cos(Math.PI / 6) / Math.cos((angle % (Math.PI / 3)) - Math.PI / 6);
        kernel[ky]![kx] = dist <= Math.abs(hexR);
      } else {
        // Octagon: 8-sided check
        const absDx = Math.abs(rdx);
        const absDy = Math.abs(rdy);
        const octDist = absDx + absDy;
        kernel[ky]![kx] = dist <= r && octDist <= r * 1.4;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, count = 0;

      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          if (!kernel[ky]![kx]) continue;

          const sx = Math.min(Math.max(x + kx - r, 0), width - 1);
          const sy = Math.min(Math.max(y + ky - r, 0), height - 1);
          const sIdx = (sy * width + sx) * 4;

          // Highlight boost: weight bright pixels more
          const lum = (src[sIdx]! * 0.299 + src[sIdx + 1]! * 0.587 + src[sIdx + 2]! * 0.114) / 255;
          const weight = 1.0 + lum * lum * boostNorm * 3;

          sr += src[sIdx]! * weight;
          sg += src[sIdx + 1]! * weight;
          sb += src[sIdx + 2]! * weight;
          sa += src[sIdx + 3]!;
          count += weight;
        }
      }

      const dIdx = (y * width + x) * 4;
      if (count > 0) {
        data[dIdx] = clamp(sr / count);
        data[dIdx + 1] = clamp(sg / count);
        data[dIdx + 2] = clamp(sb / count);
        data[dIdx + 3] = clamp(sa / (count / (1.0 + boostNorm)));
      }
    }
  }
}

// ─── Light Rays (God Rays) ───────────────────────────────────────────────────

/**
 * Generate volumetric light rays (god rays) from a point source.
 *
 * @param imageData  Source image (modified in place)
 * @param posX       0-100% — horizontal position of the light source
 * @param posY       0-100% — vertical position of the light source
 * @param length     0-100% — length of the rays
 * @param brightness 0-200% — brightness of the rays
 * @param threshold  0-100% — luminance threshold for ray generation
 */
export function applyLightRays(
  imageData: ImageData,
  posX: number,
  posY: number,
  length: number,
  brightness: number,
  threshold: number,
): void {
  if (brightness <= 0 || length <= 0) return;

  const { width, height, data } = imageData;
  const cx = (posX / 100) * width;
  const cy = (posY / 100) * height;
  const rayLen = length / 100;
  const bright = brightness / 100;
  const threshVal = (threshold / 100) * 255;
  const numSamples = Math.max(8, Math.round(rayLen * 40));

  // Create bright-pass copy
  const brightPass = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
    if (lum > threshVal) {
      brightPass[i] = data[i]!;
      brightPass[i + 1] = data[i + 1]!;
      brightPass[i + 2] = data[i + 2]!;
      brightPass[i + 3] = 255;
    }
  }

  // Radial blur from light source position (accumulate samples along ray direction)
  const rays = new Float32Array(data.length);
  const stepScale = rayLen / numSamples;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let sr = 0, sg = 0, sb = 0;

      for (let s = 0; s < numSamples; s++) {
        const t = s * stepScale;
        const sx = Math.round(x + (cx - x) * t);
        const sy = Math.round(y + (cy - y) * t);

        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const sIdx = (sy * width + sx) * 4;
          const weight = 1.0 - (s / numSamples) * 0.5; // fade with distance
          sr += brightPass[sIdx]! * weight;
          sg += brightPass[sIdx + 1]! * weight;
          sb += brightPass[sIdx + 2]! * weight;
        }
      }

      rays[idx] = sr / numSamples;
      rays[idx + 1] = sg / numSamples;
      rays[idx + 2] = sb / numSamples;
    }
  }

  // Additive composite
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i]! + rays[i]! * bright);
    data[i + 1] = clamp(data[i + 1]! + rays[i + 1]! * bright);
    data[i + 2] = clamp(data[i + 2]! + rays[i + 2]! * bright);
  }
}

// ─── Prism (Chromatic Aberration) ────────────────────────────────────────────

/**
 * Apply a chromatic aberration / prism effect by shifting color channels.
 *
 * @param imageData Source image (modified in place)
 * @param amount    0-100 — strength of the prism shift
 * @param angle     0-360deg — direction of the shift
 * @param blurType  'linear' | 'radial' — type of aberration
 */
export function applyPrism(
  imageData: ImageData,
  amount: number,
  angle: number,
  blurType: string,
): void {
  if (amount <= 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const shift = (amount / 100) * 15; // max 15px shift
  const angleRad = (angle * Math.PI) / 180;

  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      let rShiftX: number, rShiftY: number;
      let bShiftX: number, bShiftY: number;

      if (blurType === 'radial') {
        // Radial: shift away from/towards center
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = Math.sqrt(cx * cx + cy * cy);
        const normalizedDist = dist / maxDist;
        const radialShift = shift * normalizedDist;

        if (dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          rShiftX = nx * radialShift;
          rShiftY = ny * radialShift;
          bShiftX = -nx * radialShift;
          bShiftY = -ny * radialShift;
        } else {
          rShiftX = rShiftY = bShiftX = bShiftY = 0;
        }
      } else {
        // Linear: shift along angle
        rShiftX = Math.cos(angleRad) * shift;
        rShiftY = Math.sin(angleRad) * shift;
        bShiftX = -Math.cos(angleRad) * shift;
        bShiftY = -Math.sin(angleRad) * shift;
      }

      // Sample red channel from shifted position
      const rX = Math.min(Math.max(Math.round(x + rShiftX), 0), width - 1);
      const rY = Math.min(Math.max(Math.round(y + rShiftY), 0), height - 1);
      const rIdx = (rY * width + rX) * 4;

      // Green channel stays centered
      // Blue channel from opposite shifted position
      const bX = Math.min(Math.max(Math.round(x + bShiftX), 0), width - 1);
      const bY = Math.min(Math.max(Math.round(y + bShiftY), 0), height - 1);
      const bIdx = (bY * width + bX) * 4;

      data[idx] = src[rIdx]!;         // Red from shifted
      data[idx + 1] = src[idx + 1]!;  // Green stays
      data[idx + 2] = src[bIdx + 2]!; // Blue from opposite shift
      // Alpha stays as-is
    }
  }
}
