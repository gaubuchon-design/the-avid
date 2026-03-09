// =============================================================================
//  THE AVID -- OpenColorIO (OCIO) Color Management Engine
// =============================================================================
// ACES 1.2-compatible color management pipeline with GPU shader generation,
// LUT support, and a full transform graph for scene-referred workflows.

// ─── Math Utilities ─────────────────────────────────────────────────────────

/** A 3-component vector (RGB / XYZ). */
export type Vec3 = [number, number, number];

/** A 3x3 matrix stored in row-major order. */
export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

/** A 4x4 matrix stored in row-major order. */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

/** Multiply a 3x3 matrix by a Vec3. */
function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Multiply two 3x3 matrices. */
function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/** Invert a 3x3 matrix. Returns null if singular. */
function invertMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const invDet = 1.0 / det;
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
}

/** Identity 3x3 matrix. */
function identityMat3(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/** Multiply a 4x4 matrix by a Vec3 (w=1, perspective divide). */
function mulMat4Vec3(m: Mat4, v: Vec3): Vec3 {
  const w = m[12] * v[0] + m[13] * v[1] + m[14] * v[2] + m[15];
  const invW = Math.abs(w) > 1e-12 ? 1.0 / w : 1.0;
  return [
    (m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3]) * invW,
    (m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7]) * invW,
    (m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11]) * invW,
  ];
}

/** Multiply two 4x4 matrices. */
function mulMat4(a: Mat4, b: Mat4): Mat4 {
  const r: number[] = new Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      r[row * 4 + col] =
        a[row * 4 + 0] * b[0 * 4 + col] +
        a[row * 4 + 1] * b[1 * 4 + col] +
        a[row * 4 + 2] * b[2 * 4 + col] +
        a[row * 4 + 3] * b[3 * 4 + col];
    }
  }
  return r as Mat4;
}

