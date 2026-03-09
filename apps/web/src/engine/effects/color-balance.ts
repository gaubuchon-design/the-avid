// ═══════════════════════════════════════════════════════════════════════════
//  Color Balance Effect
//  Shadows / Midtones / Highlights RGB shift based on luminance.
// ═══════════════════════════════════════════════════════════════════════════

export interface ColorBalanceParams {
  shadowsR: number;   // -100 to 100
  shadowsG: number;
  shadowsB: number;
  midtonesR: number;
  midtonesG: number;
  midtonesB: number;
  highlightsR: number;
  highlightsG: number;
  highlightsB: number;
  preserveLuminosity: boolean;
}

/**
 * Apply color balance shifts to shadows, midtones, and highlights.
 * Luminance determines the weight of each tonal region.
 */
export function applyColorBalance(
  data: Uint8ClampedArray,
  params: ColorBalanceParams,
): void {
  const {
    shadowsR, shadowsG, shadowsB,
    midtonesR, midtonesG, midtonesB,
    highlightsR, highlightsG, highlightsB,
    preserveLuminosity,
  } = params;

  // Skip if all zeros
  if (
    shadowsR === 0 && shadowsG === 0 && shadowsB === 0 &&
    midtonesR === 0 && midtonesG === 0 && midtonesB === 0 &&
    highlightsR === 0 && highlightsG === 0 && highlightsB === 0
  ) return;

  const len = data.length;
  const scale = 2.55; // map -100..100 → -255..255

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Luminance (Rec. 709)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lumNorm = lum / 255; // 0..1

    // Shadow weight: strongest at dark values, fades to 0 at mid
    const shadowW = Math.max(0, 1 - lumNorm * 4); // strong at lum < 0.25
    // Highlight weight: strongest at bright values
    const highW = Math.max(0, lumNorm * 4 - 3); // strong at lum > 0.75
    // Midtone weight: bell curve centered at 0.5
    const midW = 1 - shadowW - highW;

    let nr = r + (shadowsR * scale * shadowW + midtonesR * scale * midW + highlightsR * scale * highW) / 100;
    let ng = g + (shadowsG * scale * shadowW + midtonesG * scale * midW + highlightsG * scale * highW) / 100;
    let nb = b + (shadowsB * scale * shadowW + midtonesB * scale * midW + highlightsB * scale * highW) / 100;

    if (preserveLuminosity) {
      const newLum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
      if (newLum > 0) {
        const ratio = lum / newLum;
        nr *= ratio;
        ng *= ratio;
        nb *= ratio;
      }
    }

    data[i]     = clamp(nr);
    data[i + 1] = clamp(ng);
    data[i + 2] = clamp(nb);
  }
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
