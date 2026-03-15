// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Sharpen (Unsharp Mask)
//  Computes a local box blur inline and amplifies the difference.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct SharpenParams {
  amount: f32,       // 0-200 (percentage)
  radius: i32,       // blur radius for mask (1-10)
  threshold: f32,    // minimum difference to sharpen (0-255, normalized 0-1)
  _pad: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: SharpenParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let strength = params.amount / 100.0;
  let r = params.radius;
  let thresh = params.threshold / 255.0;

  if (strength <= 0.0 || r <= 0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  // Compute box blur at this pixel (inline unsharp mask)
  var sum = vec3f(0.0);
  var count = 0.0;

  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      let sx = clamp(i32(gid.x) + dx, 0, i32(dims.x) - 1);
      let sy = clamp(i32(gid.y) + dy, 0, i32(dims.y) - 1);
      let s = textureLoad(input_texture, vec2i(sx, sy));
      sum += s.rgb;
      count += 1.0;
    }
  }

  let blurred = sum / count;
  let diff = pixel.rgb - blurred;

  // Apply threshold: only sharpen where difference is significant
  var out_rgb = pixel.rgb;
  if (abs(diff.r) >= thresh) {
    out_rgb.r = clamp(pixel.r + diff.r * strength, 0.0, 1.0);
  }
  if (abs(diff.g) >= thresh) {
    out_rgb.g = clamp(pixel.g + diff.g * strength, 0.0, 1.0);
  }
  if (abs(diff.b) >= thresh) {
    out_rgb.b = clamp(pixel.b + diff.b * strength, 0.0, 1.0);
  }

  textureStore(output_texture, vec2i(gid.xy), vec4f(out_rgb, pixel.a));
}
`;
