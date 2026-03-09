// =============================================================================
//  THE AVID -- Color Space Transform Shaders & Pipeline
// =============================================================================
// WGSL compute shaders for GPU-accelerated color space conversions and a
// CPU-fallback ColorTransformPipeline class. Implements ITU standard matrices,
// gamma transfer functions, and HDR PQ/HLG EOTF/OETFs.

// ─── Color Space Identifiers ────────────────────────────────────────────────

/**
 * Supported color space identifiers.
 *
 *   - 'rec709'       Rec. BT.709 (HD television, sRGB primaries)
 *   - 'rec2020'      Rec. BT.2020 (UHD / Wide Color Gamut)
 *   - 'dci-p3'       DCI-P3 (digital cinema)
 *   - 'aces-linear'  ACES AP0 linear (Academy Color Encoding System)
 *   - 'aces-cct'     ACEScct log encoding
 *   - 'srgb'         sRGB (same primaries as Rec.709, sRGB OETF gamma)
 */
export type ColorSpaceId = 'rec709' | 'rec2020' | 'dci-p3' | 'aces-linear' | 'aces-cct' | 'srgb';

// ─── ITU Matrix Constants ───────────────────────────────────────────────────
// All matrices are 3x3 in row-major order.
// Source: ITU-R BT.709, ITU-R BT.2020, SMPTE RP 431-2, ACES TB-2014-004.

/** Rec.709 to Rec.2020 color matrix (linear light). */
const MAT_709_TO_2020: number[] = [
  0.6274040,  0.3292820,  0.0433136,
  0.0690970,  0.9195400,  0.0113612,
  0.0163916,  0.0880132,  0.8955950,
];

/** Rec.2020 to Rec.709 color matrix (linear light). */
const MAT_2020_TO_709: number[] = [
  1.6604910, -0.5876411, -0.0728499,
 -0.1245505,  1.1328999, -0.0083494,
 -0.0181508, -0.1005789,  1.1187297,
];

/** Rec.709 to DCI-P3 color matrix (linear light). */
const MAT_709_TO_P3: number[] = [
  0.8224622,  0.1775378,  0.0000000,
  0.0331942,  0.9668058,  0.0000000,
  0.0170826,  0.0723974,  0.9105200,
];

/** DCI-P3 to Rec.709 color matrix (linear light). */
const MAT_P3_TO_709: number[] = [
  1.2249402, -0.2249402,  0.0000000,
 -0.0420569,  1.0420569,  0.0000000,
 -0.0196376, -0.0786361,  1.0982737,
];

/** Rec.709 to ACES AP0 color matrix (linear light). */
const MAT_709_TO_AP0: number[] = [
  0.4339316,  0.3762524,  0.1898160,
  0.0888017,  0.8124381,  0.0987601,
  0.0175412,  0.1115475,  0.8709112,
];

/** ACES AP0 to Rec.709 color matrix (linear light). */
const MAT_AP0_TO_709: number[] = [
  2.5216494, -1.1340372, -0.3876122,
 -0.2752135,  1.3697051, -0.0944916,
 -0.0159345, -0.1478039,  1.1637384,
];

// ─── Transfer Function Constants ────────────────────────────────────────────

/** sRGB OETF constants (IEC 61966-2-1). */
const SRGB_THRESHOLD = 0.0031308;
const SRGB_LINEAR_SCALE = 12.92;
const SRGB_POWER = 1.0 / 2.4;
const SRGB_A = 0.055;

/** sRGB EOTF (inverse) constants. */
const SRGB_INV_THRESHOLD = 0.04045;

/** ACEScct constants (S-2016-001). */
const ACESCCT_MIN_LIN = 0.0078125;   // 2^(-7)
const ACESCCT_CUT = 0.155251141552511;
const ACESCCT_A = 10.5402377416545;
const ACESCCT_B = 0.0729055341958355;