/** Identity 4x4 matrix. */
function identityMat4(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Construct a 4x4 from a 3x3 (top-left block, rest identity). */
function mat4FromMat3(m: Mat3): Mat4 {
  return [
    m[0], m[1], m[2], 0,
    m[3], m[4], m[5], 0,
    m[6], m[7], m[8], 0,
    0, 0, 0, 1,
  ];
}

/** Clamp a value to [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Linear interpolation. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Log / Linear Conversion Utilities ──────────────────────────────────────

/** Convert linear to ACEScc. Clamps negatives per ACES spec. */
function linearToACEScc(x: number): number {
  if (x <= 0) {
    return -0.3584474886; // (log2(2^-16) + 9.72) / 17.52
  }
  if (x < 2.0e-16) {
    return (Math.log2(2.0e-16 * 0.5) + 9.72) / 17.52;
  }
  return (Math.log2(x) + 9.72) / 17.52;
}

/** Convert ACEScc to linear. */
function acesccToLinear(x: number): number {
  if (x < -0.3013698630) {
    return (Math.pow(2.0, x * 17.52 - 9.72) - Math.pow(2.0, -16.0)) * 2.0;
  }
  return Math.pow(2.0, x * 17.52 - 9.72);
}

/** Convert linear to ACEScct. */
function linearToACEScct(x: number): number {
  const CUT = 0.0078125; // 2^-7
  if (x <= CUT) {
    return 10.5402377416545 * x + 0.0729055341958355;
  }
  return (Math.log2(x) + 9.72) / 17.52;
}

/** Convert ACEScct to linear. */
function acescctToLinear(x: number): number {
  const CUT_Y = 0.155251141552511;
  if (x <= CUT_Y) {
    return (x - 0.0729055341958355) / 10.5402377416545;
  }
  return Math.pow(2.0, x * 17.52 - 9.72);
}

/** Convert linear to ARRI LogC (EI 800, SUP 3.x / ALEXA). */
function linearToLogC(x: number): number {
  const CUT = 0.010591;
  const A = 5.555556;
  const B = 0.052272;
  const C = 0.247190;
  const D = 0.385537;
  const E = 5.367655;
  const F = 0.092809;
  if (x > CUT) {
    return C * Math.log10(A * x + B) + D;
  }
  return E * x + F;
}

/** Convert ARRI LogC to linear. */
function logCToLinear(x: number): number {
  const CUT_Y = 0.149658;
  const A = 5.555556;
  const B = 0.052272;
  const C = 0.247190;
  const D = 0.385537;
  const E = 5.367655;
  const F = 0.092809;
  if (x > CUT_Y) {
    return (Math.pow(10.0, (x - D) / C) - B) / A;
  }
  return (x - F) / E;
}

/** Convert linear to Sony S-Log3. */
function linearToSLog3(x: number): number {
  const t = x / 0.18 + 0.01;
  if (t >= 0.01125) {
    return (420.0 + Math.log10(t) * 261.5) / 1023.0;
  }
  return (t * 76.2102946929 / 0.01125 + 95.0) / 1023.0;
}

/** Convert Sony S-Log3 to linear. */
function slog3ToLinear(x: number): number {
  const y = x * 1023.0;
  if (y >= 95.0 + 76.2102946929) {
    return (Math.pow(10.0, (y - 420.0) / 261.5) - 0.01) * 0.18;
  }
  return ((y - 95.0) * 0.01125 / 76.2102946929 - 0.01) * 0.18;
}

/** Convert linear to Panasonic V-Log. */
function linearToVLog(x: number): number {
  const CUT = 0.01;
  const B = 0.00873;
  const C = 0.241514;
  const D = 0.598206;
  if (x >= CUT) {
    return C * Math.log10(x + B) + D;
  }
  return 5.6 * x + 0.125;
}

/** Convert Panasonic V-Log to linear. */
function vlogToLinear(x: number): number {
  const CUT_Y = 0.181;
  const B = 0.00873;
  const C = 0.241514;
  const D = 0.598206;
  if (x >= CUT_Y) {
    return Math.pow(10.0, (x - D) / C) - B;
  }
  return (x - 0.125) / 5.6;
}

/** Convert linear to REDLogFilm (Log3G10). */
function linearToRedLog(x: number): number {
  const a = 0.224282;
  const b = 155.975327;
  const c = 0.01;
  const g = 15.1927;
  const t = x + c;
  if (t > 0.0) {
    return a * Math.log10(t * b + 1.0) + (x < 0.0 ? g * x : 0.0);
  }
  return a * Math.log10(c * b + 1.0) + g * x;
}

/** Convert REDLogFilm to linear. */
function redLogToLinear(x: number): number {
  const a = 0.224282;
  const b = 155.975327;
  const c = 0.01;
  return (Math.pow(10.0, x / a) - 1.0) / b - c;
}

/** Convert linear to sRGB (single channel). */
function linearToSRGB(x: number): number {
  if (x <= 0.0031308) {
    return x * 12.92;
  }
  return 1.055 * Math.pow(x, 1.0 / 2.4) - 0.055;
}

/** Convert sRGB to linear (single channel). */
function srgbToLinear(x: number): number {
  if (x <= 0.04045) {
    return x / 12.92;
  }
  return Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Convert linear to Rec.709 OETF (single channel). */
function linearToRec709(x: number): number {
  if (x < 0.018) {
    return x * 4.5;
  }
  return 1.099 * Math.pow(x, 0.45) - 0.099;
}

/** Convert Rec.709 OETF to linear (single channel). */
function rec709ToLinear(x: number): number {
  if (x < 0.081) {
    return x / 4.5;
  }
  return Math.pow((x + 0.099) / 1.099, 1.0 / 0.45);
}

// ─── Chromatic Adaptation & Primaries ───────────────────────────────────────

/**
 * CIE 1931 xy chromaticity coordinates for standard primaries and white points.
 */
const PRIMARIES = {
  // ACES AP0 (ACES2065-1)
  AP0_R: [0.7347, 0.2653] as [number, number],
  AP0_G: [0.0000, 1.0000] as [number, number],
  AP0_B: [0.0001, -0.0770] as [number, number],

  // ACES AP1 (ACEScg)
  AP1_R: [0.713, 0.293] as [number, number],
  AP1_G: [0.165, 0.830] as [number, number],
  AP1_B: [0.128, 0.044] as [number, number],

  // sRGB / Rec.709
  REC709_R: [0.64, 0.33] as [number, number],
  REC709_G: [0.30, 0.60] as [number, number],
  REC709_B: [0.15, 0.06] as [number, number],

  // Rec.2020
  REC2020_R: [0.708, 0.292] as [number, number],
  REC2020_G: [0.170, 0.797] as [number, number],
  REC2020_B: [0.131, 0.046] as [number, number],

  // Display P3
  P3_R: [0.680, 0.320] as [number, number],
  P3_G: [0.265, 0.690] as [number, number],
  P3_B: [0.150, 0.060] as [number, number],

  // D60 (ACES)
  D60: [0.32168, 0.33767] as [number, number],

  // D65 (sRGB / Rec.709 / Rec.2020 / P3)
  D65: [0.3127, 0.3290] as [number, number],
} as const;

/**
 * Build a 3x3 RGB-to-XYZ matrix from chromaticity coordinates.
 * Uses the method of computing the S vector via white point normalization.
 */
function rgbToXYZMatrix(
  r: [number, number],
  g: [number, number],
  b: [number, number],
  w: [number, number],
): Mat3 {
  // Convert xy -> XYZ (Y=1)
  const toXYZ = (xy: [number, number]): Vec3 => [
    xy[0] / xy[1],
    1.0,
    (1.0 - xy[0] - xy[1]) / xy[1],
  ];

  const Xr = toXYZ(r);
  const Xg = toXYZ(g);
  const Xb = toXYZ(b);
  const Xw = toXYZ(w);

  // Primaries matrix
  const P: Mat3 = [
    Xr[0], Xg[0], Xb[0],
    Xr[1], Xg[1], Xb[1],
    Xr[2], Xg[2], Xb[2],
  ];

  const Pinv = invertMat3(P);
  if (!Pinv) {
    console.error('[OCIOEngine] Singular primaries matrix');
    return identityMat3();
  }

  // S = Pinv * Xw
  const S = mulMat3Vec3(Pinv, Xw);

  // M = P * diag(S)
  return [
    P[0] * S[0], P[1] * S[1], P[2] * S[2],
    P[3] * S[0], P[4] * S[1], P[5] * S[2],
    P[6] * S[0], P[7] * S[1], P[8] * S[2],
  ];
}

/** Bradford chromatic adaptation matrix (D60 -> D65). */
const BRADFORD_D60_TO_D65: Mat3 = [
  0.987224, -0.006117,  0.015929,
 -0.007259,  1.001875, -0.003423,
  0.003032, -0.005088,  1.081375,
];

/** Bradford chromatic adaptation matrix (D65 -> D60). */
const BRADFORD_D65_TO_D60: Mat3 = [
  1.012996,  0.006105, -0.014876,
  0.007326,  0.998150,  0.003533,
 -0.002849,  0.004675,  0.924507,
];

// ─── Pre-computed Conversion Matrices ───────────────────────────────────────

/** AP0 (ACES2065-1, D60) -> XYZ */
const AP0_TO_XYZ = rgbToXYZMatrix(
  PRIMARIES.AP0_R, PRIMARIES.AP0_G, PRIMARIES.AP0_B, PRIMARIES.D60,
);

/** XYZ -> AP0 */
const XYZ_TO_AP0 = invertMat3(AP0_TO_XYZ) ?? identityMat3();

/** AP1 (ACEScg, D60) -> XYZ */
const AP1_TO_XYZ = rgbToXYZMatrix(
  PRIMARIES.AP1_R, PRIMARIES.AP1_G, PRIMARIES.AP1_B, PRIMARIES.D60,
);

/** XYZ -> AP1 */
const XYZ_TO_AP1 = invertMat3(AP1_TO_XYZ) ?? identityMat3();

/** Rec.709 / sRGB (D65) -> XYZ */
const REC709_TO_XYZ = rgbToXYZMatrix(
  PRIMARIES.REC709_R, PRIMARIES.REC709_G, PRIMARIES.REC709_B, PRIMARIES.D65,
);

/** XYZ -> Rec.709 / sRGB */
const XYZ_TO_REC709 = invertMat3(REC709_TO_XYZ) ?? identityMat3();

/** Rec.2020 (D65) -> XYZ */
const REC2020_TO_XYZ = rgbToXYZMatrix(
  PRIMARIES.REC2020_R, PRIMARIES.REC2020_G, PRIMARIES.REC2020_B, PRIMARIES.D65,
);

/** XYZ -> Rec.2020 */
const XYZ_TO_REC2020 = invertMat3(REC2020_TO_XYZ) ?? identityMat3();

/** Display P3 (D65) -> XYZ */
const P3_TO_XYZ = rgbToXYZMatrix(
  PRIMARIES.P3_R, PRIMARIES.P3_G, PRIMARIES.P3_B, PRIMARIES.D65,
);

/** XYZ -> Display P3 */
const XYZ_TO_P3 = invertMat3(P3_TO_XYZ) ?? identityMat3();

/** AP0 -> AP1 direct matrix. */
const AP0_TO_AP1: Mat3 = mulMat3(XYZ_TO_AP1, AP0_TO_XYZ);

/** AP1 -> AP0 direct matrix. */
const AP1_TO_AP0: Mat3 = mulMat3(XYZ_TO_AP0, AP1_TO_XYZ);

// ─── Transform Types ────────────────────────────────────────────────────────

/** Bit depth options. */
export type BitDepth = '8i' | '10i' | '12i' | '16i' | '16f' | '32f';

/** Direction of a transform operation. */
export type TransformDirection = 'forward' | 'inverse';

/** A 3x3 or 4x4 matrix transform. */
export interface MatrixTransform {
  type: 'MatrixTransform';
  matrix: Mat3 | Mat4;
  offset?: Vec3;
  direction: TransformDirection;
}

/** A log-encoding transform (base-2 or base-10). */
export interface LogTransform {
  type: 'LogTransform';
  base: number;
  /** Named log type for built-in curves, or 'generic' for base only. */
  logStyle:
    | 'ACEScc'
    | 'ACEScct'
    | 'LogC'
    | 'SLog3'
    | 'VLog'
    | 'RedLog'
    | 'generic';
  direction: TransformDirection;
}

/** ASC Color Decision List transform (slope, offset, power, saturation). */
export interface CDLTransform {
  type: 'CDLTransform';
  slope: Vec3;
  offset: Vec3;
  power: Vec3;
  saturation: number;
  direction: TransformDirection;
}

/** File-based transform (LUT reference). */
export interface FileTransform {
  type: 'FileTransform';
  src: string;
  interpolation: 'nearest' | 'linear' | 'tetrahedral';
  direction: TransformDirection;
}

/** Exponent (gamma) transform. */
export interface ExponentTransform {
  type: 'ExponentTransform';
  value: Vec3;
  direction: TransformDirection;
}

/** sRGB piecewise EOTF/OETF. */
export interface SRGBTransform {
  type: 'SRGBTransform';
  direction: TransformDirection;
}

/** Rec.709 OETF. */
export interface Rec709Transform {
  type: 'Rec709Transform';
  direction: TransformDirection;
}

/** Union of all OCIO transform types. */
export type OCIOTransform =
  | MatrixTransform
  | LogTransform
  | CDLTransform
  | FileTransform
  | ExponentTransform
  | SRGBTransform
  | Rec709Transform;

// ─── Configuration Types ────────────────────────────────────────────────────

/** A named color space with its transforms to/from the scene-referred reference. */
export interface ColorSpace {
  name: string;
  family: string;
  encoding: 'scene-linear' | 'log' | 'video' | 'data' | 'display-linear';
  bitdepth: BitDepth;
  description: string;
  /** Transform chain from this space TO the scene reference space (ACES2065-1). */
  toReference: OCIOTransform[];
  /** Transform chain FROM the scene reference space to this space. */
  fromReference: OCIOTransform[];
  /** Whether this color space is a data/passthrough space (no color transforms). */
  isData?: boolean;
}

/** A display device definition. */
export interface Display {
  name: string;
  views: View[];
}

/** A view transform for a display (e.g. 'ACES 1.0 - SDR Video', 'Raw'). */
export interface View {
  name: string;
  colorSpace: string;
  looks?: string;
  description?: string;
}

/** A named creative look (e.g. film emulation). */
export interface Look {
  name: string;
  processSpace: string;
  transform: OCIOTransform[];
  inverseTransform?: OCIOTransform[];
  description?: string;
}

/**
 * Semantic role aliases mapping logical roles to color space names.
 * Based on OCIO standard roles.
 */
export interface Roles {
  /** The scene-referred reference space. Default: ACES2065-1. */
  reference: string;
  /** Scene-linear working space. Default: ACEScg. */
  scene_linear: string;
  /** Compositing log space. Default: ACEScct. */
  compositing_log: string;
  /** Color picking space. Default: sRGB. */
  color_picking: string;
  /** Color timing / grading space. Default: ACEScct. */
  color_timing: string;
  /** Texture painting space. Default: sRGB. */
  texture_paint: string;
  /** Matte painting space. Default: sRGB. */
  matte_paint: string;
  /** Default interchange space. Default: ACES2065-1. */
  aces_interchange: string;
  /** Default input space for unknown media. */
  default_input: string;
  /** Data / utility (no transform). */
  data: string;
}

/** File rule for automatic color space assignment based on file path patterns. */
export interface FileRule {
  name: string;
  pattern: string;
  colorSpace: string;
  priority: number;
}

/** The top-level OCIO configuration. */
export interface OCIOConfig {
  name: string;
  description: string;
  /** Major.minor.patch semver for the config. */
  version: string;
  colorSpaces: ColorSpace[];
  displays: Display[];
  looks: Look[];
  roles: Roles;
  fileRules: FileRule[];
  /** The default display device name. */
  defaultDisplay: string;
  /** The default view name. */
  defaultView: string;
  /** Environment variable search paths for LUTs, etc. */
  searchPaths: string[];
}

// ─── LUT Types ──────────────────────────────────────────────────────────────

/** A parsed 1D LUT. */
export interface LUT1D {
  type: '1D';
  title: string;
  size: number;
  domainMin: Vec3;
  domainMax: Vec3;
  /** Per-channel tables. data[channel][index] */
  data: [Float32Array, Float32Array, Float32Array];
}

/** A parsed 3D LUT. */
export interface LUT3D {
  type: '3D';
  title: string;
  size: number;
  domainMin: Vec3;
  domainMax: Vec3;
  /** Flattened RGBRGBRGB... data, length = size^3 * 3. */
  data: Float32Array;
}

/** A GPU-ready LUT texture descriptor. */
export interface LUTTexture {
  type: '1D' | '3D';
  width: number;
  height: number;
  depth: number;
  data: Float32Array;
}

// ─── Color Processor ────────────────────────────────────────────────────────

/**
 * A compiled color processor that holds the transform chain from a source
 * color space to a destination color space. Cached by the engine.
 */
export class ColorProcessor {
  readonly sourceSpace: string;
  readonly destSpace: string;
  private transforms: OCIOTransform[];

  constructor(source: string, dest: string, transforms: OCIOTransform[]) {
    this.sourceSpace = source;
    this.destSpace = dest;
    this.transforms = transforms;
  }

  /** Apply all transforms to a single RGB triplet (scene-linear values). */
  apply(rgb: Vec3): Vec3 {
    let result: Vec3 = [rgb[0], rgb[1], rgb[2]];
    for (const t of this.transforms) {
      result = ColorProcessor.applyTransform(result, t);
    }
    return result;
  }

  /** Get the raw transform chain for inspection/serialization. */
  getTransforms(): readonly OCIOTransform[] {
    return this.transforms;
  }

  /** Apply a single transform to an RGB value. */
  static applyTransform(rgb: Vec3, t: OCIOTransform): Vec3 {
    switch (t.type) {
      case 'MatrixTransform':
        return ColorProcessor.applyMatrix(rgb, t);
      case 'LogTransform':
        return ColorProcessor.applyLog(rgb, t);
      case 'CDLTransform':
        return ColorProcessor.applyCDL(rgb, t);
      case 'ExponentTransform':
        return ColorProcessor.applyExponent(rgb, t);
      case 'SRGBTransform':
        return ColorProcessor.applySRGB(rgb, t);
      case 'Rec709Transform':
        return ColorProcessor.applyRec709(rgb, t);
      case 'FileTransform':
        // File transforms require loaded LUT data; return passthrough
        return rgb;
    }
  }

  private static applyMatrix(rgb: Vec3, t: MatrixTransform): Vec3 {
    const m = t.matrix;
    let result: Vec3;
    if (m.length === 9) {
      const mat = m as Mat3;
      if (t.direction === 'inverse') {
        const inv = invertMat3(mat);
        result = inv ? mulMat3Vec3(inv, rgb) : rgb;
      } else {
        result = mulMat3Vec3(mat, rgb);
      }
    } else {
      const mat = m as Mat4;
      // For inverse 4x4, we only support the forward direction in this
      // implementation -- inverse 4x4 would require a full 4x4 invert.
      result = mulMat4Vec3(mat, rgb);
    }
    if (t.offset) {
      const sign = t.direction === 'inverse' ? -1 : 1;
      result[0] += t.offset[0] * sign;
      result[1] += t.offset[1] * sign;
      result[2] += t.offset[2] * sign;
    }
    return result;
  }

  private static applyLog(rgb: Vec3, t: LogTransform): Vec3 {
    const fwd = t.direction === 'forward';
    switch (t.logStyle) {
      case 'ACEScc':
        return fwd
          ? [linearToACEScc(rgb[0]), linearToACEScc(rgb[1]), linearToACEScc(rgb[2])]
          : [acesccToLinear(rgb[0]), acesccToLinear(rgb[1]), acesccToLinear(rgb[2])];
      case 'ACEScct':
        return fwd
          ? [linearToACEScct(rgb[0]), linearToACEScct(rgb[1]), linearToACEScct(rgb[2])]
          : [acescctToLinear(rgb[0]), acescctToLinear(rgb[1]), acescctToLinear(rgb[2])];
      case 'LogC':
        return fwd
          ? [linearToLogC(rgb[0]), linearToLogC(rgb[1]), linearToLogC(rgb[2])]
          : [logCToLinear(rgb[0]), logCToLinear(rgb[1]), logCToLinear(rgb[2])];
      case 'SLog3':
        return fwd
          ? [linearToSLog3(rgb[0]), linearToSLog3(rgb[1]), linearToSLog3(rgb[2])]
          : [slog3ToLinear(rgb[0]), slog3ToLinear(rgb[1]), slog3ToLinear(rgb[2])];
      case 'VLog':
        return fwd
          ? [linearToVLog(rgb[0]), linearToVLog(rgb[1]), linearToVLog(rgb[2])]
          : [vlogToLinear(rgb[0]), vlogToLinear(rgb[1]), vlogToLinear(rgb[2])];
      case 'RedLog':
        return fwd
          ? [linearToRedLog(rgb[0]), linearToRedLog(rgb[1]), linearToRedLog(rgb[2])]
          : [redLogToLinear(rgb[0]), redLogToLinear(rgb[1]), redLogToLinear(rgb[2])];
      case 'generic': {
        const logBase = Math.log(t.base);
        if (fwd) {
          return [
            Math.log(Math.max(rgb[0], 1e-10)) / logBase,
            Math.log(Math.max(rgb[1], 1e-10)) / logBase,
            Math.log(Math.max(rgb[2], 1e-10)) / logBase,
          ];
        }
        return [
          Math.pow(t.base, rgb[0]),
          Math.pow(t.base, rgb[1]),
          Math.pow(t.base, rgb[2]),
        ];
      }
    }
  }

  private static applyCDL(rgb: Vec3, t: CDLTransform): Vec3 {
    const fwd = t.direction === 'forward';
    if (fwd) {
      // out = clamp(in * slope + offset) ^ power
      let r = clamp(rgb[0] * t.slope[0] + t.offset[0], 0, 1);
      let g = clamp(rgb[1] * t.slope[1] + t.offset[1], 0, 1);
      let b = clamp(rgb[2] * t.slope[2] + t.offset[2], 0, 1);
      r = Math.pow(r, t.power[0]);
      g = Math.pow(g, t.power[1]);
      b = Math.pow(b, t.power[2]);
      // Saturation adjustment
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + t.saturation * (r - luma);
      g = luma + t.saturation * (g - luma);
      b = luma + t.saturation * (b - luma);
      return [r, g, b];
    } else {
      // Inverse CDL
      let [r, g, b] = rgb;
      // Inverse saturation
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const invSat = t.saturation !== 0 ? 1.0 / t.saturation : 1.0;
      r = luma + invSat * (r - luma);
      g = luma + invSat * (g - luma);
      b = luma + invSat * (b - luma);
      // Inverse power
      r = t.power[0] !== 0 ? Math.pow(Math.max(r, 0), 1.0 / t.power[0]) : r;
      g = t.power[1] !== 0 ? Math.pow(Math.max(g, 0), 1.0 / t.power[1]) : g;
      b = t.power[2] !== 0 ? Math.pow(Math.max(b, 0), 1.0 / t.power[2]) : b;
      // Inverse slope+offset
      r = t.slope[0] !== 0 ? (r - t.offset[0]) / t.slope[0] : r;
      g = t.slope[1] !== 0 ? (g - t.offset[1]) / t.slope[1] : g;
      b = t.slope[2] !== 0 ? (b - t.offset[2]) / t.slope[2] : b;
      return [r, g, b];
    }
  }

  private static applyExponent(rgb: Vec3, t: ExponentTransform): Vec3 {
    const fwd = t.direction === 'forward';
    const e = t.value;
    if (fwd) {
      return [
        Math.pow(Math.max(rgb[0], 0), e[0]),
        Math.pow(Math.max(rgb[1], 0), e[1]),
        Math.pow(Math.max(rgb[2], 0), e[2]),
      ];
    }
    return [
      e[0] !== 0 ? Math.pow(Math.max(rgb[0], 0), 1.0 / e[0]) : rgb[0],
      e[1] !== 0 ? Math.pow(Math.max(rgb[1], 0), 1.0 / e[1]) : rgb[1],
      e[2] !== 0 ? Math.pow(Math.max(rgb[2], 0), 1.0 / e[2]) : rgb[2],
    ];
  }

  private static applySRGB(rgb: Vec3, t: SRGBTransform): Vec3 {
    if (t.direction === 'forward') {
      // Linear -> sRGB
      return [linearToSRGB(rgb[0]), linearToSRGB(rgb[1]), linearToSRGB(rgb[2])];
    }
    // sRGB -> Linear
    return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
  }

  private static applyRec709(rgb: Vec3, t: Rec709Transform): Vec3 {
    if (t.direction === 'forward') {
      return [linearToRec709(rgb[0]), linearToRec709(rgb[1]), linearToRec709(rgb[2])];
    }
    return [rec709ToLinear(rgb[0]), rec709ToLinear(rgb[1]), rec709ToLinear(rgb[2])];
  }
}

// ─── .cube LUT Parser ───────────────────────────────────────────────────────

/**
 * Parse a .cube LUT file (supports both 1D and 3D formats).
 * Returns a LUT1D or LUT3D structure.
 */
export function parseCubeLUT(text: string): LUT1D | LUT3D | null {
  const lines = text.split(/\r?\n/);
  let title = '';
  let size1D = 0;
  let size3D = 0;
  let domainMin: Vec3 = [0, 0, 0];
  let domainMax: Vec3 = [1, 1, 1];
  const values: number[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      title = line.substring(5).trim().replace(/^"(.*)"$/, '$1');
      continue;
    }
    if (line.startsWith('LUT_1D_SIZE')) {
      size1D = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      size3D = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/);
      domainMin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      continue;
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/);
      domainMax = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      continue;
    }

    // Data line
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        values.push(r, g, b);
      }
    }
  }

  if (size3D > 0) {
    const expected = size3D * size3D * size3D * 3;
    if (values.length < expected) {
      console.warn(`[OCIOEngine] 3D LUT data incomplete: expected ${expected}, got ${values.length}`);
      return null;
    }
    return {
      type: '3D',
      title,
      size: size3D,
      domainMin,
      domainMax,
      data: new Float32Array(values.slice(0, expected)),
    };
  }

  if (size1D > 0) {
    const expected = size1D * 3;
    if (values.length < expected) {
      console.warn(`[OCIOEngine] 1D LUT data incomplete: expected ${expected}, got ${values.length}`);
      return null;
    }
    const r = new Float32Array(size1D);
    const g = new Float32Array(size1D);
    const b = new Float32Array(size1D);
    for (let i = 0; i < size1D; i++) {
      r[i] = values[i * 3];
      g[i] = values[i * 3 + 1];
      b[i] = values[i * 3 + 2];
    }
    return {
      type: '1D',
      title,
      size: size1D,
      domainMin,
      domainMax,
      data: [r, g, b],
    };
  }

  console.warn('[OCIOEngine] No LUT size found in .cube data');
  return null;
}

