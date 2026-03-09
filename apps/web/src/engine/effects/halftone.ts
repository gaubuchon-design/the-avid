// ═══════════════════════════════════════════════════════════════════════════
//  Halftone Effect
//  Converts image to halftone dot pattern.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply halftone pattern to image data.
 *
 * @param imageData Source image data (modified in place)
 * @param dotSize   Size of halftone dots in pixels
 * @param angle     Rotation angle of dot grid in degrees
 * @param shape     Dot shape: 'circle' | 'square' | 'diamond'
 */
export function applyHalftone(
  imageData: ImageData,
  dotSize: number,
  angle: number,
  shape: string,
): void {
  if (dotSize <= 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cellSize = Math.max(2, Math.round(dotSize));
  const halfCell = cellSize / 2;

  // Fill with white first
  data.fill(255);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Rotate coordinates
      const rx = x * cos + y * sin;
      const ry = -x * sin + y * cos;

      // Find cell center
      const cellX = Math.floor(rx / cellSize) * cellSize + halfCell;
      const cellY = Math.floor(ry / cellSize) * cellSize + halfCell;

      // Inverse rotate cell center back to image space
      const imgCx = Math.round(cellX * cos - cellY * sin);
      const imgCy = Math.round(cellX * sin + cellY * cos);

      // Sample luminance at cell center
      const sx = Math.max(0, Math.min(width - 1, imgCx));
      const sy = Math.max(0, Math.min(height - 1, imgCy));
      const si = (sy * width + sx) * 4;
      const luma = (0.299 * src[si] + 0.587 * src[si + 1] + 0.114 * src[si + 2]) / 255;

      // Dot radius proportional to darkness
      const maxRadius = halfCell * 0.95;
      const dotRadius = maxRadius * (1 - luma);

      // Distance from cell center in rotated space
      const localX = rx - (Math.floor(rx / cellSize) * cellSize + halfCell);
      const localY = ry - (Math.floor(ry / cellSize) * cellSize + halfCell);

      let inside = false;
      switch (shape) {
        case 'circle':
          inside = Math.sqrt(localX * localX + localY * localY) <= dotRadius;
          break;
        case 'square':
          inside = Math.abs(localX) <= dotRadius && Math.abs(localY) <= dotRadius;
          break;
        case 'diamond':
          inside = Math.abs(localX) + Math.abs(localY) <= dotRadius * 1.4;
          break;
        default:
          inside = Math.sqrt(localX * localX + localY * localY) <= dotRadius;
      }

      const di = (y * width + x) * 4;
      if (inside) {
        data[di] = 0;
        data[di + 1] = 0;
        data[di + 2] = 0;
      }
      data[di + 3] = src[(y * width + x) * 4 + 3]; // preserve original alpha
    }
  }
}