/** PQ (SMPTE ST 2084) constants. */
const PQ_M1 = 2610.0 / 16384.0;                  // 0.1593017578125
const PQ_M2 = 2523.0 / 4096.0 * 128.0;           // 78.84375
const PQ_C1 = 3424.0 / 4096.0;                    // 0.8359375
const PQ_C2 = 2413.0 / 4096.0 * 32.0;             // 18.8515625
const PQ_C3 = 2392.0 / 4096.0 * 32.0;             // 18.6875

/** HLG (ARIB STD-B67) constants. */
const HLG_A = 0.17883277;
const HLG_B = 1 - 4 * HLG_A;                     // 0.28466892
const HLG_C = 0.5 - HLG_A * Math.log(4 * HLG_A); // ~0.55991073

// ─── WGSL Shader Strings ────────────────────────────────────────────────────

/**
 * WGSL compute shader: Rec.709 <-> Rec.2020 color matrix transform.
 *
 * Uniform params:
 *   direction: u32 — 0 = 709->2020, 1 = 2020->709
 */
export const rec709ToRec2020Shader = /* wgsl */ `
struct TransformParams {
  direction: u32,   // 0 = 709->2020, 1 = 2020->709
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

// Rec.709 -> Rec.2020
const m709to2020 = mat3x3f(
  0.6274040,  0.3292820,  0.0433136,
  0.0690970,  0.9195400,  0.0113612,
  0.0163916,  0.0880132,  0.8955950,
);

// Rec.2020 -> Rec.709
const m2020to709 = mat3x3f(
  1.6604910, -0.5876411, -0.0728499,
 -0.1245505,  1.1328999, -0.0083494,
 -0.0181508, -0.1005789,  1.1187297,
);

fn linearize_srgb(v: f32) -> f32 {
  if (v <= 0.04045) { return v / 12.92; }
  return pow((v + 0.055) / 1.055, 2.4);
}

fn gamma_srgb(v: f32) -> f32 {
  if (v <= 0.0031308) { return v * 12.92; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  // Linearize from sRGB gamma
  var lin = vec3f(
    linearize_srgb(pixel.r),
    linearize_srgb(pixel.g),
    linearize_srgb(pixel.b),
  );

  // Apply matrix
  var out: vec3f;
  if (params.direction == 0u) {
    out = m709to2020 * lin;
  } else {
    out = m2020to709 * lin;
  }

  // Re-apply sRGB gamma (for preview)
  out = vec3f(gamma_srgb(out.x), gamma_srgb(out.y), gamma_srgb(out.z));
  out = clamp(out, vec3f(0.0), vec3f(1.0));

  textureStore(output_texture, vec2i(gid.xy), vec4f(out, pixel.a));
}
`;

/**
 * WGSL compute shader: Rec.709 <-> DCI-P3 color matrix transform.
 */
export const rec709ToDciP3Shader = /* wgsl */ `
struct TransformParams {
  direction: u32,   // 0 = 709->P3, 1 = P3->709
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

const m709toP3 = mat3x3f(
  0.8224622,  0.1775378,  0.0000000,
  0.0331942,  0.9668058,  0.0000000,
  0.0170826,  0.0723974,  0.9105200,
);

const mP3to709 = mat3x3f(
  1.2249402, -0.2249402,  0.0000000,
 -0.0420569,  1.0420569,  0.0000000,
 -0.0196376, -0.0786361,  1.0982737,
);

fn linearize_srgb(v: f32) -> f32 {
  if (v <= 0.04045) { return v / 12.92; }
  return pow((v + 0.055) / 1.055, 2.4);
}

fn gamma_srgb(v: f32) -> f32 {
  if (v <= 0.0031308) { return v * 12.92; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  var lin = vec3f(
    linearize_srgb(pixel.r),
    linearize_srgb(pixel.g),
    linearize_srgb(pixel.b),
  );

  var out: vec3f;
  if (params.direction == 0u) {
    out = m709toP3 * lin;
  } else {
    out = mP3to709 * lin;
  }

  out = vec3f(gamma_srgb(out.x), gamma_srgb(out.y), gamma_srgb(out.z));
  out = clamp(out, vec3f(0.0), vec3f(1.0));

  textureStore(output_texture, vec2i(gid.xy), vec4f(out, pixel.a));
}
`;

