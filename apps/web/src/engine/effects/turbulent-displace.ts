// ═══════════════════════════════════════════════════════════════════════════
//  Turbulent Displace Effect
//  Perlin noise-based pixel displacement.
// ═══════════════════════════════════════════════════════════════════════════

// Simplified Perlin noise implementation
function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

// Gradient table (precomputed)
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function hash(x: number, y: number): number {
  // Simple hash for deterministic noise
  let h = ((x * 374761393 + y * 668265263) ^ 0x5bd1e995) & 0x7fffffff;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  return ((h >> 16) ^ h) & 7;
}

function perlinNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const sx = fade(x - x0);
  const sy = fade(y - y0);

  const dot = (gx: number, gy: number, dx: number, dy: number) => {
    const g = GRAD[hash(gx, gy)];
    return g![0]! * dx + g![1]! * dy;
  };

  const n00 = dot(x0, y0, x - x0, y - y0);
  const n10 = dot(x1, y0, x - x1, y - y0);
  const n01 = dot(x0, y1, x - x0, y - y1);
  const n11 = dot(x1, y1, x - x1, y - y1);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function fbm(x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxVal = 0;

  for (let i = 0; i < octaves; i++) {
    value += perlinNoise(x * frequency, y * frequency) * amplitude;
    maxVal += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxVal;
}

/**
 * Apply turbulent displacement to image data.
 *
 * @param imageData  Source image (modified in place)
 * @param amount     Displacement amount (pixels)
 * @param size       Noise scale (1-200)
 * @param complexity Noise octaves (1-10)
 * @param evolution  Phase offset in degrees (0-360)
 * @param type       'turbulent' | 'turbulent-smoother' | 'bulge-smoother' | 'twist'
 */
export function applyTurbulentDisplace(
  imageData: ImageData,
  amount: number,
  size: number,
  complexity: number,
  evolution: number,
  _type: string,
): void {
  if (amount <= 0) return;

  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const scale = Math.max(1, size) / 100;
  const phase = (evolution * Math.PI) / 180;
  const octaves = Math.max(1, Math.min(10, Math.round(complexity)));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x * scale / width * 10 + phase;
      const ny = y * scale / height * 10;

      // Use two noise channels for X and Y displacement
      const dispX = fbm(nx, ny, octaves) * amount;
      const dispY = fbm(nx + 100, ny + 100, octaves) * amount;

      const srcX = Math.round(x + dispX);
      const srcY = Math.round(y + dispY);

      const di = (y * width + x) * 4;

      if (srcX < 0 || srcX >= width || srcY < 0 || srcY >= height) {
        data[di] = data[di + 1] = data[di + 2] = 0;
        data[di + 3] = 255;
        continue;
      }

      const si = (srcY * width + srcX) * 4;
      data[di] = src[si]!;
      data[di + 1] = src[si + 1]!;
      data[di + 2] = src[si + 2]!;
      data[di + 3] = src[si + 3]!;
    }
  }
}
