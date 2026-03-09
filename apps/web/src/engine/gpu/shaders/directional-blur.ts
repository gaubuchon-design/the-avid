// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Directional Blur
//  Motion blur along a specified angle direction.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct DirectionalBlurParams {
  angle: f32,       // 0-360 degrees
  length: i32,      // blur length in pixels (1-100)
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: DirectionalBlurParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let len = min(params.length, 100);
  if (len <= 1) {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  // Direction vector from angle (degrees -> radians)
  let rad = params.angle * 3.14159265 / 180.0;
  let dir_x = cos(rad);
  let dir_y = sin(rad);

  // Sample along the direction, centered on current pixel
  var accum = vec4f(0.0, 0.0, 0.0, 0.0);
  let half_len = f32(len) * 0.5;
  var count = 0.0;

  for (var i = 0; i < len; i++) {
    let offset = f32(i) - half_len;
    let sx = i32(round(f32(gid.x) + dir_x * offset));
    let sy = i32(round(f32(gid.y) + dir_y * offset));

    if (sx >= 0 && sx < i32(dims.x) && sy >= 0 && sy < i32(dims.y)) {
      accum += textureLoad(input_texture, vec2i(sx, sy));
      count += 1.0;
    }
  }

  if (count > 0.0) {
    textureStore(output_texture, vec2i(gid.xy), accum / count);
  } else {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
  }
}
`;
