// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Luma Key
//  Luminance-based keying with soft edge and invert support.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct LumaKeyParams {
  threshold: f32,   // 0-1 luminance threshold
  softness: f32,    // 0-1 soft edge width
  invert: u32,      // 0 = key dark, 1 = key light
  _pad: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: LumaKeyParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  // Rec. 709 luminance
  let luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;

  // Compute alpha based on threshold and softness
  let soft = max(params.softness, 0.001);
  let low = params.threshold - soft * 0.5;
  let high = params.threshold + soft * 0.5;

  var alpha: f32;
  if (luma <= low) {
    alpha = 0.0;
  } else if (luma >= high) {
    alpha = 1.0;
  } else {
    alpha = (luma - low) / (high - low);
  }

  // Invert flips which side is transparent
  if (params.invert != 0u) {
    alpha = 1.0 - alpha;
  }

  // Multiply with existing alpha
  let out_a = pixel.a * alpha;

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(pixel.r, pixel.g, pixel.b, clamp(out_a, 0.0, 1.0)));
}
`;
