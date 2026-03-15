// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Mirror
//  Axis-based coordinate reflection with configurable center point.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct MirrorParams {
  axis: u32,       // 0 = horizontal, 1 = vertical, 2 = both
  center: f32,     // mirror center (0-1, normalized along axis)
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: MirrorParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  var src_x = i32(gid.x);
  var src_y = i32(gid.y);

  let w = f32(dims.x);
  let h = f32(dims.y);

  if (params.axis == 0u || params.axis == 2u) {
    // Horizontal mirror: reflect X across center
    let cx = params.center * w;
    let px = f32(gid.x);
    if (px > cx) {
      src_x = i32(round(cx - (px - cx)));
    }
  }

  if (params.axis == 1u || params.axis == 2u) {
    // Vertical mirror: reflect Y across center
    let cy = params.center * h;
    let py = f32(gid.y);
    if (py > cy) {
      src_y = i32(round(cy - (py - cy)));
    }
  }

  // Clamp to valid range
  src_x = clamp(src_x, 0, i32(dims.x) - 1);
  src_y = clamp(src_y, 0, i32(dims.y) - 1);

  let pixel = textureLoad(input_texture, vec2i(src_x, src_y));
  textureStore(output_texture, vec2i(gid.xy), pixel);
}
`;
