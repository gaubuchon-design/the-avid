// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shaders: Separable Box Blur
//  Two-pass (horizontal + vertical) for Gaussian-like blur.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Horizontal blur pass shader source.
 * Reads from input_texture, writes to output_texture.
 */
export const horizontalBlurSource = /* wgsl */ `

struct BlurParams {
  radius: i32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: BlurParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let r = params.radius;
  if (r <= 0) {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let diameter = r * 2 + 1;
  var sum = vec4f(0.0);

  for (var dx = -r; dx <= r; dx++) {
    let sx = clamp(i32(gid.x) + dx, 0, i32(dims.x) - 1);
    sum += textureLoad(input_texture, vec2i(sx, i32(gid.y)));
  }

  let result = sum / f32(diameter);
  textureStore(output_texture, vec2i(gid.xy), result);
}
`;

/**
 * Vertical blur pass shader source.
 * Reads from input_texture, writes to output_texture.
 */
export const verticalBlurSource = /* wgsl */ `

struct BlurParams {
  radius: i32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: BlurParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let r = params.radius;
  if (r <= 0) {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let diameter = r * 2 + 1;
  var sum = vec4f(0.0);

  for (var dy = -r; dy <= r; dy++) {
    let sy = clamp(i32(gid.y) + dy, 0, i32(dims.y) - 1);
    sum += textureLoad(input_texture, vec2i(i32(gid.x), sy));
  }

  let result = sum / f32(diameter);
  textureStore(output_texture, vec2i(gid.xy), result);
}
`;

/**
 * Combined shader source for standard single-effect binding layout.
 * Uses the horizontal pass as the primary shader; the pipeline will
 * run both passes via ShaderRegistry.
 */
export const shaderSource = horizontalBlurSource;
