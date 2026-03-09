// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Letterbox
//  Aspect ratio bars — fills top and bottom regions with a color.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct LetterboxParams {
  target_ar: f32,      // target aspect ratio (e.g. 2.39)
  bar_r: f32,          // bar color red (0-1)
  bar_g: f32,          // bar color green (0-1)
  bar_b: f32,          // bar color blue (0-1)
  opacity: f32,        // 0-100
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: LetterboxParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let op_norm = params.opacity / 100.0;

  let current_ar = f32(dims.x) / f32(dims.y);

  if (params.target_ar <= current_ar || op_norm <= 0.0) {
    // Already wider than target or no opacity, pass through
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  // Calculate bar height
  let target_height = f32(dims.x) / params.target_ar;
  let bar_height = u32(round((f32(dims.y) - target_height) * 0.5));

  let is_bar = gid.y < bar_height || gid.y >= (dims.y - bar_height);

  if (is_bar) {
    // Blend bar color with original
    let out_r = pixel.r * (1.0 - op_norm) + params.bar_r * op_norm;
    let out_g = pixel.g * (1.0 - op_norm) + params.bar_g * op_norm;
    let out_b = pixel.b * (1.0 - op_norm) + params.bar_b * op_norm;
    textureStore(output_texture, vec2i(gid.xy), vec4f(out_r, out_g, out_b, pixel.a));
  } else {
    textureStore(output_texture, vec2i(gid.xy), pixel);
  }
}
`;
