// =============================================================================
//  WGSL Compute Shader: Curves (1D LUT Lookup)
//  Master + per-channel R/G/B curves via pre-baked 256-entry LUT textures.
// =============================================================================

export const curvesShader = /* wgsl */ `

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var curve_lut: texture_1d<f32>;  // 256 wide, 4 channels: master, R, G, B

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  // Sample index (0..255)
  let ri = u32(clamp(pixel.r * 255.0, 0.0, 255.0));
  let gi = u32(clamp(pixel.g * 255.0, 0.0, 255.0));
  let bi = u32(clamp(pixel.b * 255.0, 0.0, 255.0));

  // Read per-channel curves from LUT
  // LUT layout: .r = master, .g = red, .b = green, .a = blue
  let lut_r = textureLoad(curve_lut, i32(ri), 0);
  let lut_g = textureLoad(curve_lut, i32(gi), 0);
  let lut_b = textureLoad(curve_lut, i32(bi), 0);

  // Apply per-channel, then master
  var r = lut_r.g;  // Red channel curve
  var g = lut_g.b;  // Green channel curve
  var b = lut_b.a;  // Blue channel curve

  // Apply master curve to each
  let mr = u32(clamp(r * 255.0, 0.0, 255.0));
  let mg = u32(clamp(g * 255.0, 0.0, 255.0));
  let mb = u32(clamp(b * 255.0, 0.0, 255.0));

  let master_r = textureLoad(curve_lut, i32(mr), 0).r;
  let master_g = textureLoad(curve_lut, i32(mg), 0).r;
  let master_b = textureLoad(curve_lut, i32(mb), 0).r;

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(master_r, master_g, master_b, pixel.a));
}
`;
