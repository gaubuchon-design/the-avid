// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Color Balance
//  Shadows / Midtones / Highlights RGB shift with luminosity preservation.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct ColorBalanceParams {
  shadows_r: f32,         // -100 to 100
  shadows_g: f32,
  shadows_b: f32,
  midtones_r: f32,
  midtones_g: f32,        // -100 to 100
  midtones_b: f32,
  highlights_r: f32,
  highlights_g: f32,      // -100 to 100
  highlights_b: f32,
  preserve_luminosity: u32, // 0 or 1
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: ColorBalanceParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let r = pixel.r;
  let g = pixel.g;
  let b = pixel.b;

  // Luminance (Rec. 709)
  let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Shadow weight: strongest at dark values, fades to 0 at mid
  let shadow_w = max(0.0, 1.0 - lum * 4.0);
  // Highlight weight: strongest at bright values
  let high_w = max(0.0, lum * 4.0 - 3.0);
  // Midtone weight: bell curve centered at 0.5
  let mid_w = 1.0 - shadow_w - high_w;

  let scale = 2.55 / 100.0;  // maps -100..100 -> approx -0.0255..0.0255 in 0..1 space

  var nr = r + (params.shadows_r * scale * shadow_w +
                params.midtones_r * scale * mid_w +
                params.highlights_r * scale * high_w);
  var ng = g + (params.shadows_g * scale * shadow_w +
                params.midtones_g * scale * mid_w +
                params.highlights_g * scale * high_w);
  var nb = b + (params.shadows_b * scale * shadow_w +
                params.midtones_b * scale * mid_w +
                params.highlights_b * scale * high_w);

  if (params.preserve_luminosity != 0u) {
    let new_lum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    if (new_lum > 0.0) {
      let ratio = lum / new_lum;
      nr *= ratio;
      ng *= ratio;
      nb *= ratio;
    }
  }

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(nr, 0.0, 1.0), clamp(ng, 0.0, 1.0), clamp(nb, 0.0, 1.0), pixel.a));
}
`;