/**
 * WGSL compute shader: sRGB linearize / gamma encode.
 */
export const srgbGammaShader = /* wgsl */ `
struct TransformParams {
  direction: u32,   // 0 = encode (linear->sRGB), 1 = decode (sRGB->linear)
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

fn linearize_srgb(v: f32) -> f32 {
  if (v <= 0.04045) { return v / 12.92; }
  return pow((v + 0.055) / 1.055, 2.4);
}

fn gamma_srgb(v: f32) -> f32 {
  if (v <= 0.0031308) { return v * 12.92; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var out: vec3f;

  if (params.direction == 0u) {
    // Linear -> sRGB
    out = vec3f(gamma_srgb(pixel.r), gamma_srgb(pixel.g), gamma_srgb(pixel.b));
  } else {
    // sRGB -> Linear
    out = vec3f(linearize_srgb(pixel.r), linearize_srgb(pixel.g), linearize_srgb(pixel.b));
  }

  out = clamp(out, vec3f(0.0), vec3f(1.0));
  textureStore(output_texture, vec2i(gid.xy), vec4f(out, pixel.a));
}
`;

/**
 * WGSL compute shader: PQ EOTF (ST 2084) for HDR10 content.
 */
export const pqEotfShader = /* wgsl */ `
struct TransformParams {
  direction: u32,   // 0 = PQ->linear (EOTF), 1 = linear->PQ (inverse EOTF)
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

const m1: f32 = 0.1593017578125;
const m2: f32 = 78.84375;
const c1: f32 = 0.8359375;
const c2: f32 = 18.8515625;
const c3: f32 = 18.6875;

fn pq_eotf(v: f32) -> f32 {
  let vp = pow(max(v, 0.0), 1.0 / m2);
  let num = max(vp - c1, 0.0);
  let den = c2 - c3 * vp;
  return pow(num / max(den, 1e-10), 1.0 / m1);
}

fn pq_inv_eotf(v: f32) -> f32 {
  let vp = pow(max(v, 0.0), m1);
  let num = c1 + c2 * vp;
  let den = 1.0 + c3 * vp;
  return pow(num / den, m2);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var out: vec3f;

  if (params.direction == 0u) {
    out = vec3f(pq_eotf(pixel.r), pq_eotf(pixel.g), pq_eotf(pixel.b));
  } else {
    out = vec3f(pq_inv_eotf(pixel.r), pq_inv_eotf(pixel.g), pq_inv_eotf(pixel.b));
  }

  out = clamp(out, vec3f(0.0), vec3f(1.0));
  textureStore(output_texture, vec2i(gid.xy), vec4f(out, pixel.a));
}
`;

/**
 * WGSL compute shader: HLG OETF/EOTF (ARIB STD-B67).
 */
export const hlgShader = /* wgsl */ `
struct TransformParams {
  direction: u32,   // 0 = HLG OETF (linear->HLG), 1 = HLG EOTF (HLG->linear)
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

const hlg_a: f32 = 0.17883277;
const hlg_b: f32 = 0.28466892;
const hlg_c: f32 = 0.55991073;

fn hlg_oetf(v: f32) -> f32 {
  if (v <= 1.0 / 12.0) {
    return sqrt(3.0 * v);
  }
  return hlg_a * log(12.0 * v - hlg_b) + hlg_c;
}

fn hlg_eotf(v: f32) -> f32 {
  if (v <= 0.5) {
    return (v * v) / 3.0;
  }
  return (exp((v - hlg_c) / hlg_a) + hlg_b) / 12.0;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var out: vec3f;

  if (params.direction == 0u) {
    out = vec3f(hlg_oetf(pixel.r), hlg_oetf(pixel.g), hlg_oetf(pixel.b));
  } else {
    out = vec3f(hlg_eotf(pixel.r), hlg_eotf(pixel.g), hlg_eotf(pixel.b));
  }

  out = clamp(out, vec3f(0.0), vec3f(1.0));
  textureStore(output_texture, vec2i(gid.xy), vec4f(out, pixel.a));
}
`;

