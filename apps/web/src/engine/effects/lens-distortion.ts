// ═══════════════════════════════════════════════════════════════════════════
//  Lens Distortion Effect
//  Barrel/pincushion distortion with decentering.
// ═══════════════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * Apply barrel/pincushion lens distortion.
 *
 * @param imageData    Source image (modified in place)
 * @param curvature    -100 to 100 (negative = pincushion, positive = barrel)
 * @param vDecentering -100 to 100 vertical decentering
 * @param hDecentering -100 to 100 horizontal decentering
 * @param fillColor    Hex color for areas outside the original image
 */
export function applyLensDistortion(
  imageData: ImageData,
  curvature: number,
  vDecentering: number,
  hDecentering: number,
  fillColor: string,
): void {
  if (curvature === 0 && vDecentering === 0 && hDecentering === 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const [fr, fg, fb] = hexToRgb(fillColor);
  const k = curvature / 200; // normalize to reasonable range
  const dcX = hDecentering / 100;
  const dcY = vDecentering / 100;
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Normalized coordinates (-1 to 1)
      const nx = (x - cx) / maxR + dcX;
      const ny = (y - cy) / maxR + dcY;
      const r2 = nx * nx + ny * ny;

      // Barrel/pincushion: r' = r * (1 + k * r^2)
      const distortion = 1 + k * r2;
      const srcNx = nx * distortion - dcX;
      const srcNy = ny * distortion - dcY;

      const srcX = srcNx * maxR + cx;
      const srcY = srcNy * maxR + cy;

      const di = (y * width + x) * 4;

      if (srcX < 0 || srcX >= width - 1 || srcY < 0 || srcY >= height - 1) {
        data[di] = fr;
        data[di + 1] = fg;
        data[di + 2] = fb;
        data[di + 3] = 255;
        continue;
      }

      // Bilinear interpolation
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const fx = srcX - x0;
      const fy = srcY - y0;

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;

      for (let c = 0; c < 4; c++) {
        const v = src[i00 + c] * (1 - fx) * (1 - fy)
                + src[i10 + c] * fx * (1 - fy)
                + src[i01 + c] * (1 - fx) * fy
                + src[i11 + c] * fx * fy;
        data[di + c] = Math.round(v);
      }
    }
  }
}
