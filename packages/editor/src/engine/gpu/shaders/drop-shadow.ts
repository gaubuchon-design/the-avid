// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Drop Shadow
//  Offset alpha sampling + blur + composite underneath original.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct DropShadowParams {
  shadow_r: f32,      // shadow color red (0-1)
  shadow_g: f32,      // shadow color green (0-1)
  shadow_b: f32,      // shadow color blue (0-1)
  opacity: f32,       // 0-100
  offset_x: i32,      // pixel offset X (pre-computed from angle + distance)
  offset_y: i32,      // pixel offset Y
  blur_radius: i32,   // blur radius
  _pad: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: DropShadowParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let op_norm = params.opacity / 100.0;

  if (op_norm <= 0.0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  // Sample shadow alpha with blur from offset source position
  let r = min(params.blur_radius, 15);
  var shadow_alpha = 0.0;
  var count = 0.0;

  if (r > 0) {
    // Blurred shadow sampling
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        let src_x = i32(gid.x) - params.offset_x + dx;
        let src_y = i32(gid.y) - params.offset_y + dy;

        if (src_x >= 0 && src_x < i32(dims.x) && src_y >= 0 && src_y < i32(dims.y)) {
          let s = textureLoad(input_texture, vec2i(src_x, src_y));
          shadow_alpha += s.a;
        }
        count += 1.0;
      }
    }
    shadow_alpha = (shadow_alpha / count) * op_norm;
  } else {
    // No blur: direct sample
    let src_x = i32(gid.x) - params.offset_x;
    let src_y = i32(gid.y) - params.offset_y;
    if (src_x >= 0 && src_x < i32(dims.x) && src_y >= 0 && src_y < i32(dims.y)) {
      let s = textureLoad(input_texture, vec2i(src_x, src_y));
      shadow_alpha = s.a * op_norm;
    }
  }

  // Composite: shadow underneath original
  let orig_alpha = pixel.a;
  if (shadow_alpha > 0.0 && orig_alpha < 1.0) {
    let blend_alpha = shadow_alpha * (1.0 - orig_alpha);
    let out_r = clamp(pixel.r * orig_alpha + params.shadow_r * blend_alpha, 0.0, 1.0);
    let out_g = clamp(pixel.g * orig_alpha + params.shadow_g * blend_alpha, 0.0, 1.0);
    let out_b = clamp(pixel.b * orig_alpha + params.shadow_b * blend_alpha, 0.0, 1.0);
    let out_a = clamp(orig_alpha + blend_alpha, 0.0, 1.0);
    textureStore(output_texture, vec2i(gid.xy), vec4f(out_r, out_g, out_b, out_a));
  } else {
    textureStore(output_texture, vec2i(gid.xy), pixel);
  }
}
`;