/**
 * Apply a 1D LUT to an RGB value via linear interpolation.
 */
export function apply1DLUT(lut: LUT1D, rgb: Vec3): Vec3 {
  const result: Vec3 = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const normalized = (rgb[ch] - lut.domainMin[ch]) / (lut.domainMax[ch] - lut.domainMin[ch]);
    const idx = normalized * (lut.size - 1);
    const lo = Math.max(0, Math.min(lut.size - 2, Math.floor(idx)));
    const hi = lo + 1;
    const frac = idx - lo;
    result[ch] = lerp(lut.data[ch][lo], lut.data[ch][hi], frac);
  }
  return result;
}

/**
 * Apply a 3D LUT to an RGB value via trilinear interpolation.
 */
export function apply3DLUT(lut: LUT3D, rgb: Vec3): Vec3 {
  const s = lut.size;
  const s2 = s * s;

  // Normalize input to [0, size-1]
  const rn = clamp((rgb[0] - lut.domainMin[0]) / (lut.domainMax[0] - lut.domainMin[0]), 0, 1) * (s - 1);
  const gn = clamp((rgb[1] - lut.domainMin[1]) / (lut.domainMax[1] - lut.domainMin[1]), 0, 1) * (s - 1);
  const bn = clamp((rgb[2] - lut.domainMin[2]) / (lut.domainMax[2] - lut.domainMin[2]), 0, 1) * (s - 1);

  const r0 = Math.min(Math.floor(rn), s - 2);
  const g0 = Math.min(Math.floor(gn), s - 2);
  const b0 = Math.min(Math.floor(bn), s - 2);
  const r1 = r0 + 1;
  const g1 = g0 + 1;
  const b1 = b0 + 1;

  const fr = rn - r0;
  const fg = gn - g0;
  const fb = bn - b0;

  // Trilinear interpolation -- .cube format stores R varying fastest
  const idx = (ri: number, gi: number, bi: number) => (bi * s2 + gi * s + ri) * 3;

  const result: Vec3 = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const c000 = lut.data[idx(r0, g0, b0) + ch];
    const c100 = lut.data[idx(r1, g0, b0) + ch];
    const c010 = lut.data[idx(r0, g1, b0) + ch];
    const c110 = lut.data[idx(r1, g1, b0) + ch];
    const c001 = lut.data[idx(r0, g0, b1) + ch];
    const c101 = lut.data[idx(r1, g0, b1) + ch];
    const c011 = lut.data[idx(r0, g1, b1) + ch];
    const c111 = lut.data[idx(r1, g1, b1) + ch];

    const c00 = lerp(c000, c100, fr);
    const c10 = lerp(c010, c110, fr);
    const c01 = lerp(c001, c101, fr);
    const c11 = lerp(c011, c111, fr);

    const c0 = lerp(c00, c10, fg);
    const c1 = lerp(c01, c11, fg);

    result[ch] = lerp(c0, c1, fb);
  }
  return result;
}

