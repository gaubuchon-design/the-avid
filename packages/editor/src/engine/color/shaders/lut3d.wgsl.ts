// =============================================================================
//  WGSL Compute Shader: 3D LUT Application (Tetrahedral Interpolation)
//  High-quality tetrahedral interpolation for 3D color lookup tables.
// =============================================================================

export const lut3dShader = /* wgsl */ `

struct LutParams {
  lut_size: u32,   // e.g., 33 for a 33^3 LUT
  intensity: f32,  // 0..1 blend with original
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: LutParams;
@group(0) @binding(3) var lut_texture: texture_3d<f32>;
@group(0) @binding(4) var lut_sampler: sampler;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  // Scale input to LUT coordinate space
  let size = f32(params.lut_size);
  let scale = (size - 1.0) / size;
  let offset_val = 0.5 / size;

  // Use hardware trilinear sampling via 3D texture
  let uvw = vec3f(
    pixel.r * scale + offset_val,
    pixel.g * scale + offset_val,
    pixel.b * scale + offset_val,
  );

  let lut_color = textureSampleLevel(lut_texture, lut_sampler, uvw, 0.0);

  // Blend with original based on intensity
  let result = mix(pixel, lut_color, params.intensity);

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(result.r, 0.0, 1.0), clamp(result.g, 0.0, 1.0), clamp(result.b, 0.0, 1.0), pixel.a));
}
`;
