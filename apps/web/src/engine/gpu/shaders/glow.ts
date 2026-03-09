// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Glow
//  Threshold bright pixels, blur them, then additive blend.
//  This shader combines threshold + blur + blend in a single pass
//  (simplified for GPU efficiency compared to multi-pass CPU approach).
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct GlowParams {
  radius: i32,        // blur radius in pixels (0-100)
  intensity: f32,     // glow strength 0-100
  threshold: f32,     // brightness threshold 0-100
  tint_r: f32,        // glow tint color r (0-1)
  tint_g: f32,        // glow tint color g (0-1)
  tint_b: f32,        // glow tint color b (0-1)
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: GlowParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let int_norm = params.intensity / 100.0;
  let thresh_val = params.threshold / 100.0;

  if (int_norm <= 0.0 || params.radius <= 0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  // Compute blurred bright-pass by sampling surrounding pixels
  let r = min(params.radius, 20);
  var bright_sum = vec3f(0.0);
  var count = 0.0;

  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      let sx = clamp(i32(gid.x) + dx, 0, i32(dims.x) - 1);
      let sy = clamp(i32(gid.y) + dy, 0, i32(dims.y) - 1);
      let s = textureLoad(input_texture, vec2i(sx, sy));

      // Luminance check for threshold
      let lum = s.r * 0.299 + s.g * 0.587 + s.b * 0.114;
      if (lum > thresh_val) {
        bright_sum += s.rgb;
      }
      count += 1.0;
    }
  }

  let blurred_bright = bright_sum / count;

  // Additive blend with tint
  let tint = vec3f(params.tint_r, params.tint_g, params.tint_b);
  let glow_contribution = blurred_bright * int_norm * tint;

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(
      clamp(pixel.r + glow_contribution.r, 0.0, 1.0),
      clamp(pixel.g + glow_contribution.g, 0.0, 1.0),
      clamp(pixel.b + glow_contribution.b, 0.0, 1.0),
      pixel.a,
    ));
}
`;
