// =============================================================================
//  Boris FX Keyer Effects
//  Difference Key, Color Range Key, Linear Color Key, IBK Keyer
// =============================================================================

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(match[1]!, 16),
    g: parseInt(match[2]!, 16),
    b: parseInt(match[3]!, 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) / 6;
  } else {
    h = ((rn - gn) / d + 4) / 6;
  }

  return [h * 360, s * 100, l * 100];
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Difference Key ──────────────────────────────────────────────────────────

/**
 * Compare pixels to a reference frame and key differences.
 * Pixels that are similar to the reference become transparent.
 *
 * @param data          Pixel data (RGBA) — modified in place
 * @param referenceData Reference frame pixel data (RGBA, same dimensions)
 * @param threshold     0-100 — how different a pixel must be to remain opaque
 * @param softness      0-100 — edge softness for the key transition
 */
export function applyDifferenceKey(
  data: Uint8ClampedArray,
  referenceData: Uint8ClampedArray,
  threshold: number,
  softness: number,
): void {
  const threshNorm = (threshold / 100) * 441.67; // max RGB distance = sqrt(255^2 * 3)
  const softNorm = Math.max((softness / 100) * 100, 1);

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const dr = data[i]! - referenceData[i]!;
    const dg = data[i + 1]! - referenceData[i + 1]!;
    const db = data[i + 2]! - referenceData[i + 2]!;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist < threshNorm) {
      // Below threshold — make transparent
      data[i + 3] = 0;
    } else if (dist < threshNorm + softNorm) {
      // Soft transition
      const alpha = (dist - threshNorm) / softNorm;
      data[i + 3] = clamp(data[i + 3]! * alpha);
    }
    // else: fully opaque, keep as-is
  }
}

// ─── Color Range Key ─────────────────────────────────────────────────────────

/**
 * Key pixels within an HSL color range. Pixels within the range become transparent.
 *
 * @param data     Pixel data (RGBA) — modified in place
 * @param minHue   Minimum hue (0-360 degrees)
 * @param maxHue   Maximum hue (0-360 degrees)
 * @param minSat   Minimum saturation (0-100)
 * @param maxSat   Maximum saturation (0-100)
 * @param minLum   Minimum luminance (0-100)
 * @param maxLum   Maximum luminance (0-100)
 * @param softness 0-100 — edge softness
 */
export function applyColorRangeKey(
  data: Uint8ClampedArray,
  minHue: number,
  maxHue: number,
  minSat: number,
  maxSat: number,
  minLum: number,
  maxLum: number,
  softness: number,
): void {
  const softRange = (softness / 100) * 20; // softness range in HSL units

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);

    // Check if pixel is within the specified range
    let hueInRange: boolean;
    let hueDist: number;

    if (minHue <= maxHue) {
      hueInRange = h >= minHue && h <= maxHue;
      hueDist = hueInRange ? 0 : Math.min(Math.abs(h - minHue), Math.abs(h - maxHue));
    } else {
      // Wrapping range (e.g., 350 to 10)
      hueInRange = h >= minHue || h <= maxHue;
      if (hueInRange) {
        hueDist = 0;
      } else {
        hueDist = Math.min(Math.abs(h - minHue), Math.abs(h - maxHue), Math.abs(h - (minHue - 360)), Math.abs(h - (maxHue + 360)));
      }
    }

    const satInRange = s >= minSat && s <= maxSat;
    const satDist = satInRange ? 0 : Math.min(Math.abs(s - minSat), Math.abs(s - maxSat));

    const lumInRange = l >= minLum && l <= maxLum;
    const lumDist = lumInRange ? 0 : Math.min(Math.abs(l - minLum), Math.abs(l - maxLum));

    const totalDist = Math.sqrt(hueDist * hueDist + satDist * satDist + lumDist * lumDist);

    if (hueInRange && satInRange && lumInRange) {
      // Fully inside range — key out
      data[i + 3] = 0;
    } else if (softRange > 0 && totalDist < softRange) {
      // Soft edge
      const alpha = totalDist / softRange;
      data[i + 3] = clamp(data[i + 3]! * alpha);
    }
    // else: outside range — keep opaque
  }
}

