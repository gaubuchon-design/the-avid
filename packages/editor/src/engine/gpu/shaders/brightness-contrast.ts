// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Brightness / Contrast
//  Per-pixel RGB multiply/offset with modern curve or legacy linear mode.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct BrightnessContrastParams {
  brightness: f32,    // -100 to 100
  contrast: f32,      // -100 to 100
  use_legacy: u32,    // 0 or 1
  _pad: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: BrightnessContrastParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var r = pixel.r;
  var g = pixel.g;
  var b = pixel.b;

  if (params.use_legacy != 0u) {
    // Legacy: simple linear brightness + contrast
    let bright_offset = params.brightness / 100.0;
    let c = params.contrast / 100.0;
    let factor = (259.0 * (c * 255.0 + 255.0)) / (255.0 * (259.0 - c * 255.0));

    r = clamp(factor * (r - 0.5 + bright_offset) + 0.5, 0.0, 1.0);
    g = clamp(factor * (g - 0.5 + bright_offset) + 0.5, 0.0, 1.0);
    b = clamp(factor * (b - 0.5 + bright_offset) + 0.5, 0.0, 1.0);
  } else {
    // Modern: brightness as curve, contrast as S-curve
    let b_norm = params.brightness / 100.0;
    let c_norm = params.contrast / 100.0;
    let contrast_factor = tan((c_norm + 1.0) * 0.7853981633974483); // PI/4

    // Brightness
    if (b_norm > 0.0) {
      r = r + (1.0 - r) * b_norm;
      g = g + (1.0 - g) * b_norm;
      b = b + (1.0 - b) * b_norm;
    } else {
      r = r + r * b_norm;
      g = g + g * b_norm;
      b = b + b * b_norm;
    }

    // Contrast
    r = clamp((r - 0.5) * contrast_factor + 0.5, 0.0, 1.0);
    g = clamp((g - 0.5) * contrast_factor + 0.5, 0.0, 1.0);
    b = clamp((b - 0.5) * contrast_factor + 0.5, 0.0, 1.0);
  }

  textureStore(output_texture, vec2i(gid.xy), vec4f(r, g, b, pixel.a));
}
`;