/**
 * WGSL compute shader: ACEScct log encoding.
 */
export const acesCctShader = /* wgsl */ `
struct TransformParams {
  direction: u32,   // 0 = linear->ACEScct, 1 = ACEScct->linear
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

const cut_lin: f32 = 0.0078125;
const cut_log: f32 = 0.155251141552511;
const a: f32 = 10.5402377416545;
const b: f32 = 0.0729055341958355;

fn acescct_encode(v: f32) -> f32 {
  if (v <= cut_lin) {
    return a * v + b;
  }
  return (log2(v) + 9.72) / 17.52;
}

fn acescct_decode(v: f32) -> f32 {
  if (v <= cut_log) {
    return (v - b) / a;
  }
  return pow(2.0, v * 17.52 - 9.72);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var out: vec3f;

  if (params.direction == 0u) {
    out = vec3f(acescct_encode(pixel.r), acescct_encode(pixel.g), acescct_encode(pixel.b));
  } else {
    out = vec3f(acescct_decode(pixel.r), acescct_decode(pixel.g), acescct_decode(pixel.b));
  }

  out = clamp(out, vec3f(0.0), vec3f(1.0));
  textureStore(output_texture, vec2i(gid.xy), vec4f(out, pixel.a));
}
`;

// ─── CPU Transfer Functions ─────────────────────────────────────────────────

/** Linearize an sRGB-encoded value to linear light. */
function srgbToLinear(v: number): number {
  if (v <= SRGB_INV_THRESHOLD) return v / SRGB_LINEAR_SCALE;
  return Math.pow((v + SRGB_A) / (1 + SRGB_A), 2.4);
}

/** Encode a linear-light value to sRGB gamma. */
function linearToSrgb(v: number): number {
  if (v <= SRGB_THRESHOLD) return v * SRGB_LINEAR_SCALE;
  return (1 + SRGB_A) * Math.pow(v, SRGB_POWER) - SRGB_A;
}

/** Encode a linear-light value to ACEScct. */
function linearToAcesCct(v: number): number {
  if (v <= ACESCCT_MIN_LIN) {
    return ACESCCT_A * v + ACESCCT_B;
  }
  return (Math.log2(v) + 9.72) / 17.52;
}

/** Decode an ACEScct value to linear light. */
function acesCctToLinear(v: number): number {
  if (v <= ACESCCT_CUT) {
    return (v - ACESCCT_B) / ACESCCT_A;
  }
  return Math.pow(2, v * 17.52 - 9.72);
}

/** PQ EOTF: decode PQ signal to linear light (SMPTE ST 2084). */
function pqEotf(v: number): number {
  const vp = Math.pow(Math.max(v, 0), 1.0 / PQ_M2);
  const num = Math.max(vp - PQ_C1, 0);
  const den = PQ_C2 - PQ_C3 * vp;
  return Math.pow(num / Math.max(den, 1e-10), 1.0 / PQ_M1);
}

/** Inverse PQ EOTF: encode linear light to PQ signal. */
function pqInvEotf(v: number): number {
  const vp = Math.pow(Math.max(v, 0), PQ_M1);
  const num = PQ_C1 + PQ_C2 * vp;
  const den = 1.0 + PQ_C3 * vp;
  return Math.pow(num / den, PQ_M2);
}

/** HLG OETF: encode linear scene light to HLG signal (ARIB STD-B67). */
function hlgOetf(v: number): number {
  if (v <= 1.0 / 12.0) {
    return Math.sqrt(3.0 * v);
  }
  return HLG_A * Math.log(12.0 * v - HLG_B) + HLG_C;
}

