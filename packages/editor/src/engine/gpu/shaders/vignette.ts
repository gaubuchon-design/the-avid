// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Vignette
//  Radial distance darkening with configurable shape and feather.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct VignetteParams {
  amount: f32,      // 0-100
  midpoint: f32,    // 0-100
  roundness: f32,   // 0-100 (100 = circular, 0 = rectangular)
  feather: f32,     // 0-100
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: VignetteParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  let amount_norm = params.amount / 100.0;
  if (amount_norm <= 0.0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let cx = f32(dims.x) * 0.5;
  let cy = f32(dims.y) * 0.5;
  let mid_norm = params.midpoint / 100.0;
  let feather_norm = max(params.feather / 100.0, 0.01);
  let round_norm = params.roundness / 100.0;

  let dx = (f32(gid.x) - cx) / cx;
  let dy = (f32(gid.y) - cy) / cy;

  // Distance: blend between circular and rectangular
  let circ_dist = sqrt(dx * dx + dy * dy);
  let rect_dist = max(abs(dx), abs(dy));
  let dist = circ_dist * round_norm + rect_dist * (1.0 - round_norm);

  // Vignette factor
  let edge = max(0.0, (dist - mid_norm) / feather_norm);
  let factor = 1.0 - min(1.0, edge * edge) * amount_norm;

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(pixel.r * factor, pixel.g * factor, pixel.b * factor, pixel.a));
}
`;
