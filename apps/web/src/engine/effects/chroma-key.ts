// ═══════════════════════════════════════════════════════════════════════════
//  Chroma Key (Green/Blue Screen) Effect
//  HSL distance-based keying with spill suppression.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply chroma key to make pixels matching the key color transparent.
 *
 * @param data             Pixel data (RGBA)
 * @param keyColor         Key color as hex string (#RRGGBB)
 * @param tolerance        0-100 — how close a pixel must be to be keyed
 * @param softness         0-100 — edge softness for anti-aliased edges
 * @param spillSuppression 0-100 — reduce spill from key color on remaining pixels
 */
export function applyChromaKey(
  data: Uint8ClampedArray,
  keyColor: string,
  tolerance: number,
  softness: number,
  spillSuppression: number,
): void {
  const key = hexToRgb(keyColor);
  if (!key) return;

  const [kH, kS, kL] = rgbToHsl(key.r / 255, key.g / 255, key.b / 255);
  const tolNorm = tolerance / 100;
  const softNorm = softness / 100;
  const spillNorm = spillSuppression / 100;

  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const [pH, pS, pL] = rgbToHsl(r, g, b);

    // Calculate distance in HSL space (weighted)
    let hDist = Math.abs(pH - kH);
    if (hDist > 0.5) hDist = 1 - hDist;
    const sDist = Math.abs(pS - kS);
    const lDist = Math.abs(pL - kL);

    // Weighted distance
    const dist = Math.sqrt(hDist * hDist * 4 + sDist * sDist + lDist * lDist * 0.5);

    // Inner/outer thresholds for soft edge
    const innerThreshold = tolNorm * 0.5;
    const outerThreshold = tolNorm * 0.5 + softNorm * 0.3 + 0.05;

    if (dist < innerThreshold) {
      // Fully transparent
      data[i + 3] = 0;
    } else if (dist < outerThreshold) {
      // Soft edge — partial transparency
      const alpha = (dist - innerThreshold) / (outerThreshold - innerThreshold);
      data[i + 3] = Math.round(data[i + 3] * alpha);
    }

    // Spill suppression — reduce key color component on non-keyed pixels
    if (spillNorm > 0 && data[i + 3] > 0) {
      // Determine which channel to suppress based on key color
      if (key.g > key.r && key.g > key.b) {
        // Green screen — suppress green
        const maxRB = Math.max(data[i], data[i + 2]);
        data[i + 1] = Math.round(data[i + 1] - (data[i + 1] - maxRB) * spillNorm);
      } else if (key.b > key.r && key.b > key.g) {
        // Blue screen — suppress blue
        const maxRG = Math.max(data[i], data[i + 1]);
        data[i + 2] = Math.round(data[i + 2] - (data[i + 2] - maxRG) * spillNorm);
      }
    }
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return [h, s, l];
}
