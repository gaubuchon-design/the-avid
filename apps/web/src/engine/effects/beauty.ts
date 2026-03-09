// =============================================================================
//  Boris FX Beauty Studio
//  Skin smoothing via bilateral filter approximation with frequency separation.
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// ─── Beauty Studio ───────────────────────────────────────────────────────────

/**
 * Apply beauty / skin smoothing effect.
 * Uses a bilateral filter approximation that smooths skin texture while
 * preserving edges. Includes blemish removal, skin masking, and tone unification.
 *
 * @param imageData      Source image (modified in place)
 * @param smoothing      0-100% — skin smoothing intensity
 * @param blemishRemoval 0-100% — blemish/spot removal strength
 * @param skinMask       0-100% — restrict effect to skin-tone regions
 * @param toneUnify      0-100% — unify skin tone across the image
 */
export function applyBeautyStudio(
  imageData: ImageData,
  smoothing: number,
  blemishRemoval: number,
  skinMask: number,
  toneUnify: number,
): void {
  if (smoothing <= 0 && blemishRemoval <= 0 && toneUnify <= 0) return;

  const { width, height, data } = imageData;
  const smoothNorm = smoothing / 100;
  const blemishNorm = blemishRemoval / 100;
  const maskNorm = skinMask / 100;
  const toneNorm = toneUnify / 100;

  // Step 1: Build skin mask based on color range
  const skinWeights = new Float32Array(width * height);
  let avgSkinR = 0, avgSkinG = 0, avgSkinB = 0, skinCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Skin detection in RGB space (simplified)
    // Skin tends to have R > G > B with specific ratios
    const isSkinLike =
      r > 60 && g > 40 && b > 20 &&
      r > g && r > b &&
      (r - g) > 10 &&
      Math.abs(r - g) < 100 &&
      (r - b) > 20;

    const pixIdx = i / 4;
    if (isSkinLike) {
      // Calculate skin confidence
      const skinConfidence = Math.min(1, ((r - g) / 80) * ((r - b) / 120));
      skinWeights[pixIdx] = maskNorm > 0 ? skinConfidence * maskNorm + (1 - maskNorm) : 1.0;
      avgSkinR += r;
      avgSkinG += g;
      avgSkinB += b;
      skinCount++;
    } else {
      skinWeights[pixIdx] = maskNorm > 0 ? (1 - maskNorm) : 1.0;
    }
  }

  // Average skin tone for tone unification
  if (skinCount > 0) {
    avgSkinR /= skinCount;
    avgSkinG /= skinCount;
    avgSkinB /= skinCount;
  }

  // Step 2: Bilateral filter (edge-preserving smooth)
  if (smoothNorm > 0) {
    const radius = Math.max(1, Math.round(smoothNorm * 6));
    const sigmaSpace = radius * 0.5;
    const sigmaColor = 20 + smoothNorm * 40; // color similarity threshold
    const src = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const pixIdx = y * width + x;
        const weight = skinWeights[pixIdx];

        if (weight < 0.01) continue;

        let sumR = 0, sumG = 0, sumB = 0, sumW = 0;
        const cr = src[idx];
        const cg = src[idx + 1];
        const cb = src[idx + 2];

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;

            const nIdx = (ny * width + nx) * 4;

            // Spatial weight (Gaussian)
            const spatialDist = Math.sqrt(dx * dx + dy * dy);
            const spatialW = Math.exp(-(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace));

            // Color similarity weight (Gaussian)
            const colorDist = Math.sqrt(
              (src[nIdx] - cr) * (src[nIdx] - cr) +
              (src[nIdx + 1] - cg) * (src[nIdx + 1] - cg) +
              (src[nIdx + 2] - cb) * (src[nIdx + 2] - cb),
            );
            const colorW = Math.exp(-(colorDist * colorDist) / (2 * sigmaColor * sigmaColor));

            const w = spatialW * colorW;
            sumR += src[nIdx] * w;
            sumG += src[nIdx + 1] * w;
            sumB += src[nIdx + 2] * w;
            sumW += w;
          }
        }

        if (sumW > 0) {
          const blend = weight * smoothNorm;
          data[idx] = clamp(cr * (1 - blend) + (sumR / sumW) * blend);
          data[idx + 1] = clamp(cg * (1 - blend) + (sumG / sumW) * blend);
          data[idx + 2] = clamp(cb * (1 - blend) + (sumB / sumW) * blend);
        }
      }
    }
  }

  // Step 3: Blemish removal — suppress local outliers
  if (blemishNorm > 0) {
    const src = new Uint8ClampedArray(data);
    const bRadius = Math.max(2, Math.round(blemishNorm * 5));

    for (let y = bRadius; y < height - bRadius; y++) {
      for (let x = bRadius; x < width - bRadius; x++) {
        const idx = (y * width + x) * 4;
        const pixIdx = y * width + x;
        const weight = skinWeights[pixIdx];

        if (weight < 0.01) continue;

        const cr = src[idx];
        const cg = src[idx + 1];
        const cb = src[idx + 2];

        // Calculate local average
        let avgR = 0, avgG = 0, avgB = 0, count = 0;
        for (let dy = -bRadius; dy <= bRadius; dy++) {
          for (let dx = -bRadius; dx <= bRadius; dx++) {
            if (dx * dx + dy * dy > bRadius * bRadius) continue;
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            avgR += src[nIdx];
            avgG += src[nIdx + 1];
            avgB += src[nIdx + 2];
            count++;
          }
        }
        avgR /= count;
        avgG /= count;
        avgB /= count;

        // If pixel deviates significantly from local average, blend towards average
        const deviation = Math.sqrt(
          (cr - avgR) * (cr - avgR) +
          (cg - avgG) * (cg - avgG) +
          (cb - avgB) * (cb - avgB),
        );

        const deviationThreshold = 30 - blemishNorm * 20;
        if (deviation > deviationThreshold) {
          const blend = weight * blemishNorm * Math.min(1, (deviation - deviationThreshold) / 40);
          data[idx] = clamp(data[idx] * (1 - blend) + avgR * blend);
          data[idx + 1] = clamp(data[idx + 1] * (1 - blend) + avgG * blend);
          data[idx + 2] = clamp(data[idx + 2] * (1 - blend) + avgB * blend);
        }
      }
    }
  }

  // Step 4: Tone unification — nudge skin pixels towards average skin tone
  if (toneNorm > 0 && skinCount > 0) {
    for (let i = 0; i < data.length; i += 4) {
      const pixIdx = i / 4;
      const weight = skinWeights[pixIdx];
      if (weight < 0.3) continue; // only affect skin-like pixels

      const blend = weight * toneNorm * 0.3; // subtle effect
      data[i] = clamp(data[i] * (1 - blend) + avgSkinR * blend);
      data[i + 1] = clamp(data[i + 1] * (1 - blend) + avgSkinG * blend);
      data[i + 2] = clamp(data[i + 2] * (1 - blend) + avgSkinB * blend);
    }
  }
}
