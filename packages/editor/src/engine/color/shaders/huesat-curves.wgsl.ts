// =============================================================================
//  WGSL Compute Shader: Hue/Sat Curves
//  Hue vs Hue, Hue vs Sat, Hue vs Lum, Lum vs Sat, Sat vs Sat, Sat vs Lum
//  Each curve is a pre-baked 256-entry 1D texture.
// =============================================================================

export const hueSatCurvesShader = /* wgsl */ `

struct HueSatParams {
  hue_vs_hue_enabled: u32,
  hue_vs_sat_enabled: u32,
  hue_vs_lum_enabled: u32,
  lum_vs_sat_enabled: u32,
  sat_vs_sat_enabled: u32,
  sat_vs_lum_enabled: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: HueSatParams;
@group(0) @binding(3) var hue_vs_hue_lut: texture_1d<f32>;
@group(0) @binding(4) var hue_vs_sat_lut: texture_1d<f32>;
@group(0) @binding(5) var hue_vs_lum_lut: texture_1d<f32>;
@group(0) @binding(6) var lum_vs_sat_lut: texture_1d<f32>;
@group(0) @binding(7) var sat_vs_sat_lut: texture_1d<f32>;
@group(0) @binding(8) var sat_vs_lum_lut: texture_1d<f32>;

// RGB to HSL
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

// HSL to RGB
fn hue2rgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> vec3f {
  if (s == 0.0) {
    return vec3f(l, l, l);
  }
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3f(
    hue2rgb(p, q, h + 1.0 / 3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0 / 3.0),
  );
}

fn lut_sample(tex: texture_1d<f32>, val: f32) -> f32 {
  let idx = i32(clamp(val * 255.0, 0.0, 255.0));
  return textureLoad(tex, idx, 0).r;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var hsl = rgb_to_hsl(pixel.r, pixel.g, pixel.b);

  // Hue vs Hue: shift hue based on input hue
  if (params.hue_vs_hue_enabled != 0u) {
    let shift = lut_sample(hue_vs_hue_lut, hsl.x) - 0.5;  // centered at 0.5 = no change
    hsl.x = fract(hsl.x + shift);
  }

  // Hue vs Sat: adjust saturation per hue region
  if (params.hue_vs_sat_enabled != 0u) {
    let factor = lut_sample(hue_vs_sat_lut, hsl.x) * 2.0;  // 0.5 = 1.0x, 1.0 = 2.0x
    hsl.y = clamp(hsl.y * factor, 0.0, 1.0);
  }

  // Hue vs Lum: adjust luminance per hue region
  if (params.hue_vs_lum_enabled != 0u) {
    let factor = lut_sample(hue_vs_lum_lut, hsl.x) * 2.0;
    hsl.z = clamp(hsl.z * factor, 0.0, 1.0);
  }

  // Lum vs Sat: adjust saturation per luminance zone
  if (params.lum_vs_sat_enabled != 0u) {
    let factor = lut_sample(lum_vs_sat_lut, hsl.z) * 2.0;
    hsl.y = clamp(hsl.y * factor, 0.0, 1.0);
  }

  // Sat vs Sat: adjust saturation per input saturation
  if (params.sat_vs_sat_enabled != 0u) {
    let factor = lut_sample(sat_vs_sat_lut, hsl.y) * 2.0;
    hsl.y = clamp(hsl.y * factor, 0.0, 1.0);
  }

  // Sat vs Lum: adjust luminance per saturation
  if (params.sat_vs_lum_enabled != 0u) {
    let factor = lut_sample(sat_vs_lum_lut, hsl.y) * 2.0;
    hsl.z = clamp(hsl.z * factor, 0.0, 1.0);
  }

  let rgb = hsl_to_rgb(hsl.x, hsl.y, hsl.z);
  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(rgb.x, 0.0, 1.0), clamp(rgb.y, 0.0, 1.0), clamp(rgb.z, 0.0, 1.0), pixel.a));
}
`;
