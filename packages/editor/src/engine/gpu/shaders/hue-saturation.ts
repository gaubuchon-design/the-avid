// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Hue / Saturation / Lightness
//  RGB <-> HSL conversion with optional colorize mode.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct HueSaturationParams {
  hue: f32,           // -180 to 180 degrees
  saturation: f32,    // -100 to 100
  lightness: f32,     // -100 to 100
  colorize: u32,      // 0 or 1
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: HueSaturationParams;

fn hue_to_rgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> vec3f {
  let mx = max(max(r, g), b);
  let mn = min(min(r, g), b);
  let l = (mx + mn) * 0.5;

  if (mx == mn) {
    return vec3f(0.0, 0.0, l);
  }

  let d = mx - mn;
  var s: f32;
  if (l > 0.5) {
    s = d / (2.0 - mx - mn);
  } else {
    s = d / (mx + mn);
  }

  var h: f32;
  if (mx == r) {
    h = ((g - b) / d + select(0.0, 6.0, g < b)) / 6.0;
  } else if (mx == g) {
    h = ((b - r) / d + 2.0) / 6.0;
  } else {
    h = ((r - g) / d + 4.0) / 6.0;
  }

  return vec3f(h, s, l);
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> vec3f {
  if (s == 0.0) {
    return vec3f(l, l, l);
  }

  var q: f32;
  if (l < 0.5) {
    q = l * (1.0 + s);
  } else {
    q = l + s - l * s;
  }
  let p = 2.0 * l - q;

  return vec3f(
    hue_to_rgb(p, q, h + 1.0 / 3.0),
    hue_to_rgb(p, q, h),
    hue_to_rgb(p, q, h - 1.0 / 3.0),
  );
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let hsl = rgb_to_hsl(pixel.r, pixel.g, pixel.b);

  var h = hsl.x;
  var s = hsl.y;
  var l = hsl.z;

  let h_shift = params.hue / 360.0;
  let s_shift = params.saturation / 100.0;
  let l_shift = params.lightness / 100.0;

  if (params.colorize != 0u) {
    h = fract(params.hue / 360.0 + 1.0);
    s = clamp((params.saturation + 100.0) / 200.0, 0.0, 1.0);
  } else {
    h = fract(h + h_shift + 1.0);
    s = clamp(s + s_shift, 0.0, 1.0);
  }

  l = clamp(l + l_shift, 0.0, 1.0);

  let rgb = hsl_to_rgb(h, s, l);
  textureStore(output_texture, vec2i(gid.xy), vec4f(rgb.r, rgb.g, rgb.b, pixel.a));
}
`;
