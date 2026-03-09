// ═══════════════════════════════════════════════════════════════════════════
//  Color Lookup (LUT) Effect
//  Applies built-in 3D color look-up tables for cinematic looks.
// ═══════════════════════════════════════════════════════════════════════════

/** Simple color remap: for each input (r,g,b) → output (r,g,b). */
type LutTransform = (r: number, g: number, b: number) => [number, number, number];

const LUT_TRANSFORMS: Record<string, LutTransform> = {
  'teal-orange': (r, g, b) => {
    // Push shadows toward teal, highlights toward orange
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const t = luma / 255;
    return [
      Math.round(r + (1 - t) * -10 + t * 30),
      Math.round(g + (1 - t) * 15 + t * -5),
      Math.round(b + (1 - t) * 25 + t * -20),
    ];
  },
  'warm-sunset': (r, g, b) => {
    return [
      Math.min(255, Math.round(r * 1.1 + 15)),
      Math.round(g * 0.95 + 5),
      Math.max(0, Math.round(b * 0.85 - 10)),
    ];
  },
  'cool-night': (r, g, b) => {
    return [
      Math.max(0, Math.round(r * 0.85 - 10)),
      Math.round(g * 0.9 + 5),
      Math.min(255, Math.round(b * 1.15 + 20)),
    ];
  },
  'bleach-bypass': (r, g, b) => {
    // High contrast, desaturated look
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const desatR = r * 0.5 + luma * 0.5;
    const desatG = g * 0.5 + luma * 0.5;
    const desatB = b * 0.5 + luma * 0.5;
    // Apply S-curve for contrast
    const sc = (v: number) => {
      const n = v / 255;
      return Math.round(255 * (n < 0.5 ? 2 * n * n : 1 - 2 * (1 - n) * (1 - n)));
    };
    return [sc(desatR), sc(desatG), sc(desatB)];
  },
  'cross-process': (r, g, b) => {
    // Green/yellow shadows, magenta highlights
    return [
      Math.min(255, Math.round(r * 1.05 + 10)),
      Math.min(255, Math.round(g * 1.1 + 15)),
      Math.max(0, Math.round(b * 0.8 - 15)),
    ];
  },
};

/**
 * Apply a named color lookup table.
 *
 * @param data      Pixel data (RGBA)
 * @param lutName   LUT preset name
 * @param intensity 0-100 blend strength
 */
export function applyColorLookup(
  data: Uint8ClampedArray,
  lutName: string,
  intensity: number,
): void {
  if (lutName === 'none' || intensity <= 0) return;

  const transform = LUT_TRANSFORMS[lutName];
  if (!transform) return;

  const blend = intensity / 100;

  for (let i = 0; i < data.length; i += 4) {
    const [lr, lg, lb] = transform(data[i], data[i + 1], data[i + 2]);
    data[i] = Math.max(0, Math.min(255, Math.round(data[i] * (1 - blend) + lr * blend)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(data[i + 1] * (1 - blend) + lg * blend)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(data[i + 2] * (1 - blend) + lb * blend)));
  }
}
