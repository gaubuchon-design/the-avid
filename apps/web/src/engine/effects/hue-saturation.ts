// ═══════════════════════════════════════════════════════════════════════════
//  Hue / Saturation / Lightness Effect
//  RGB ↔ HSL pixel manipulation.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply hue, saturation, and lightness adjustments.
 *
 * @param data        Pixel data (RGBA)
 * @param hue         -180 to 180 degrees
 * @param saturation  -100 to 100
 * @param lightness   -100 to 100
 * @param colorize    If true, sets hue/sat absolutely (like Photoshop Colorize)
 */
export function applyHueSaturation(
  data: Uint8ClampedArray,
  hue: number,
  saturation: number,
  lightness: number,
  colorize = false,
): void {
  if (hue === 0 && saturation === 0 && lightness === 0 && !colorize) return;

  const len = data.length;
  const hShift = hue / 360;
  const sShift = saturation / 100;
  const lShift = lightness / 100;

  for (let i = 0; i < len; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    let [h, s, l] = rgbToHsl(r, g, b);

    if (colorize) {
      h = (hue / 360 + 1) % 1;
      s = Math.max(0, Math.min(1, (saturation + 100) / 200));
    } else {
      h = (h + hShift + 1) % 1;
      s = Math.max(0, Math.min(1, s + sShift));
    }

    l = Math.max(0, Math.min(1, l + lShift));

    const [nr, ng, nb] = hslToRgb(h, s, l);
    data[i]     = Math.round(nr * 255);
    data[i + 1] = Math.round(ng * 255);
    data[i + 2] = Math.round(nb * 255);
  }
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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return [
    hueToRgb(p, q, h + 1 / 3),
    hueToRgb(p, q, h),
    hueToRgb(p, q, h - 1 / 3),
  ];
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