/** HLG EOTF: decode HLG signal to linear display light. */
function hlgEotf(v: number): number {
  if (v <= 0.5) {
    return (v * v) / 3.0;
  }
  return (Math.exp((v - HLG_C) / HLG_A) + HLG_B) / 12.0;
}

// ─── CPU Matrix Application ────────────────────────────────────────────────

/**
 * Apply a 3x3 row-major matrix to an [R, G, B] triplet.
 */
function applyMat3(m: number[], r: number, g: number, b: number): [number, number, number] {
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/**
 * Clamp a value to [0, 1].
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ─── Transform Route Resolution ────────────────────────────────────────────

/**
 * Resolve the transformation steps to convert between two color spaces.
 *
 * All transforms go through a linear Rec.709 hub:
 *   source -> linearize -> hub (Rec.709 linear) -> matrix -> target gamma
 *
 * Returns functions for:
 *   - Linearizing the source
 *   - Matrix transform (if any)
 *   - Encoding to target gamma
 */
interface TransformStep {
  linearize: (v: number) => number;
  matrix: number[] | null;
  encode: (v: number) => number;
}

function resolveTransformSteps(from: ColorSpaceId, to: ColorSpaceId): TransformStep {
  // Default: identity
  const identity = (v: number) => v;

  // Step 1: Linearize source
  let linearize: (v: number) => number = identity;
  switch (from) {
    case 'srgb':
    case 'rec709':
      linearize = srgbToLinear;
      break;
    case 'aces-cct':
      linearize = acesCctToLinear;
      break;
    case 'rec2020':
      linearize = srgbToLinear; // Rec.2020 uses a similar gamma for 8-bit content
      break;
    case 'dci-p3':
      linearize = srgbToLinear; // Display P3 uses sRGB TRC
      break;
    case 'aces-linear':
      linearize = identity;
      break;
  }

  // Step 2: Matrix transform from source gamut to target gamut (in linear light)
  let matrix: number[] | null = null;

  // Resolve source -> Rec.709 linear
  let toHub: number[] | null = null;
  switch (from) {
    case 'rec2020':
      toHub = MAT_2020_TO_709;
      break;
    case 'dci-p3':
      toHub = MAT_P3_TO_709;
      break;
    case 'aces-linear':
    case 'aces-cct':
      toHub = MAT_AP0_TO_709;
      break;
    default:
      toHub = null; // Already Rec.709
      break;
  }

  // Resolve Rec.709 linear -> target
  let fromHub: number[] | null = null;
  switch (to) {
    case 'rec2020':
      fromHub = MAT_709_TO_2020;
      break;
    case 'dci-p3':
      fromHub = MAT_709_TO_P3;
      break;
    case 'aces-linear':
    case 'aces-cct':
      fromHub = MAT_709_TO_AP0;
      break;
    default:
      fromHub = null; // Stay in Rec.709
      break;
  }

  // Compose matrices if both exist, or use whichever is non-null
  if (toHub && fromHub) {
    // Compose: fromHub * toHub (multiply 3x3 matrices)
    matrix = mat3Multiply(fromHub, toHub);
  } else if (toHub) {
    // Only need conversion TO hub, then hub IS target (709/srgb)
    // But actually if fromHub is null, we just need toHub
    // Wait: toHub goes source -> 709. fromHub goes 709 -> target.
    // If fromHub is null, target is 709/srgb, so just need toHub.
    matrix = toHub;
  } else if (fromHub) {
    // Source is already 709, just need fromHub to target
    matrix = fromHub;
  }

  // Step 3: Encode to target gamma
  let encode: (v: number) => number = identity;
  switch (to) {
    case 'srgb':
    case 'rec709':
      encode = linearToSrgb;
      break;
    case 'aces-cct':
      encode = linearToAcesCct;
      break;
    case 'rec2020':
      encode = linearToSrgb; // Rec.2020 8-bit uses similar gamma
      break;
    case 'dci-p3':
      encode = linearToSrgb; // Display P3 uses sRGB TRC
      break;
    case 'aces-linear':
      encode = identity;
      break;
  }

  return { linearize, matrix, encode };
}

/**
 * Multiply two 3x3 row-major matrices: result = A * B.
 */
function mat3Multiply(a: number[], b: number[]): number[] {
  const result = new Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      result[row * 3 + col] =
        a[row * 3 + 0] * b[0 * 3 + col] +
        a[row * 3 + 1] * b[1 * 3 + col] +
        a[row * 3 + 2] * b[2 * 3 + col];
    }
  }
  return result;
}

