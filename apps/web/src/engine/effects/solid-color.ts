// ═══════════════════════════════════════════════════════════════════════════
//  Solid Color Generator Effect
//  Fills image with a solid color at specified opacity.
// ═══════════════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Fill image with a solid color.
 *
 * @param imageData Source image (modified in place)
 * @param color     Hex color string
 * @param opacity   0-100 fill opacity
 */
export function applySolidColor(
  imageData: ImageData,
  color: string,
  opacity: number,
): void {
  const [r, g, b] = hexToRgb(color);
  const { data } = imageData;
  const blend = opacity / 100;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * (1 - blend) + r * blend);
    data[i + 1] = Math.round(data[i + 1] * (1 - blend) + g * blend);
    data[i + 2] = Math.round(data[i + 2] * (1 - blend) + b * blend);
  }
}