/**
 * Generate a GPU-ready LUT texture from a 1D LUT.
 * Returns a width x 1 x 1 RGBA float texture.
 */
export function generate1DLUTTexture(lut: LUT1D): LUTTexture {
  const data = new Float32Array(lut.size * 4);
  for (let i = 0; i < lut.size; i++) {
    data[i * 4 + 0] = lut.data[0][i];
    data[i * 4 + 1] = lut.data[1][i];
    data[i * 4 + 2] = lut.data[2][i];
    data[i * 4 + 3] = 1.0;
  }
  return { type: '1D', width: lut.size, height: 1, depth: 1, data };
}

/**
 * Generate a GPU-ready 3D LUT texture.
 * Returns a size x size x size RGBA float texture.
 */
export function generate3DLUTTexture(lut: LUT3D): LUTTexture {
  const s = lut.size;
  const total = s * s * s;
  const data = new Float32Array(total * 4);
  for (let i = 0; i < total; i++) {
    data[i * 4 + 0] = lut.data[i * 3 + 0];
    data[i * 4 + 1] = lut.data[i * 3 + 1];
    data[i * 4 + 2] = lut.data[i * 3 + 2];
    data[i * 4 + 3] = 1.0;
  }
  return { type: '3D', width: s, height: s, depth: s, data };
}

// ─── Built-in ACES 1.2 Configuration ────────────────────────────────────────