// =============================================================================
//  Color Transform Pipeline
// =============================================================================

/**
 * GPU-accelerated color space transform pipeline with CPU fallback.
 *
 * Initialises WebGPU if available for real-time color space conversions.
 * Falls back to CPU-based transforms when WebGPU is not supported.
 *
 * Supports conversions between Rec.709, Rec.2020, DCI-P3, ACES linear,
 * ACEScct, and sRGB color spaces.
 */
export class ColorTransformPipeline {
  private gpuAvailable = false;
  private device: GPUDevice | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initGPU();
  }

  /**
   * Attempt to initialise WebGPU for GPU-accelerated transforms.
   * Falls back silently to CPU if WebGPU is unavailable.
   */
  private async initGPU(): Promise<void> {
    try {
      if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
        console.info('[ColorTransformPipeline] WebGPU not available, using CPU fallback');
        return;
      }

      const adapter = await (navigator as unknown as { gpu: GPU }).gpu.requestAdapter({
        powerPreference: 'high-performance',
      });

      if (!adapter) {
        console.info('[ColorTransformPipeline] No GPU adapter, using CPU fallback');
        return;
      }

      this.device = await adapter.requestDevice({
        label: 'color-transform-pipeline',
      });

      this.device.lost.then((info) => {
        console.error(`[ColorTransformPipeline] GPU device lost: ${info.message}`);
        this.gpuAvailable = false;
        this.device = null;
      });

      this.gpuAvailable = true;
      console.info('[ColorTransformPipeline] GPU initialised for color transforms');
    } catch (err) {
      console.warn('[ColorTransformPipeline] GPU init failed, using CPU fallback:', err);
      this.gpuAvailable = false;
    }
  }

  /**
   * Whether GPU-accelerated transforms are available.
   */
  get isGPUAvailable(): boolean {
    return this.gpuAvailable;
  }

  /**
   * Wait for GPU initialisation to complete (if in progress).
   */
  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  /**
   * Transform a frame from one color space to another.
   *
   * Uses CPU-based transform with proper linearization, matrix conversion,
   * and gamma encoding. For real-time GPU processing, use the WGSL shaders
   * directly via the WebGPU pipeline.
   *
   * @param imageData  Source ImageData to transform.
   * @param from       Source color space identifier.
   * @param to         Target color space identifier.
   * @returns          New ImageData with transformed pixel values.
   *
   * @example
   * const sdrFrame = pipeline.transformFrame(hdrFrame, 'rec2020', 'rec709');
   */
  transformFrame(imageData: ImageData, from: ColorSpaceId, to: ColorSpaceId): ImageData {
    // Short-circuit if no conversion needed
    if (from === to) {
      return imageData;
    }

    const { width, height, data: srcData } = imageData;
    const result = new ImageData(width, height);
    const dstData = result.data;
    const pixelCount = width * height;

    const steps = resolveTransformSteps(from, to);

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;

      // Read and normalise to [0, 1]
      let r = srcData[offset] / 255;
      let g = srcData[offset + 1] / 255;
      let b = srcData[offset + 2] / 255;

      // Step 1: Linearize from source encoding
      r = steps.linearize(r);
      g = steps.linearize(g);
      b = steps.linearize(b);

      // Step 2: Apply gamut matrix (if any)
      if (steps.matrix) {
        const [nr, ng, nb] = applyMat3(steps.matrix, r, g, b);
        r = nr;
        g = ng;
        b = nb;
      }

      // Step 3: Encode to target gamma
      r = steps.encode(r);
      g = steps.encode(g);
      b = steps.encode(b);

      // Write output (clamped to 0-255)
      dstData[offset]     = Math.round(clamp01(r) * 255);
      dstData[offset + 1] = Math.round(clamp01(g) * 255);
      dstData[offset + 2] = Math.round(clamp01(b) * 255);
      dstData[offset + 3] = srcData[offset + 3]; // Preserve alpha
    }

    return result;
  }

  /**
   * Apply a single transfer function to an ImageData buffer.
   *
   * Useful for standalone linearization or gamma encoding without
   * a full color space conversion.
   *
   * @param imageData  Source ImageData.
   * @param func       Transfer function: 'srgb-linearize', 'srgb-encode',
   *                   'pq-eotf', 'pq-inv-eotf', 'hlg-oetf', 'hlg-eotf',
   *                   'acescct-encode', 'acescct-decode'.
   * @returns          New ImageData with transformed values.
   */
  applyTransferFunction(
    imageData: ImageData,
    func:
      | 'srgb-linearize'
      | 'srgb-encode'
      | 'pq-eotf'
      | 'pq-inv-eotf'
      | 'hlg-oetf'
      | 'hlg-eotf'
      | 'acescct-encode'
      | 'acescct-decode',
  ): ImageData {
    const { width, height, data: srcData } = imageData;
    const result = new ImageData(width, height);
    const dstData = result.data;
    const pixelCount = width * height;

    let tfn: (v: number) => number;
    switch (func) {
      case 'srgb-linearize':  tfn = srgbToLinear; break;
      case 'srgb-encode':     tfn = linearToSrgb; break;
      case 'pq-eotf':         tfn = pqEotf; break;
      case 'pq-inv-eotf':     tfn = pqInvEotf; break;
      case 'hlg-oetf':        tfn = hlgOetf; break;
      case 'hlg-eotf':        tfn = hlgEotf; break;
      case 'acescct-encode':  tfn = linearToAcesCct; break;
      case 'acescct-decode':  tfn = acesCctToLinear; break;
    }

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      dstData[offset]     = Math.round(clamp01(tfn(srcData[offset] / 255)) * 255);
      dstData[offset + 1] = Math.round(clamp01(tfn(srcData[offset + 1] / 255)) * 255);
      dstData[offset + 2] = Math.round(clamp01(tfn(srcData[offset + 2] / 255)) * 255);
      dstData[offset + 3] = srcData[offset + 3];
    }

    return result;
  }

  /**
   * Get the available WGSL shader source for a specific transform.
   *
   * @param shaderId  One of: 'rec709-rec2020', 'rec709-dci-p3', 'srgb-gamma',
   *                  'pq-eotf', 'hlg', 'aces-cct'.
   * @returns         The WGSL shader source string, or null if not found.
   */
  getShaderSource(
    shaderId: 'rec709-rec2020' | 'rec709-dci-p3' | 'srgb-gamma' | 'pq-eotf' | 'hlg' | 'aces-cct',
  ): string | null {
    switch (shaderId) {
      case 'rec709-rec2020': return rec709ToRec2020Shader;
      case 'rec709-dci-p3':  return rec709ToDciP3Shader;
      case 'srgb-gamma':     return srgbGammaShader;
      case 'pq-eotf':        return pqEotfShader;
      case 'hlg':            return hlgShader;
      case 'aces-cct':       return acesCctShader;
      default:               return null;
    }
  }

  /**
   * Clean up GPU resources.
   */
  dispose(): void {
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
    this.gpuAvailable = false;
    this.initPromise = null;
  }
}

/** Singleton color transform pipeline instance. */
export const colorTransformPipeline = new ColorTransformPipeline();
