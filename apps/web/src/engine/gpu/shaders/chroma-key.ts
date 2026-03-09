// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Chroma Key
//  HSL distance keying with spill suppression.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct ChromaKeyParams {
  key_r: f32,              // key color red (0-1)
  key_g: f32,              // key color green (0-1)
  key_b: f32,              // key color blue (0-1)
  tolerance: f32,          // 0-100
  softness: f32,           // 0-100
  spill_suppression: f32,  // 0-100
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: ChromaKeyParams;

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> vec3f {
  let mx = max(max(r, g), b);
  let mn = min(min(r, g), b);
  let l = (mx + mn) * 0.5;

  if (mx == mn) {
    return vec3f(0.0, 0.0, l);
  }

  let d = mx - mn;
  var s: f32;
  if (l > 0.5) {
    s = d / (2.0 - mx - mn);
  } else {
    s = d / (mx + mn);
  }

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

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var r = pixel.r;
  var g = pixel.g;
  var b = pixel.b;
  var a = pixel.a;

  let key_hsl = rgb_to_hsl(params.key_r, params.key_g, params.key_b);
  let pix_hsl = rgb_to_hsl(r, g, b);

  // Hue distance (circular)
  var h_dist = abs(pix_hsl.x - key_hsl.x);
  if (h_dist > 0.5) { h_dist = 1.0 - h_dist; }
  let s_dist = abs(pix_hsl.y - key_hsl.y);
  let l_dist = abs(pix_hsl.z - key_hsl.z);

  // Weighted HSL distance
  let dist = sqrt(h_dist * h_dist * 4.0 + s_dist * s_dist + l_dist * l_dist * 0.5);

  let tol_norm = params.tolerance / 100.0;
  let soft_norm = params.softness / 100.0;
  let spill_norm = params.spill_suppression / 100.0;

  let inner_threshold = tol_norm * 0.5;
  let outer_threshold = tol_norm * 0.5 + soft_norm * 0.3 + 0.05;

  if (dist < inner_threshold) {
    // Fully transparent
    a = 0.0;
  } else if (dist < outer_threshold) {
    // Soft edge
    let alpha_mult = (dist - inner_threshold) / (outer_threshold - inner_threshold);
    a = a * alpha_mult;
  }

  // Spill suppression on non-keyed pixels
  if (spill_norm > 0.0 && a > 0.0) {
    if (params.key_g > params.key_r && params.key_g > params.key_b) {
      // Green screen: suppress green
      let max_rb = max(r, b);
      g = g - (g - max_rb) * spill_norm;
    } else if (params.key_b > params.key_r && params.key_b > params.key_g) {
      // Blue screen: suppress blue
      let max_rg = max(r, g);
      b = b - (b - max_rg) * spill_norm;
    }
  }

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), clamp(a, 0.0, 1.0)));
}
`;
