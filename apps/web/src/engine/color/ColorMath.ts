// =============================================================================
//  Color Math Utilities
//  Cubic spline interpolation, CDL, white balance, HSL conversion, luma.
// =============================================================================

import type { Point, RGB } from '../ColorEngine';

// ── Rec.709 Luma ─────────────────────────────────────────────────────────────

export function rec709Luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── HSL <-> RGB ──────────────────────────────────────────────────────────────

export interface HSL {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;
  return {
    r: hue2rgb(p, q, hNorm + 1 / 3),
    g: hue2rgb(p, q, hNorm),
    b: hue2rgb(p, q, hNorm - 1 / 3),
  };
}

// ── CDL (ASC Color Decision List) ────────────────────────────────────────────

export interface CDLParams {
  slope: RGB;
  offset: RGB;
  power: RGB;
  saturation: number;
}

/** Apply ASC CDL: out = clamp((in * slope + offset) ^ power) then saturation. */
export function applyCDL(
  r: number, g: number, b: number,
  params: CDLParams,
): RGB {
  let nr = Math.pow(Math.max(0, r * params.slope.r + params.offset.r), params.power.r);
  let ng = Math.pow(Math.max(0, g * params.slope.g + params.offset.g), params.power.g);
  let nb = Math.pow(Math.max(0, b * params.slope.b + params.offset.b), params.power.b);

  const lum = rec709Luma(nr, ng, nb);
  nr = lum + (nr - lum) * params.saturation;
  ng = lum + (ng - lum) * params.saturation;
  nb = lum + (nb - lum) * params.saturation;

  return {
    r: Math.max(0, Math.min(1, nr)),
    g: Math.max(0, Math.min(1, ng)),
    b: Math.max(0, Math.min(1, nb)),
  };
}

// ── White Balance (Planckian Locus) ──────────────────────────────────────────

/** Convert color temperature (K) and tint to RGB multipliers.
 *  Uses Planckian locus approximation for daylight illuminants.
 *  Temperature: negative=warm (lower K), positive=cool (higher K)
 *  Tint: negative=green, positive=magenta  */
export function temperatureTintToRGB(temperature: number, tint: number): RGB {
  // Map temperature -100..100 to roughly 3200K..7500K, centered at 5500K
  const kelvin = 5500 + temperature * 20;
  // Approximate CIE xy from temperature (Hernandez-Andres 1999 fit)
  const t = kelvin;
  let x: number;
  if (t <= 4000) {
    x = -0.2661239e9 / (t * t * t) - 0.2343589e6 / (t * t) + 0.8776956e3 / t + 0.179910;
  } else {
    x = -3.0258469e9 / (t * t * t) + 2.1070379e6 / (t * t) + 0.2226347e3 / t + 0.24039;
  }
  let y: number;
  if (t <= 2222) {
    y = -1.1063814 * x * x * x - 1.34811020 * x * x + 2.18555832 * x - 0.20219683;
  } else if (t <= 4000) {
    y = -0.9549476 * x * x * x - 1.37418593 * x * x + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.0817580 * x * x * x - 5.87338670 * x * x + 3.75112997 * x - 0.37001483;
  }

  // Apply tint shift along green-magenta axis (perpendicular to Planckian locus)
  y += tint * 0.0005;

  // Convert CIE xy to RGB (assuming D65 sRGB primaries)
  const Y = 1.0;
  const X = (Y / y) * x;
  const Z = (Y / y) * (1 - x - y);

  // XYZ to linear sRGB (D65)
  let rr = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  let gg = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  let bb = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  // Normalize so max = 1
  const maxC = Math.max(rr, gg, bb, 1e-6);
  rr /= maxC;
  gg /= maxC;
  bb /= maxC;

  return { r: rr, g: gg, b: bb };
}

// ── Monotone Cubic Hermite Spline ────────────────────────────────────────────

/** Build a monotone cubic Hermite spline and bake it into a 256-entry LUT.
 *  Control points should be sorted by x in [0,1]. */
export function bakeCurveToLUT(points: Point[], size = 256): Float32Array {
  const lut = new Float32Array(size);

  if (points.length === 0) {
    for (let i = 0; i < size; i++) lut[i] = i / (size - 1);
    return lut;
  }

  // Sort by x
  const pts = [...points].sort((a, b) => a.x - b.x);

  // If only one point, constant value
  if (pts.length === 1) {
    lut.fill(Math.max(0, Math.min(1, pts[0].y)));
    return lut;
  }

  // Compute tangents using Fritsch-Carlson monotone method
  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / (dx[i] || 1e-10));
  }

  const tangents = new Float32Array(n);
  tangents[0] = m[0];
  tangents[n - 1] = m[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (m[i - 1] + m[i]) / 2;
    }
  }

  // Fritsch-Carlson monotonicity constraint
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(m[i]) < 1e-10) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / m[i];
      const beta = tangents[i + 1] / m[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * m[i];
        tangents[i + 1] = tau * beta * m[i];
      }
    }
  }

  // Evaluate spline at each LUT entry
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);

    // Clamp to endpoints
    if (x <= pts[0].x) {
      lut[i] = pts[0].y;
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[i] = pts[n - 1].y;
      continue;
    }

    // Find segment
    let seg = 0;
    for (let j = 0; j < n - 1; j++) {
      if (x >= pts[j].x && x < pts[j + 1].x) {
        seg = j;
        break;
      }
    }

    const h = dx[seg] || 1e-10;
    const t = (x - pts[seg].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis functions
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    lut[i] = Math.max(0, Math.min(1,
      h00 * pts[seg].y + h10 * h * tangents[seg] +
      h01 * pts[seg + 1].y + h11 * h * tangents[seg + 1]
    ));
  }

  return lut;
}

// ── Lift / Gamma / Gain Formula ──────────────────────────────────────────────

/** Apply lift/gamma/gain/offset to a single channel value (0..1 domain).
 *  Formula: gain * (offset + (1 - lift) * pow(input, 1/gamma) + lift) */
export function liftGammaGain(
  input: number,
  lift: number,
  gamma: number,
  gain: number,
  offset: number,
): number {
  const g = gamma === 0 ? 1e-6 : gamma;
  return gain * (offset + (1 - lift) * Math.pow(Math.max(0, input), 1 / g) + lift);
}

// ── Clamp Utility ────────────────────────────────────────────────────────────

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ── Contrast Around Pivot ────────────────────────────────────────────────────

export function contrastPivot(value: number, contrast: number, pivot = 0.435): number {
  return (value - pivot) * contrast + pivot;
}

// ── Linear <-> sRGB ──────────────────────────────────────────────────────────

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
