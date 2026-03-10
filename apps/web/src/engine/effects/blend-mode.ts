// ═══════════════════════════════════════════════════════════════════════════
//  Blend Mode Effect
//  Composites two layers using standard Photoshop-style blend modes.
// ═══════════════════════════════════════════════════════════════════════════

type BlendFn = (base: number, blend: number) => number;

const blendFunctions: Record<string, BlendFn> = {
  normal: (_b, o) => o,
  multiply: (b, o) => (b * o) / 255,
  screen: (b, o) => 255 - ((255 - b) * (255 - o)) / 255,
  overlay: (b, o) => b < 128 ? (2 * b * o) / 255 : 255 - (2 * (255 - b) * (255 - o)) / 255,
  softLight: (b, o) => {
    const t = (o / 255);
    return t <= 0.5
      ? b - (1 - 2 * t) * b * (1 - b / 255)
      : b + (2 * t - 1) * (Math.sqrt(b / 255) * 255 - b);
  },
  hardLight: (b, o) => o < 128 ? (2 * b * o) / 255 : 255 - (2 * (255 - b) * (255 - o)) / 255,
  difference: (b, o) => Math.abs(b - o),
  exclusion: (b, o) => b + o - (2 * b * o) / 255,
  add: (b, o) => Math.min(255, b + o),
  subtract: (b, o) => Math.max(0, b - o),
  darken: (b, o) => Math.min(b, o),
  lighten: (b, o) => Math.max(b, o),
  colorDodge: (b, o) => o === 255 ? 255 : Math.min(255, (b * 255) / (255 - o)),
  colorBurn: (b, o) => o === 0 ? 0 : Math.max(0, 255 - ((255 - b) * 255) / o),
};

/**
 * Blend two ImageData layers together using a blend mode.
 *
 * @param base    Bottom layer (modified in place)
 * @param overlay Top layer
 * @param mode    Blend mode name
 * @param opacity 0-100 overlay opacity
 */
export function applyBlendMode(
  base: ImageData,
  overlay: ImageData,
  mode: string,
  opacity: number,
): void {
  const fn = blendFunctions[mode] || blendFunctions['normal'];
  const opNorm = opacity / 100;
  const bd = base.data;
  const od = overlay.data;
  const len = Math.min(bd.length, od.length);

  for (let i = 0; i < len; i += 4) {
    const oa = (od[i + 3]! / 255) * opNorm;
    if (oa <= 0) continue;

    for (let c = 0; c < 3; c++) {
      const blended = fn!(bd[i + c]!, od[i + c]!);
      bd[i + c] = Math.round(bd[i + c]! * (1 - oa) + blended * oa);
    }
    bd[i + 3] = Math.min(255, Math.round(bd[i + 3]! + od[i + 3]! * opNorm * (1 - bd[i + 3]! / 255)));
  }
}
