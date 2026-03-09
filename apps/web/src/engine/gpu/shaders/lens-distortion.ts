// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Lens Distortion
//  Barrel / pincushion distortion with decentering and fill color.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct LensDistortionParams {
  curvature: f32,     // -1 to 1 (negative = pincushion, positive = barrel)
  v_decenter: f32,    // vertical decentering (-1 to 1)
  h_decenter: f32,    // horizontal decentering (-1 to 1)
  fill_r: f32,        // fill color red (0-1)
  fill_g: f32,        // fill color green (0-1)
  fill_b: f32,        // fill color blue (0-1)
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: LensDistortionParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  if (abs(params.curvature) < 0.001) {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let w = f32(dims.x);
  let h = f32(dims.y);

  // Normalized coordinates -1 to 1 with decentering
  let nx = (f32(gid.x) / w * 2.0 - 1.0) - params.h_decenter;
  let ny = (f32(gid.y) / h * 2.0 - 1.0) - params.v_decenter;

  // Radial distance squared
  let r2 = nx * nx + ny * ny;
  let r = sqrt(r2);

  // Barrel/pincushion: r' = r * (1 + k * r^2)
  let k = params.curvature * 2.0;
  let distorted_r = r * (1.0 + k * r2);

  // Map back to pixel coordinates
  var src_x: f32;
  var src_y: f32;
  if (r > 0.0001) {
    let scale = distorted_r / r;
    src_x = ((nx * scale + params.h_decenter) + 1.0) * 0.5 * w;
    src_y = ((ny * scale + params.v_decenter) + 1.0) * 0.5 * h;
  } else {
    src_x = f32(gid.x);
    src_y = f32(gid.y);
  }

  // Bilinear interpolation
  let ix = i32(floor(src_x));
  let iy = i32(floor(src_y));
  let fx = src_x - f32(ix);
  let fy = src_y - f32(iy);

  let fill = vec4f(params.fill_r, params.fill_g, params.fill_b, 1.0);

  // Check bounds for all four sample points
  if (ix < 0 || ix + 1 >= i32(dims.x) || iy < 0 || iy + 1 >= i32(dims.y)) {
    // Out of bounds: use fill color
    textureStore(output_texture, vec2i(gid.xy), fill);
    return;
  }

  let p00 = textureLoad(input_texture, vec2i(ix, iy));
  let p10 = textureLoad(input_texture, vec2i(ix + 1, iy));
  let p01 = textureLoad(input_texture, vec2i(ix, iy + 1));
  let p11 = textureLoad(input_texture, vec2i(ix + 1, iy + 1));

  let top = mix(p00, p10, fx);
  let bottom = mix(p01, p11, fx);
  let result = mix(top, bottom, fy);

  textureStore(output_texture, vec2i(gid.xy), result);
}
`;
