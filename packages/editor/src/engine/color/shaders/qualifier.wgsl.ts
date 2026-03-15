// =============================================================================
//  WGSL Compute Shader: HSL Qualifier (Matte Generation)
//  Generates a grayscale matte based on HSL range qualification.
// =============================================================================

export const qualifierShader = /* wgsl */ `

struct QualifierParams {
  hue_center: f32,     // 0..1 (hue / 360)
  hue_width: f32,      // 0..1
  hue_softness: f32,   // 0..1
  sat_low: f32,        // 0..1
  sat_high: f32,       // 0..1
  sat_softness: f32,   // 0..1
  lum_low: f32,        // 0..1
  lum_high: f32,       // 0..1
  lum_softness: f32,   // 0..1
  invert: u32,         // 0 or 1
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var matte_texture: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> params: QualifierParams;

// RGB to HSL (same as huesat shader)
fn rgb_to_hsl(r: f32, g: f32, b: f32) -> vec3f {
  let mx = max(max(r, g), b);
  let mn = min(min(r, g), b);
  let l = (mx + mn) * 0.5;
  if (mx == mn) {
    return vec3f(0.0, 0.0, l);
  }
  let d = mx - mn;
  let s = select(d / (2.0 - mx - mn), d / (mx + mn), l <= 0.5);
  var h: f32;
  if (mx == r) {
    h = ((g - b) / d + select(0.0, 6.0, g < b)) / 6.0;
  } else if (mx == g) {
    h = ((b - r) / d + 2.0) / 6.0;
  } else {
    h = ((r - g) / d + 4.0) / 6.0;
  }
  return vec3f(h, s, l);
}

// Smooth falloff for range edges
fn range_qualify(value: f32, low: f32, high: f32, softness: f32) -> f32 {
  if (value >= low && value <= high) {
    return 1.0;
  }
  if (softness <= 0.001) {
    return 0.0;
  }
  if (value < low) {
    return clamp((value - (low - softness)) / softness, 0.0, 1.0);
  }
  // value > high
  return clamp(((high + softness) - value) / softness, 0.0, 1.0);
}

// Hue-aware qualification (wraps around 0/1 boundary)
fn hue_qualify(hue: f32, center: f32, width: f32, softness: f32) -> f32 {
  let half_w = width * 0.5;
  // Shortest angular distance
  var dist = abs(hue - center);
  dist = min(dist, 1.0 - dist);

  if (dist <= half_w) {
    return 1.0;
  }
  if (softness <= 0.001) {
    return 0.0;
  }
  return clamp((half_w + softness - dist) / softness, 0.0, 1.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let hsl = rgb_to_hsl(pixel.r, pixel.g, pixel.b);

  let hue_key = hue_qualify(hsl.x, params.hue_center, params.hue_width, params.hue_softness);
  let sat_key = range_qualify(hsl.y, params.sat_low, params.sat_high, params.sat_softness);
  let lum_key = range_qualify(hsl.z, params.lum_low, params.lum_high, params.lum_softness);

  var matte = hue_key * sat_key * lum_key;

  if (params.invert != 0u) {
    matte = 1.0 - matte;
  }

  textureStore(matte_texture, vec2i(gid.xy), vec4f(matte, 0.0, 0.0, 0.0));
}
`;

// Companion shader: apply grade using matte
export const matteApplyShader = /* wgsl */ `

@group(0) @binding(0) var original_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var graded_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(2) var matte_texture: texture_storage_2d<r32float, read>;
@group(0) @binding(3) var output_texture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(original_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let orig = textureLoad(original_texture, vec2i(gid.xy));
  let graded = textureLoad(graded_texture, vec2i(gid.xy));
  let matte = textureLoad(matte_texture, vec2i(gid.xy)).r;

  let result = mix(orig, graded, matte);
  textureStore(output_texture, vec2i(gid.xy), result);
}
`;