function buildACESConfig(): OCIOConfig {
  const colorSpaces: ColorSpace[] = [
    // ── ACES2065-1 (AP0 Linear) -- the scene reference ──
    {
      name: 'ACES2065-1',
      family: 'ACES',
      encoding: 'scene-linear',
      bitdepth: '32f',
      description: 'ACES 2065-1, AP0 primaries, scene-referred linear. The ACES interchange and reference color space.',
      toReference: [],
      fromReference: [],
    },

    // ── ACEScg (AP1 Linear) ──
    {
      name: 'ACEScg',
      family: 'ACES',
      encoding: 'scene-linear',
      bitdepth: '32f',
      description: 'ACEScg working space, AP1 primaries, scene-referred linear. Primary CG compositing space.',
      toReference: [
        { type: 'MatrixTransform', matrix: AP1_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_AP1, direction: 'forward' },
      ],
    },

    // ── ACEScc (AP1 Log) ──
    {
      name: 'ACEScc',
      family: 'ACES',
      encoding: 'log',
      bitdepth: '32f',
      description: 'ACEScc, AP1 primaries, pure-log encoding. For traditional log grading workflows.',
      toReference: [
        { type: 'LogTransform', base: 2, logStyle: 'ACEScc', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: AP1_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_AP1, direction: 'forward' },
        { type: 'LogTransform', base: 2, logStyle: 'ACEScc', direction: 'forward' },
      ],
    },

    // ── ACEScct (AP1 Log with toe) ──
    {
      name: 'ACEScct',
      family: 'ACES',
      encoding: 'log',
      bitdepth: '32f',
      description: 'ACEScct, AP1 primaries, log encoding with a linear toe. Preferred for grading in ACES.',
      toReference: [
        { type: 'LogTransform', base: 2, logStyle: 'ACEScct', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: AP1_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_AP1, direction: 'forward' },
        { type: 'LogTransform', base: 2, logStyle: 'ACEScct', direction: 'forward' },
      ],
    },

    // ── sRGB ──
    {
      name: 'sRGB',
      family: 'Display',
      encoding: 'video',
      bitdepth: '8i',
      description: 'sRGB display space, Rec.709 primaries, sRGB EOTF. Standard web / desktop monitor space.',
      toReference: [
        { type: 'SRGBTransform', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC709_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC709, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'SRGBTransform', direction: 'forward' },
      ],
    },

    // ── Rec.709 ──
    {
      name: 'Rec.709',
      family: 'Display',
      encoding: 'video',
      bitdepth: '10i',
      description: 'Rec.709 display space with Rec.709 OETF. SDR broadcast standard.',
      toReference: [
        { type: 'Rec709Transform', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC709_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC709, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'Rec709Transform', direction: 'forward' },
      ],
    },

    // ── Rec.2020 (scene-linear) ──
    {
      name: 'Rec.2020',
      family: 'Display',
      encoding: 'scene-linear',
      bitdepth: '16f',
      description: 'Rec.2020 / BT.2020 wide gamut linear. Used for HDR and UHD workflows.',
      toReference: [
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC2020_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC2020, BRADFORD_D60_TO_D65), direction: 'forward' },
      ],
    },

    // ── Display P3 ──
    {
      name: 'Display P3',
      family: 'Display',
      encoding: 'video',
      bitdepth: '10i',
      description: 'Display P3, P3 primaries with sRGB transfer function. Apple / cinema display standard.',
      toReference: [
        { type: 'SRGBTransform', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, P3_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_P3, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'SRGBTransform', direction: 'forward' },
      ],
    },

    // ── ARRI LogC (EI 800) ──
    {
      name: 'ARRI LogC',
      family: 'Camera',
      encoding: 'log',
      bitdepth: '10i',
      description: 'ARRI LogC encoding for ALEXA cameras. Wide gamut to ACES via manufacturer-provided matrix.',
      toReference: [
        { type: 'LogTransform', base: 10, logStyle: 'LogC', direction: 'inverse' },
        // ARRI Wide Gamut -> ACES AP0 (simplified via XYZ)
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC709_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC709, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'LogTransform', base: 10, logStyle: 'LogC', direction: 'forward' },
      ],
    },

    // ── Sony S-Log3 / S-Gamut3 ──
    {
      name: 'S-Log3',
      family: 'Camera',
      encoding: 'log',
      bitdepth: '10i',
      description: 'Sony S-Log3 encoding. Used with S-Gamut3 / S-Gamut3.Cine on Venice, FX, Alpha cameras.',
      toReference: [
        { type: 'LogTransform', base: 10, logStyle: 'SLog3', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC709_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC709, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'LogTransform', base: 10, logStyle: 'SLog3', direction: 'forward' },
      ],
    },

    // ── Panasonic V-Log ──
    {
      name: 'V-Log',
      family: 'Camera',
      encoding: 'log',
      bitdepth: '10i',
      description: 'Panasonic V-Log encoding. Used on VariCam, EVA1, GH5S and other V-Log L cameras.',
      toReference: [
        { type: 'LogTransform', base: 10, logStyle: 'VLog', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC709_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC709, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'LogTransform', base: 10, logStyle: 'VLog', direction: 'forward' },
      ],
    },

    // ── RED Log3G10 / REDWideGamutRGB ──
    {
      name: 'REDLog',
      family: 'Camera',
      encoding: 'log',
      bitdepth: '16f',
      description: 'RED Log3G10 encoding with REDWideGamutRGB primaries. Used on DSMC2 / V-RAPTOR cameras.',
      toReference: [
        { type: 'LogTransform', base: 10, logStyle: 'RedLog', direction: 'inverse' },
        { type: 'MatrixTransform', matrix: mulMat3(BRADFORD_D65_TO_D60, REC709_TO_XYZ), direction: 'forward' },
        { type: 'MatrixTransform', matrix: XYZ_TO_AP0, direction: 'forward' },
      ],
      fromReference: [
        { type: 'MatrixTransform', matrix: AP0_TO_XYZ, direction: 'forward' },
        { type: 'MatrixTransform', matrix: mulMat3(XYZ_TO_REC709, BRADFORD_D60_TO_D65), direction: 'forward' },
        { type: 'LogTransform', base: 10, logStyle: 'RedLog', direction: 'forward' },
      ],
    },

    // ── Raw / Data (passthrough) ──
    {
      name: 'Raw',
      family: 'Utility',
      encoding: 'data',
      bitdepth: '32f',
      description: 'Raw / data passthrough -- no color transform applied. For non-color data (normals, depth, etc.).',
      toReference: [],
      fromReference: [],
      isData: true,
    },
  ];

  const displays: Display[] = [
    {
      name: 'sRGB Monitor',
      views: [
        { name: 'ACES 1.0 - SDR Video', colorSpace: 'sRGB', description: 'ACES Output Transform for sRGB displays' },
        { name: 'Raw', colorSpace: 'Raw', description: 'No transform (raw scene values)' },
        { name: 'Log', colorSpace: 'ACEScct', description: 'Log view for exposure check' },
      ],
    },
    {
      name: 'Rec.709 Monitor',
      views: [
        { name: 'ACES 1.0 - SDR Video', colorSpace: 'Rec.709', description: 'ACES Output Transform for Rec.709' },
        { name: 'Raw', colorSpace: 'Raw' },
      ],
    },
    {
      name: 'P3-D65 Display',
      views: [
        { name: 'ACES 1.0 - SDR Cinema', colorSpace: 'Display P3', description: 'ACES Output Transform for P3 cinema' },
        { name: 'Raw', colorSpace: 'Raw' },
      ],
    },
    {
      name: 'Rec.2020 HDR',
      views: [
        { name: 'ACES 1.0 - HDR Video (1000 nits)', colorSpace: 'Rec.2020', description: 'HDR output for Rec.2020 displays' },
        { name: 'Raw', colorSpace: 'Raw' },
      ],
    },
  ];

  const looks: Look[] = [
    {
      name: 'Neutral',
      processSpace: 'ACEScct',
      transform: [],
      description: 'No creative look applied.',
    },
    {
      name: 'Film Emulation - Warm',
      processSpace: 'ACEScct',
      transform: [
        {
          type: 'CDLTransform',
          slope: [1.05, 1.0, 0.92],
          offset: [0.002, 0.0, -0.005],
          power: [1.0, 1.0, 1.0],
          saturation: 0.95,
          direction: 'forward',
        },
      ],
      description: 'Warm film emulation with slightly desaturated blues.',
    },
    {
      name: 'Film Emulation - Cool',
      processSpace: 'ACEScct',
      transform: [
        {
          type: 'CDLTransform',
          slope: [0.92, 0.97, 1.08],
          offset: [-0.003, 0.0, 0.004],
          power: [1.0, 1.0, 1.0],
          saturation: 0.92,
          direction: 'forward',
        },
      ],
      description: 'Cool/teal film emulation.',
    },
    {
      name: 'Bleach Bypass',
      processSpace: 'ACEScct',
      transform: [
        {
          type: 'CDLTransform',
          slope: [1.1, 1.1, 1.1],
          offset: [0.0, 0.0, 0.0],
          power: [1.15, 1.15, 1.15],
          saturation: 0.5,
          direction: 'forward',
        },
      ],
      description: 'Bleach bypass / silver retention look. High contrast, desaturated.',
    },
    {
      name: 'High Contrast',
      processSpace: 'ACEScct',
      transform: [
        {
          type: 'CDLTransform',
          slope: [1.2, 1.2, 1.2],
          offset: [-0.02, -0.02, -0.02],
          power: [1.1, 1.1, 1.1],
          saturation: 1.1,
          direction: 'forward',
        },
      ],
      description: 'High contrast, punchy look.',
    },
  ];

  const roles: Roles = {
    reference: 'ACES2065-1',
    scene_linear: 'ACEScg',
    compositing_log: 'ACEScct',
    color_picking: 'sRGB',
    color_timing: 'ACEScct',
    texture_paint: 'sRGB',
    matte_paint: 'sRGB',
    aces_interchange: 'ACES2065-1',
    default_input: 'sRGB',
    data: 'Raw',
  };

  const fileRules: FileRule[] = [
    { name: 'EXR files', pattern: '*.exr', colorSpace: 'ACES2065-1', priority: 100 },
    { name: 'ARRIRAW', pattern: '*.ari', colorSpace: 'ARRI LogC', priority: 90 },
    { name: 'R3D files', pattern: '*.r3d', colorSpace: 'REDLog', priority: 90 },
    { name: 'MXF files', pattern: '*.mxf', colorSpace: 'ACEScg', priority: 50 },
    { name: 'DPX files', pattern: '*.dpx', colorSpace: 'ACEScct', priority: 50 },
    { name: 'JPEG files', pattern: '*.jpg', colorSpace: 'sRGB', priority: 10 },
    { name: 'PNG files', pattern: '*.png', colorSpace: 'sRGB', priority: 10 },
    { name: 'TIFF files', pattern: '*.tif', colorSpace: 'sRGB', priority: 10 },
    { name: 'Default', pattern: '*', colorSpace: 'sRGB', priority: 0 },
  ];

  return {
    name: 'ACES 1.2',
    description: 'ACES 1.2-compatible configuration for The Avid. Scene-referred pipeline with ACES2065-1 reference.',
    version: '1.2.0',
    colorSpaces,
    displays,
    looks,
    roles,
    fileRules,
    defaultDisplay: 'sRGB Monitor',
    defaultView: 'ACES 1.0 - SDR Video',
    searchPaths: ['luts', 'looks'],
  };
}

