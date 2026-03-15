// =============================================================================
//  WGSL Compute Shader: Channel Mixer
//  3x3 RGB channel mixing matrix.
// =============================================================================

export const channelMixerShader = /* wgsl */ `

struct MixerParams {
  // Row-major 3x3 matrix: [redOut.r, redOut.g, redOut.b, greenOut.r, ...]
  m00: f32, m01: f32, m02: f32, _pad0: f32,
  m10: f32, m11: f32, m12: f32, _pad1: f32,
  m20: f32, m21: f32, m22: f32, _pad2: f32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: MixerParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  let r = pixel.r * params.m00 + pixel.g * params.m01 + pixel.b * params.m02;
  let g = pixel.r * params.m10 + pixel.g * params.m11 + pixel.b * params.m12;
  let b = pixel.r * params.m20 + pixel.g * params.m21 + pixel.b * params.m22;

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), pixel.a));
}
`;
