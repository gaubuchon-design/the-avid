// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Color Lookup (LUT)
//  Simplified analytical color transforms emulating popular LUT styles.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct ColorLookupParams {
  lut_index: u32,    // 0=none, 1=teal-orange, 2=warm-sunset, 3=cool-night, 4=bleach-bypass, 5=cross-process
  intensity: f32,    // 0-1 blend factor
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: ColorLookupParams;

fn luminance(c: vec3f) -> f32 {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

fn apply_lut(color: vec3f) -> vec3f {
  let luma = luminance(color);

  switch (params.lut_index) {
    // Teal-Orange: push shadows toward teal, highlights toward orange
    case 1u: {
      let teal = vec3f(0.0, 0.5, 0.5);
      let orange = vec3f(1.0, 0.6, 0.2);
      let grade = mix(teal, orange, luma);
      return mix(color, grade, 0.4);
    }
    // Warm Sunset: warm golden tones
    case 2u: {
      let warm = vec3f(
        color.r * 1.1 + 0.05,
        color.g * 0.95 + 0.02,
        color.b * 0.8,
      );
      return clamp(warm, vec3f(0.0), vec3f(1.0));
    }
    // Cool Night: blue-shifted shadows, desaturated
    case 3u: {
      let desat = mix(color, vec3f(luma), 0.3);
      let cool = vec3f(
        desat.r * 0.85,
        desat.g * 0.9,
        desat.b * 1.15 + 0.05,
      );
      return clamp(cool, vec3f(0.0), vec3f(1.0));
    }
    // Bleach Bypass: high contrast, desaturated
    case 4u: {
      let desat = mix(color, vec3f(luma), 0.5);
      // S-curve contrast
      let contrasted = vec3f(
        clamp((desat.r - 0.5) * 1.5 + 0.5, 0.0, 1.0),
        clamp((desat.g - 0.5) * 1.5 + 0.5, 0.0, 1.0),
        clamp((desat.b - 0.5) * 1.5 + 0.5, 0.0, 1.0),
      );
      return contrasted;
    }
    // Cross Process: greens in shadows, magentas in highlights
    case 5u: {
      let result = vec3f(
        clamp(color.r * color.r * 0.8 + color.r * 0.3, 0.0, 1.0),
        clamp(color.g * 1.1 + 0.02, 0.0, 1.0),
        clamp(color.b * 0.7 + luma * 0.3, 0.0, 1.0),
      );
      return result;
    }
    // None / default: pass through
    default: {
      return color;
    }
  }
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let original = vec3f(pixel.r, pixel.g, pixel.b);

  if (params.lut_index == 0u || params.intensity <= 0.0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let graded = apply_lut(original);
  let result = mix(original, graded, params.intensity);

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(result.r, 0.0, 1.0), clamp(result.g, 0.0, 1.0), clamp(result.b, 0.0, 1.0), pixel.a));
}
`;