// ─── Linear Color Key ────────────────────────────────────────────────────────

/**
 * Linear color distance keying. Keys pixels based on RGB distance from a target color,
 * with balance controls for shadows and highlights.
 *
 * @param data         Pixel data (RGBA) — modified in place
 * @param keyColor     Target key color as hex string (#RRGGBB)
 * @param matchRange   0-100 — color distance tolerance
 * @param balanceLow   0-100 — key balance for dark pixels
 * @param balanceHigh  0-100 — key balance for bright pixels
 */
export function applyLinearColorKey(
  data: Uint8ClampedArray,
  keyColor: string,
  matchRange: number,
  balanceLow: number,
  balanceHigh: number,
): void {
  const key = hexToRgb(keyColor);
  const rangeNorm = (matchRange / 100) * 441.67; // max RGB distance
  const lowBal = balanceLow / 100;
  const highBal = balanceHigh / 100;

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // RGB distance
    const dr = r! - key.r;
    const dg = g! - key.g;
    const db = b! - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    // Luminance of the pixel (0-1)
    const lum = (r! * 0.299 + g! * 0.587 + b! * 0.114) / 255;

    // Adjust effective range based on luminance and balance
    const balanceFactor = lum < 0.5
      ? 1.0 - (1.0 - lowBal) * (1.0 - lum * 2)
      : 1.0 - (1.0 - highBal) * ((lum - 0.5) * 2);

    const effectiveRange = rangeNorm * balanceFactor;

    if (dist < effectiveRange * 0.7) {
      data[i + 3] = 0;
    } else if (dist < effectiveRange) {
      const alpha = (dist - effectiveRange * 0.7) / (effectiveRange * 0.3);
      data[i + 3] = clamp(data[i + 3]! * alpha);
    }
  }
}

// ─── IBK Keyer ───────────────────────────────────────────────────────────────

/**
 * IBK-style per-channel key extraction. Extracts a key based on the dominant
 * screen color channel and applies despill and edge weighting.
 *
 * @param data        Pixel data (RGBA) — modified in place
 * @param screenType  'green' or 'blue' — screen color type
 * @param despill     0-100 — amount of screen color spill removal
 * @param edgeWeight  0-100 — edge detail preservation
 */
export function applyIBKKeyer(
  data: Uint8ClampedArray,
  screenType: string,
  despill: number,
  edgeWeight: number,
): void {
  const despillNorm = despill / 100;
  const edgeNorm = edgeWeight / 100;
  const isGreen = screenType === 'green';

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let keyVal: number;
    if (isGreen) {
      // Green screen: key = green - max(red, blue)
      const maxRB = Math.max(r!, b!);
      keyVal = Math.max(0, g! - maxRB) / 255;
    } else {
      // Blue screen: key = blue - max(red, green)
      const maxRG = Math.max(r!, g!);
      keyVal = Math.max(0, b! - maxRG) / 255;
    }

    // Apply edge weighting — preserve edges by reducing key at contrast boundaries
    // Simple approach: reduce key strength based on local luminance gradient
    const lum = (r! * 0.299 + g! * 0.587 + b! * 0.114) / 255;
    const edgeFactor = 1.0 - edgeNorm * (1.0 - lum) * 0.5;
    keyVal = Math.min(1, keyVal * edgeFactor);

    // Set alpha from key
    const alpha = 1.0 - keyVal;
    data[i + 3] = clamp(alpha * 255);

    // Despill — remove screen color contamination
    if (despillNorm > 0 && alpha > 0) {
      if (isGreen) {
        const maxRB = Math.max(r!, b!);
        const spillAmount = Math.max(0, g! - maxRB);
        data[i + 1] = clamp(g! - spillAmount * despillNorm);
      } else {
        const maxRG = Math.max(r!, g!);
        const spillAmount = Math.max(0, b! - maxRG);
        data[i + 2] = clamp(b! - spillAmount * despillNorm);
      }
    }
  }
}
