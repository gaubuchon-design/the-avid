// ═══════════════════════════════════════════════════════════════════════════
//  Gradient Generator Effect
//  Generates linear or radial gradient overlay.
// ═══════════════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/**
 * Apply gradient overlay to image.
 *
 * @param imageData  Source image (modified in place)
 * @param startColor Start color hex
 * @param endColor   End color hex
 * @param type       'linear' | 'radial'
 * @param angle      Gradient angle in degrees (for linear)
 * @param blend      0-100 blend amount with source
 */
export function applyGradient(
  imageData: ImageData,
  startColor: string,
  endColor: string,
  type: string,
  angle: number,
  blend: number,
): void {
  if (blend <= 0) return;

  const { width, height, data } = imageData;
  const [sr, sg, sb] = hexToRgb(startColor);
  const [er, eg, eb] = hexToRgb(endColor);
  const blendFactor = blend / 100;

  if (type === 'radial') {
    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const t = Math.min(1, dist / maxDist);
        const gr = sr + (er - sr) * t;
        const gg = sg + (eg - sg) * t;
        const gb = sb + (eb - sb) * t;

        const i = (y * width + x) * 4;
        data[i] = Math.round(data[i]! * (1 - blendFactor) + gr * blendFactor);
        data[i + 1] = Math.round(data[i + 1]! * (1 - blendFactor) + gg * blendFactor);
        data[i + 2] = Math.round(data[i + 2]! * (1 - blendFactor) + gb * blendFactor);
      }
    }
  } else {
    // Linear gradient along angle
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);

    // Project all corners to find min/max along gradient direction
    const projections = [
      0 * dx + 0 * dy,
      width * dx + 0 * dy,
      0 * dx + height * dy,
      width * dx + height * dy,
    ];
    const minProj = Math.min(...projections);
    const maxProj = Math.max(...projections);
    const range = maxProj - minProj || 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const proj = x * dx + y * dy;
        const t = (proj - minProj) / range;
        const gr = sr + (er - sr) * t;
        const gg = sg + (eg - sg) * t;
        const gb = sb + (eb - sb) * t;

        const i = (y * width + x) * 4;
        data[i] = Math.round(data[i]! * (1 - blendFactor) + gr * blendFactor);
        data[i + 1] = Math.round(data[i + 1]! * (1 - blendFactor) + gg * blendFactor);
        data[i + 2] = Math.round(data[i + 2]! * (1 - blendFactor) + gb * blendFactor);
      }
    }
  }
}
