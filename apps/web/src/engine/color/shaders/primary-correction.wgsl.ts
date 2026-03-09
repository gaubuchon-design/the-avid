// =============================================================================
//  WGSL Compute Shader: Primary Color Correction
//  Lift / Gamma / Gain / Offset + Contrast + Saturation + Temperature/Tint
// =============================================================================

export const primaryCorrectionShader = /* wgsl */ `

struct PrimaryParams {
  lift_r: f32,
  lift_g: f32,
  lift_b: f32,
  gamma_r: f32,
  gamma_g: f32,
  gamma_b: f32,
  gain_r: f32,
  gain_g: f32,
  gain_b: f32,
  offset_r: f32,
  offset_g: f32,
  offset_b: f32,
  saturation: f32,
  contrast: f32,
  pivot: f32,
  temp_r: f32,
  temp_g: f32,
  temp_b: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: PrimaryParams;

// sRGB linearize
fn srgb_to_linear(c: f32) -> f32 {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

// sRGB encode
fn linear_to_srgb(c: f32) -> f32 {
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

// Lift/Gamma/Gain per channel
// out = gain * (offset + (1 - lift) * pow(input, 1/gamma) + lift)
fn lgg(input: f32, lift: f32, gamma: f32, gain: f32, offset: f32) -> f32 {
  let g = select(gamma, 0.001, abs(gamma) < 0.001);
  return gain * (offset + (1.0 - lift) * pow(max(input, 0.0), 1.0 / g) + lift);
}

// Rec.709 luma
fn luma(r: f32, g: f32, b: f32) -> f32 {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  // Linearize from sRGB
  var r = srgb_to_linear(pixel.r);
  var g = srgb_to_linear(pixel.g);
  var b = srgb_to_linear(pixel.b);

  // Lift / Gamma / Gain
  r = lgg(r, params.lift_r, max(params.gamma_r, 0.01), max(params.gain_r, 0.0), params.offset_r);
  g = lgg(g, params.lift_g, max(params.gamma_g, 0.01), max(params.gain_g, 0.0), params.offset_g);
  b = lgg(b, params.lift_b, max(params.gamma_b, 0.01), max(params.gain_b, 0.0), params.offset_b);

  // Contrast around pivot
  let p = params.pivot;
  r = (r - p) * params.contrast + p;
  g = (g - p) * params.contrast + p;
  b = (b - p) * params.contrast + p;

  // Temperature / Tint (pre-computed multipliers)
  r *= params.temp_r;
  g *= params.temp_g;
  b *= params.temp_b;

  // Saturation
  let l = luma(r, g, b);
  r = l + (r - l) * params.saturation;
  g = l + (g - l) * params.saturation;
  b = l + (b - l) * params.saturation;

  // Encode back to sRGB
  r = linear_to_srgb(clamp(r, 0.0, 1.0));
  g = linear_to_srgb(clamp(g, 0.0, 1.0));
  b = linear_to_srgb(clamp(b, 0.0, 1.0));

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(r, g, b, pixel.a));
}
`;