// ─── GLSL Shader Generation ─────────────────────────────────────────────────

/**
 * Generate a GLSL shader snippet that performs a color space transform.
 * This produces a `vec3 ocioTransform(vec3 rgb)` function.
 */
function generateGLSL(processor: ColorProcessor): string {
  const lines: string[] = [];
  lines.push('// OCIO-generated color transform shader');
  lines.push(`// Source: ${processor.sourceSpace} -> Dest: ${processor.destSpace}`);
  lines.push('');
  lines.push('uniform sampler2D ocio_lut1d_tex;');
  lines.push('uniform sampler3D ocio_lut3d_tex;');
  lines.push('');

  // Emit helper functions
  lines.push('float ocio_lin_to_srgb(float x) {');
  lines.push('  return (x <= 0.0031308) ? x * 12.92 : 1.055 * pow(x, 1.0 / 2.4) - 0.055;');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_srgb_to_lin(float x) {');
  lines.push('  return (x <= 0.04045) ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4);');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_lin_to_rec709(float x) {');
  lines.push('  return (x < 0.018) ? x * 4.5 : 1.099 * pow(x, 0.45) - 0.099;');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_rec709_to_lin(float x) {');
  lines.push('  return (x < 0.081) ? x / 4.5 : pow((x + 0.099) / 1.099, 1.0 / 0.45);');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_lin_to_acescc(float x) {');
  lines.push('  if (x <= 0.0) return -0.3584474886;');
  lines.push('  if (x < 2.0e-16) return (log2(2.0e-16 * 0.5) + 9.72) / 17.52;');
  lines.push('  return (log2(x) + 9.72) / 17.52;');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_acescc_to_lin(float x) {');
  lines.push('  if (x < -0.3013698630) return (pow(2.0, x * 17.52 - 9.72) - pow(2.0, -16.0)) * 2.0;');
  lines.push('  return pow(2.0, x * 17.52 - 9.72);');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_lin_to_acescct(float x) {');
  lines.push('  float CUT = 0.0078125;');
  lines.push('  if (x <= CUT) return 10.5402377416545 * x + 0.0729055341958355;');
  lines.push('  return (log2(x) + 9.72) / 17.52;');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_acescct_to_lin(float x) {');
  lines.push('  float CUT_Y = 0.155251141552511;');
  lines.push('  if (x <= CUT_Y) return (x - 0.0729055341958355) / 10.5402377416545;');
  lines.push('  return pow(2.0, x * 17.52 - 9.72);');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_lin_to_logc(float x) {');
  lines.push('  float CUT = 0.010591;');
  lines.push('  if (x > CUT) return 0.247190 * log(5.555556 * x + 0.052272) / log(10.0) + 0.385537;');
  lines.push('  return 5.367655 * x + 0.092809;');
  lines.push('}');
  lines.push('');
  lines.push('float ocio_logc_to_lin(float x) {');
  lines.push('  float CUT_Y = 0.149658;');
  lines.push('  if (x > CUT_Y) return (pow(10.0, (x - 0.385537) / 0.247190) - 0.052272) / 5.555556;');
  lines.push('  return (x - 0.092809) / 5.367655;');
  lines.push('}');
  lines.push('');

  // Main transform function
  lines.push('vec3 ocioTransform(vec3 rgb) {');

  let stepIdx = 0;
  for (const t of processor.getTransforms()) {
    lines.push(`  // Step ${stepIdx++}: ${t.type} (${t.direction})`);

    switch (t.type) {
      case 'MatrixTransform': {
        const m = t.matrix;
        if (m.length === 9) {
          const mat = m as Mat3;
          lines.push(`  rgb = mat3(`);
          lines.push(`    ${mat[0]}, ${mat[3]}, ${mat[6]},`);
          lines.push(`    ${mat[1]}, ${mat[4]}, ${mat[7]},`);
          lines.push(`    ${mat[2]}, ${mat[5]}, ${mat[8]}`);
          lines.push(`  ) * rgb;`);
        }
        if (t.offset) {
          lines.push(`  rgb += vec3(${t.offset[0]}, ${t.offset[1]}, ${t.offset[2]});`);
        }
        break;
      }
      case 'LogTransform': {
        const fwd = t.direction === 'forward';
        switch (t.logStyle) {
          case 'ACEScc':
            if (fwd) {
              lines.push('  rgb = vec3(ocio_lin_to_acescc(rgb.r), ocio_lin_to_acescc(rgb.g), ocio_lin_to_acescc(rgb.b));');
            } else {
              lines.push('  rgb = vec3(ocio_acescc_to_lin(rgb.r), ocio_acescc_to_lin(rgb.g), ocio_acescc_to_lin(rgb.b));');
            }
            break;
          case 'ACEScct':
            if (fwd) {
              lines.push('  rgb = vec3(ocio_lin_to_acescct(rgb.r), ocio_lin_to_acescct(rgb.g), ocio_lin_to_acescct(rgb.b));');
            } else {
              lines.push('  rgb = vec3(ocio_acescct_to_lin(rgb.r), ocio_acescct_to_lin(rgb.g), ocio_acescct_to_lin(rgb.b));');
            }
            break;
          case 'LogC':
            if (fwd) {
              lines.push('  rgb = vec3(ocio_lin_to_logc(rgb.r), ocio_lin_to_logc(rgb.g), ocio_lin_to_logc(rgb.b));');
            } else {
              lines.push('  rgb = vec3(ocio_logc_to_lin(rgb.r), ocio_logc_to_lin(rgb.g), ocio_logc_to_lin(rgb.b));');
            }
            break;
          default:
            lines.push(`  // Unsupported log style: ${t.logStyle} -- passthrough`);
            break;
        }
        break;
      }
      case 'SRGBTransform':
        if (t.direction === 'forward') {
          lines.push('  rgb = vec3(ocio_lin_to_srgb(rgb.r), ocio_lin_to_srgb(rgb.g), ocio_lin_to_srgb(rgb.b));');
        } else {
          lines.push('  rgb = vec3(ocio_srgb_to_lin(rgb.r), ocio_srgb_to_lin(rgb.g), ocio_srgb_to_lin(rgb.b));');
        }
        break;
      case 'Rec709Transform':
        if (t.direction === 'forward') {
          lines.push('  rgb = vec3(ocio_lin_to_rec709(rgb.r), ocio_lin_to_rec709(rgb.g), ocio_lin_to_rec709(rgb.b));');
        } else {
          lines.push('  rgb = vec3(ocio_rec709_to_lin(rgb.r), ocio_rec709_to_lin(rgb.g), ocio_rec709_to_lin(rgb.b));');
        }
        break;
      case 'CDLTransform': {
        const s = t.slope;
        const o = t.offset;
        const p = t.power;
        if (t.direction === 'forward') {
          lines.push(`  rgb = clamp(rgb * vec3(${s[0]}, ${s[1]}, ${s[2]}) + vec3(${o[0]}, ${o[1]}, ${o[2]}), 0.0, 1.0);`);
          lines.push(`  rgb = pow(rgb, vec3(${p[0]}, ${p[1]}, ${p[2]}));`);
          if (t.saturation !== 1.0) {
            lines.push(`  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));`);
            lines.push(`  rgb = vec3(luma) + ${t.saturation} * (rgb - vec3(luma));`);
          }
        } else {
          lines.push(`  // Inverse CDL`);
          if (t.saturation !== 1.0) {
            const invSat = 1.0 / t.saturation;
            lines.push(`  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));`);
            lines.push(`  rgb = vec3(luma) + ${invSat} * (rgb - vec3(luma));`);
          }
          lines.push(`  rgb = pow(max(rgb, vec3(0.0)), vec3(${1.0 / p[0]}, ${1.0 / p[1]}, ${1.0 / p[2]}));`);
          lines.push(`  rgb = (rgb - vec3(${o[0]}, ${o[1]}, ${o[2]})) / vec3(${s[0]}, ${s[1]}, ${s[2]});`);
        }
        break;
      }
      case 'ExponentTransform': {
        const e = t.value;
        if (t.direction === 'forward') {
          lines.push(`  rgb = pow(max(rgb, vec3(0.0)), vec3(${e[0]}, ${e[1]}, ${e[2]}));`);
        } else {
          lines.push(`  rgb = pow(max(rgb, vec3(0.0)), vec3(${1.0 / e[0]}, ${1.0 / e[1]}, ${1.0 / e[2]}));`);
        }
        break;
      }
      case 'FileTransform':
        if (t.src.includes('3d') || t.src.endsWith('.cube')) {
          lines.push(`  rgb = texture(ocio_lut3d_tex, rgb).rgb; // ${t.src}`);
        } else {
          lines.push(`  rgb.r = texture(ocio_lut1d_tex, vec2(rgb.r, 0.5)).r; // ${t.src}`);
          lines.push(`  rgb.g = texture(ocio_lut1d_tex, vec2(rgb.g, 0.5)).g;`);
          lines.push(`  rgb.b = texture(ocio_lut1d_tex, vec2(rgb.b, 0.5)).b;`);
        }
        break;
    }
  }

  lines.push('  return rgb;');
  lines.push('}');

  return lines.join('\n');
}

// ─── OCIOEngine Class ───────────────────────────────────────────────────────

/** Callback type for OCIO engine state changes. */
export type OCIOSubscriber = () => void;

/**
 * OpenColorIO color management engine.
 *
 * Provides a full ACES 1.2-compatible color pipeline with:
 * - Named color spaces with matrix, log, and curve transforms
 * - Display / View management for monitor output
 * - Creative looks (CDL, LUT)
 * - GPU shader generation (GLSL)
 * - .cube LUT parsing and application
 * - Color processor caching
 */
export class OCIOEngine {
  private config: OCIOConfig;
  private configPath: string = '';
  private processorCache: Map<string, ColorProcessor> = new Map();
  private lutCache: Map<string, LUT1D | LUT3D> = new Map();
  private subscribers = new Set<OCIOSubscriber>();

  constructor(config?: OCIOConfig) {
    this.config = config ?? buildACESConfig();
  }

  // ── Configuration Management ──────────────────────────────────────────

  /** Get the current OCIO configuration. */
  getConfig(): OCIOConfig {
    return this.config;
  }

  /** Set a new OCIO configuration, clearing all caches. */
  setConfig(config: OCIOConfig): void {
    this.config = config;
    this.processorCache.clear();
    this.notify();
  }

  /** Get the current config file path. */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Set the config file path (for environment variable resolution).
   * Does not load the file; use `setConfig()` to supply a parsed config.
   */
  setConfigPath(path: string): void {
    this.configPath = path;
  }

  /** Reset to the built-in ACES 1.2 config. */
  resetToDefault(): void {
    this.config = buildACESConfig();
    this.processorCache.clear();
    this.notify();
  }

  // ── Color Space Queries ───────────────────────────────────────────────

  /** Get all color space names. */
  getColorSpaceNames(): string[] {
    return this.config.colorSpaces.map((cs) => cs.name);
  }

  /** Get a color space definition by name. */
  getColorSpace(name: string): ColorSpace | undefined {
    return this.config.colorSpaces.find((cs) => cs.name === name);
  }

  /** Get color spaces filtered by family (e.g. 'ACES', 'Camera', 'Display'). */
  getColorSpacesByFamily(family: string): ColorSpace[] {
    return this.config.colorSpaces.filter((cs) => cs.family === family);
  }

  /** Get color spaces filtered by encoding type. */
  getColorSpacesByEncoding(encoding: ColorSpace['encoding']): ColorSpace[] {
    return this.config.colorSpaces.filter((cs) => cs.encoding === encoding);
  }

  /** Get all unique color space families. */
  getFamilies(): string[] {
    const families = new Set<string>();
    for (const cs of this.config.colorSpaces) {
      families.add(cs.family);
    }
    return Array.from(families).sort();
  }

  /** Resolve a role name to its color space name. */
  resolveRole(role: keyof Roles): string {
    return this.config.roles[role];
  }

  /** Get the color space for a file path based on file rules. */
  getColorSpaceForFile(filePath: string): string {
    const sortedRules = [...this.config.fileRules].sort((a, b) => b.priority - a.priority);
    const fileName = filePath.split('/').pop() ?? filePath;

    for (const rule of sortedRules) {
      if (matchGlob(fileName, rule.pattern)) {
        return rule.colorSpace;
      }
    }

    return this.config.roles.default_input;
  }

  // ── Display / View Queries ────────────────────────────────────────────

  /** Get all display device names. */
  getDisplayNames(): string[] {
    return this.config.displays.map((d) => d.name);
  }

  /** Get all view names for a display. */
  getViewNames(displayName: string): string[] {
    const display = this.config.displays.find((d) => d.name === displayName);
    return display ? display.views.map((v) => v.name) : [];
  }

  /** Get the default display name. */
  getDefaultDisplay(): string {
    return this.config.defaultDisplay;
  }

  /** Get the default view name. */
  getDefaultView(): string {
    return this.config.defaultView;
  }

  /** Get the display transform for viewing (color space + optional look). */
  getDisplayTransform(
    inputColorSpace: string,
    displayName: string,
    viewName: string,
  ): ColorProcessor | null {
    const display = this.config.displays.find((d) => d.name === displayName);
    if (!display) {
      console.warn(`[OCIOEngine] Display not found: ${displayName}`);
      return null;
    }
    const view = display.views.find((v) => v.name === viewName);
    if (!view) {
      console.warn(`[OCIOEngine] View not found: ${viewName} on ${displayName}`);
      return null;
    }

    const cacheKey = `display:${inputColorSpace}:${displayName}:${viewName}`;
    const cached = this.processorCache.get(cacheKey);
    if (cached) return cached;

    const transforms = this.buildTransformChain(inputColorSpace, view.colorSpace);

    // Apply look if specified
    if (view.looks) {
      const lookTransforms = this.getLookTransforms(view.looks);
      if (lookTransforms) {
        transforms.push(...lookTransforms);
      }
    }

    const processor = new ColorProcessor(inputColorSpace, view.colorSpace, transforms);
    this.processorCache.set(cacheKey, processor);
    return processor;
  }

  // ── Look Queries ──────────────────────────────────────────────────────

  /** Get all look names. */
  getLookNames(): string[] {
    return this.config.looks.map((l) => l.name);
  }

  /** Get a look definition by name. */
  getLook(name: string): Look | undefined {
    return this.config.looks.find((l) => l.name === name);
  }

  /** Get the transforms for a named look. */
  private getLookTransforms(lookName: string): OCIOTransform[] | null {
    const look = this.config.looks.find((l) => l.name === lookName);
    if (!look) return null;

    const transforms: OCIOTransform[] = [];

    // Convert to process space
    const toProcess = this.buildTransformChain(this.config.roles.reference, look.processSpace);
    transforms.push(...toProcess);

    // Apply look
    transforms.push(...look.transform);

    // Convert back from process space
    const fromProcess = this.buildTransformChain(look.processSpace, this.config.roles.reference);
    transforms.push(...fromProcess);

    return transforms;
  }

  // ── Core Transform Pipeline ───────────────────────────────────────────

  /**
   * Get a cached color processor for a source-to-destination transform.
   * Builds the transform chain: source -> reference -> destination.
   */
  getProcessor(sourceSpace: string, destSpace: string): ColorProcessor | null {
    if (sourceSpace === destSpace) {
      return new ColorProcessor(sourceSpace, destSpace, []);
    }

    const cacheKey = `${sourceSpace}->${destSpace}`;
    const cached = this.processorCache.get(cacheKey);
    if (cached) return cached;

    const transforms = this.buildTransformChain(sourceSpace, destSpace);
    const processor = new ColorProcessor(sourceSpace, destSpace, transforms);
    this.processorCache.set(cacheKey, processor);
    return processor;
  }

  /**
   * Transform a single RGB color from one space to another.
   * @param rgb   The input color as [R, G, B].
   * @param sourceSpace Source color space name.
   * @param destSpace   Destination color space name.
   * @returns The transformed color as [R, G, B].
   */
  transformColor(rgb: Vec3, sourceSpace: string, destSpace: string): Vec3 {
    if (sourceSpace === destSpace) return [rgb[0], rgb[1], rgb[2]];

    const srcCS = this.getColorSpace(sourceSpace);
    const dstCS = this.getColorSpace(destSpace);
    if (srcCS?.isData || dstCS?.isData) return [rgb[0], rgb[1], rgb[2]];

    const processor = this.getProcessor(sourceSpace, destSpace);
    if (!processor) {
      console.warn(`[OCIOEngine] Cannot build processor: ${sourceSpace} -> ${destSpace}`);
      return rgb;
    }
    return processor.apply(rgb);
  }

  /**
   * Transform an entire ImageData buffer from one color space to another.
   * Operates on 8-bit RGBA ImageData (values 0-255), normalizing internally.
   */
  transformImage(imageData: ImageData, sourceSpace: string, destSpace: string): ImageData {
    if (sourceSpace === destSpace) return imageData;

    const srcCS = this.getColorSpace(sourceSpace);
    const dstCS = this.getColorSpace(destSpace);
    if (srcCS?.isData || dstCS?.isData) return imageData;

    const processor = this.getProcessor(sourceSpace, destSpace);
    if (!processor) {
      console.warn(`[OCIOEngine] Cannot build processor: ${sourceSpace} -> ${destSpace}`);
      return imageData;
    }

    const data = imageData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const rgb: Vec3 = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
      const result = processor.apply(rgb);
      data[i] = clamp(Math.round(result[0] * 255), 0, 255);
      data[i + 1] = clamp(Math.round(result[1] * 255), 0, 255);
      data[i + 2] = clamp(Math.round(result[2] * 255), 0, 255);
      // Alpha channel left untouched
    }
    return imageData;
  }

  /**
   * Apply a named look to an image, processing in the look's process space.
   * The image is assumed to be in the scene-reference space (ACES2065-1).
   */
  applyLook(imageData: ImageData, lookName: string): ImageData {
    const look = this.getLook(lookName);
    if (!look) {
      console.warn(`[OCIOEngine] Look not found: ${lookName}`);
      return imageData;
    }
    if (look.transform.length === 0) return imageData;

    const refSpace = this.config.roles.reference;
    const data = imageData.data;
    const len = data.length;

    // Build transform chain: ref -> processSpace, apply look, processSpace -> ref
    const toProcess = this.buildTransformChain(refSpace, look.processSpace);
    const fromProcess = this.buildTransformChain(look.processSpace, refSpace);

    for (let i = 0; i < len; i += 4) {
      let rgb: Vec3 = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];

      // To process space
      for (const t of toProcess) {
        rgb = ColorProcessor.applyTransform(rgb, t);
      }

      // Apply look transforms
      for (const t of look.transform) {
        rgb = ColorProcessor.applyTransform(rgb, t);
      }

      // Back to reference
      for (const t of fromProcess) {
        rgb = ColorProcessor.applyTransform(rgb, t);
      }

      data[i] = clamp(Math.round(rgb[0] * 255), 0, 255);
      data[i + 1] = clamp(Math.round(rgb[1] * 255), 0, 255);
      data[i + 2] = clamp(Math.round(rgb[2] * 255), 0, 255);
    }

    return imageData;
  }

  // ── GPU Shader Generation ─────────────────────────────────────────────

  /**
   * Generate GLSL shader code for a color space transform.
   * Returns a complete `vec3 ocioTransform(vec3 rgb)` function with all
   * necessary helpers for the given source -> destination pipeline.
   */
  getShaderText(sourceSpace: string, destSpace: string): string {
    const processor = this.getProcessor(sourceSpace, destSpace);
    if (!processor) {
      return [
        '// OCIO passthrough (no transform available)',
        'vec3 ocioTransform(vec3 rgb) { return rgb; }',
      ].join('\n');
    }
    return generateGLSL(processor);
  }

  // ── LUT Management ────────────────────────────────────────────────────

  /** Register a parsed LUT for use in file transforms. */
  registerLUT(name: string, lut: LUT1D | LUT3D): void {
    this.lutCache.set(name, lut);
  }

  /** Parse and register a .cube LUT from text content. */
  loadCubeLUT(name: string, cubeText: string): LUT1D | LUT3D | null {
    const lut = parseCubeLUT(cubeText);
    if (lut) {
      this.lutCache.set(name, lut);
    }
    return lut;
  }

  /** Get a registered LUT by name. */
  getLUT(name: string): LUT1D | LUT3D | undefined {
    return this.lutCache.get(name);
  }

  /** Get all registered LUT names. */
  getLUTNames(): string[] {
    return Array.from(this.lutCache.keys());
  }

  /**
   * Apply a named LUT to an image.
   * The input is expected to be in the domain the LUT was designed for.
   */
  applyLUT(imageData: ImageData, lutName: string): ImageData {
    const lut = this.lutCache.get(lutName);
    if (!lut) {
      console.warn(`[OCIOEngine] LUT not found: ${lutName}`);
      return imageData;
    }

    const data = imageData.data;
    const len = data.length;

    for (let i = 0; i < len; i += 4) {
      const rgb: Vec3 = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
      let result: Vec3;

      if (lut.type === '1D') {
        result = apply1DLUT(lut, rgb);
      } else {
        result = apply3DLUT(lut, rgb);
      }

      data[i] = clamp(Math.round(result[0] * 255), 0, 255);
      data[i + 1] = clamp(Math.round(result[1] * 255), 0, 255);
      data[i + 2] = clamp(Math.round(result[2] * 255), 0, 255);
    }

    return imageData;
  }

  /**
   * Generate a GPU texture from a named LUT.
   * Returns null if the LUT is not found.
   */
  generateLUTTexture(lutName: string): LUTTexture | null {
    const lut = this.lutCache.get(lutName);
    if (!lut) return null;
    return lut.type === '1D' ? generate1DLUTTexture(lut) : generate3DLUTTexture(lut);
  }

  // ── Custom Color Space Registration ───────────────────────────────────

  /** Register a new color space in the config. */
  addColorSpace(cs: ColorSpace): void {
    const existing = this.config.colorSpaces.findIndex((c) => c.name === cs.name);
    if (existing >= 0) {
      this.config.colorSpaces[existing] = cs;
    } else {
      this.config.colorSpaces.push(cs);
    }
    this.processorCache.clear();
    this.notify();
  }

  /** Remove a color space from the config. */
  removeColorSpace(name: string): void {
    this.config.colorSpaces = this.config.colorSpaces.filter((cs) => cs.name !== name);
    this.processorCache.clear();
    this.notify();
  }

  /** Add a creative look to the config. */
  addLook(look: Look): void {
    const existing = this.config.looks.findIndex((l) => l.name === look.name);
    if (existing >= 0) {
      this.config.looks[existing] = look;
    } else {
      this.config.looks.push(look);
    }
    this.processorCache.clear();
    this.notify();
  }

  /** Remove a look from the config. */
  removeLook(name: string): void {
    this.config.looks = this.config.looks.filter((l) => l.name !== name);
    this.processorCache.clear();
    this.notify();
  }

  /** Add a file rule. */
  addFileRule(rule: FileRule): void {
    this.config.fileRules.push(rule);
    this.config.fileRules.sort((a, b) => b.priority - a.priority);
  }

  // ── Subscription ──────────────────────────────────────────────────────

  /** Subscribe to engine state changes. Returns an unsubscribe function. */
  subscribe(cb: OCIOSubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Notify all subscribers. */
  private notify(): void {
    this.subscribers.forEach((cb) => cb());
  }

  // ── Internal: Transform Chain Builder ─────────────────────────────────

  /**
   * Build the full transform chain from source to destination.
   * Route: source -> (toReference) -> reference -> (fromReference) -> dest
   */
  private buildTransformChain(source: string, dest: string): OCIOTransform[] {
    if (source === dest) return [];

    const srcCS = this.getColorSpace(source);
    const dstCS = this.getColorSpace(dest);

    if (!srcCS) {
      console.warn(`[OCIOEngine] Unknown source color space: ${source}`);
      return [];
    }
    if (!dstCS) {
      console.warn(`[OCIOEngine] Unknown destination color space: ${dest}`);
      return [];
    }

    const transforms: OCIOTransform[] = [];

    // Source -> Reference (ACES2065-1)
    if (srcCS.toReference.length > 0) {
      transforms.push(...srcCS.toReference);
    }

    // Reference -> Destination
    if (dstCS.fromReference.length > 0) {
      transforms.push(...dstCS.fromReference);
    }

    return transforms;
  }
}

// ─── Glob Matching Utility ──────────────────────────────────────────────────

/** Simple glob pattern matcher supporting * and ? wildcards. */
function matchGlob(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`, 'i').test(str);
}

// ─── Singleton & Exports ────────────────────────────────────────────────────

/** Singleton OCIO engine instance with built-in ACES 1.2 configuration. */
export const ocioEngine = new OCIOEngine();

// Re-export math utilities for external use
export {
  mulMat3Vec3,
  mulMat3,
  invertMat3,
  identityMat3,
  mulMat4Vec3,
  mulMat4,
  identityMat4,
  mat4FromMat3,
  clamp,
  lerp,
  linearToACEScc,
  acesccToLinear,
  linearToACEScct,
  acescctToLinear,
  linearToLogC,
  logCToLinear,
  linearToSLog3,
  slog3ToLinear,
  linearToVLog,
  vlogToLinear,
  linearToRedLog,
  redLogToLinear,
  linearToSRGB,
  srgbToLinear,
  linearToRec709,
  rec709ToLinear,
};
