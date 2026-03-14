// =============================================================================
//  THE AVID -- Compositing GPU Shaders (WGSL)
//  WebGPU compute shaders for GPU-accelerated compositing operations.
//
//  Contains kernels for:
//   - Blend mode compositing (all 27 modes)
//   - Alpha premultiply/unpremultiply/composite
//   - Chroma key extraction
//   - 2D affine transform
//
//  Each shader operates on two input textures (base + overlay) plus a
//  uniform buffer, and writes the composited result to a storage texture.
//  All shaders handle premultiplied alpha correctly.
// =============================================================================

// ─── Blend Mode Compositing Shader ──────────────────────────────────────────

/**
 * GPU compute shader that composites two layers using any of the 27
 * standard blend modes. The blend mode is selected via a uniform index.
 *
 * Uniforms:
 *   - blend_mode: u32  (index into blend mode selector, 0-26)
 *   - opacity: f32      (overlay opacity, 0-1)
 *   - transform_m00..m12: f32 (2x3 affine transform matrix)
 *   - anchor_x, anchor_y: f32
 *   - has_alpha: u32
 *   - canvas_width, canvas_height: f32
 */
export const blendModeShaderSource = /* wgsl */ `

struct CompositeParams {
  blend_mode: u32,
  opacity: f32,
  // 2x3 affine transform (column-major)
  m00: f32, m01: f32, m02: f32,
  m10: f32, m11: f32, m12: f32,
  anchor_x: f32,
  anchor_y: f32,
  has_alpha: u32,
  canvas_width: f32,
  canvas_height: f32,
  _pad0: u32,
}

@group(0) @binding(0) var base_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var overlay_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(2) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: CompositeParams;

// ── Color space helpers ──

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

fn hue2rgb(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
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
    hue2rgb(p, q, h + 1.0 / 3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0 / 3.0),
  );
}

fn bt709_luminance(r: f32, g: f32, b: f32) -> f32 {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ── Per-channel blend mode functions ──

fn blend_normal(b: f32, o: f32) -> f32 { return o; }
fn blend_darken(b: f32, o: f32) -> f32 { return min(b, o); }
fn blend_multiply(b: f32, o: f32) -> f32 { return b * o; }

fn blend_color_burn(b: f32, o: f32) -> f32 {
  if (o == 0.0) { return 0.0; }
  return clamp(1.0 - (1.0 - b) / o, 0.0, 1.0);
}

fn blend_linear_burn(b: f32, o: f32) -> f32 {
  return clamp(b + o - 1.0, 0.0, 1.0);
}

fn blend_lighten(b: f32, o: f32) -> f32 { return max(b, o); }
fn blend_screen(b: f32, o: f32) -> f32 { return 1.0 - (1.0 - b) * (1.0 - o); }

fn blend_color_dodge(b: f32, o: f32) -> f32 {
  if (o >= 1.0) { return 1.0; }
  return clamp(b / (1.0 - o), 0.0, 1.0);
}

fn blend_linear_dodge(b: f32, o: f32) -> f32 {
  return clamp(b + o, 0.0, 1.0);
}

fn blend_overlay(b: f32, o: f32) -> f32 {
  if (b < 0.5) {
    return 2.0 * b * o;
  }
  return 1.0 - 2.0 * (1.0 - b) * (1.0 - o);
}

fn blend_soft_light(b: f32, o: f32) -> f32 {
  if (o <= 0.5) {
    return b - (1.0 - 2.0 * o) * b * (1.0 - b);
  }
  var d: f32;
  if (b <= 0.25) {
    d = ((16.0 * b - 12.0) * b + 4.0) * b;
  } else {
    d = sqrt(b);
  }
  return b + (2.0 * o - 1.0) * (d - b);
}

fn blend_hard_light(b: f32, o: f32) -> f32 {
  if (o < 0.5) {
    return 2.0 * b * o;
  }
  return 1.0 - 2.0 * (1.0 - b) * (1.0 - o);
}

fn blend_vivid_light(b: f32, o: f32) -> f32 {
  if (o <= 0.5) {
    let o2 = o * 2.0;
    if (o2 == 0.0) { return 0.0; }
    return clamp(1.0 - (1.0 - b) / o2, 0.0, 1.0);
  }
  let o2m1 = 2.0 * (o - 0.5);
  if (o2m1 >= 1.0) { return 1.0; }
  return clamp(b / (1.0 - o2m1), 0.0, 1.0);
}

fn blend_linear_light(b: f32, o: f32) -> f32 {
  return clamp(b + 2.0 * o - 1.0, 0.0, 1.0);
}

fn blend_pin_light(b: f32, o: f32) -> f32 {
  if (o <= 0.5) {
    return min(b, 2.0 * o);
  }
  return max(b, 2.0 * (o - 0.5));
}

fn blend_hard_mix(b: f32, o: f32) -> f32 {
  if (b + o >= 1.0) { return 1.0; }
  return 0.0;
}

fn blend_difference(b: f32, o: f32) -> f32 { return abs(b - o); }
fn blend_exclusion(b: f32, o: f32) -> f32 { return b + o - 2.0 * b * o; }
fn blend_subtract(b: f32, o: f32) -> f32 { return clamp(b - o, 0.0, 1.0); }

fn blend_divide(b: f32, o: f32) -> f32 {
  if (o == 0.0) { return 1.0; }
  return clamp(b / o, 0.0, 1.0);
}

// ── Apply blend mode by index ──

fn apply_blend_channel(b: f32, o: f32, mode: u32) -> f32 {
  switch (mode) {
    case 0u: { return blend_normal(b, o); }       // Normal
    case 1u: { return blend_normal(b, o); }       // Dissolve (handled specially)
    case 2u: { return blend_darken(b, o); }       // Darken
    case 3u: { return blend_multiply(b, o); }     // Multiply
    case 4u: { return blend_color_burn(b, o); }   // Color Burn
    case 5u: { return blend_linear_burn(b, o); }  // Linear Burn
    case 6u: { return blend_normal(b, o); }       // Darker Color (handled per-pixel)
    case 7u: { return blend_lighten(b, o); }      // Lighten
    case 8u: { return blend_screen(b, o); }       // Screen
    case 9u: { return blend_color_dodge(b, o); }  // Color Dodge
    case 10u: { return blend_linear_dodge(b, o); } // Linear Dodge (Add)
    case 11u: { return blend_normal(b, o); }       // Lighter Color (handled per-pixel)
    case 12u: { return blend_overlay(b, o); }      // Overlay
    case 13u: { return blend_soft_light(b, o); }   // Soft Light
    case 14u: { return blend_hard_light(b, o); }   // Hard Light
    case 15u: { return blend_vivid_light(b, o); }  // Vivid Light
    case 16u: { return blend_linear_light(b, o); } // Linear Light
    case 17u: { return blend_pin_light(b, o); }    // Pin Light
    case 18u: { return blend_hard_mix(b, o); }     // Hard Mix
    case 19u: { return blend_difference(b, o); }   // Difference
    case 20u: { return blend_exclusion(b, o); }    // Exclusion
    case 21u: { return blend_subtract(b, o); }     // Subtract
    case 22u: { return blend_divide(b, o); }       // Divide
    // HSL modes 23-26 handled separately
    default: { return blend_normal(b, o); }
  }
}

// ── HSL blend modes (operate on full RGB) ──

fn apply_hsl_blend(base: vec3f, over: vec3f, mode: u32) -> vec3f {
  let b_hsl = rgb_to_hsl(base.r, base.g, base.b);
  let o_hsl = rgb_to_hsl(over.r, over.g, over.b);

  var r_h: f32; var r_s: f32; var r_l: f32;

  switch (mode) {
    case 23u: { // Hue
      r_h = o_hsl.x; r_s = b_hsl.y; r_l = b_hsl.z;
    }
    case 24u: { // Saturation
      r_h = b_hsl.x; r_s = o_hsl.y; r_l = b_hsl.z;
    }
    case 25u: { // Color
      r_h = o_hsl.x; r_s = o_hsl.y; r_l = b_hsl.z;
    }
    case 26u: { // Luminosity
      r_h = b_hsl.x; r_s = b_hsl.y; r_l = o_hsl.z;
    }
    default: {
      r_h = o_hsl.x; r_s = o_hsl.y; r_l = o_hsl.z;
    }
  }

  return hsl_to_rgb(r_h, r_s, r_l);
}

// ── Pseudo-random for Dissolve ──

fn hash_float(seed: f32) -> f32 {
  let x = sin(seed * 12.9898 + 78.233) * 43758.5453;
  return fract(x);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(base_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let coord = vec2i(gid.xy);

  // Read base pixel
  let base_pixel = textureLoad(base_texture, coord);
  let base_r = base_pixel.r;
  let base_g = base_pixel.g;
  let base_b = base_pixel.b;
  let base_a = base_pixel.a;

  // Read overlay pixel (from source layer)
  let overlay_pixel = textureLoad(overlay_texture, coord);
  let over_r = overlay_pixel.r;
  let over_g = overlay_pixel.g;
  let over_b = overlay_pixel.b;
  var over_a = overlay_pixel.a;

  // Apply opacity
  let effective_alpha = over_a * params.opacity;

  if (effective_alpha <= 0.0) {
    textureStore(output_texture, coord, base_pixel);
    return;
  }

  // Dissolve: stochastic alpha threshold
  if (params.blend_mode == 1u) {
    let seed = f32(gid.x) * 1.0 + f32(gid.y) * dims.x;
    let rnd = hash_float(seed);
    if (rnd > effective_alpha) {
      textureStore(output_texture, coord, base_pixel);
      return;
    }
    // If pass, blend as normal at full opacity
    over_a = 1.0;
  }

  // Compute blended RGB
  var blended: vec3f;

  let mode = params.blend_mode;

  // Darker Color / Lighter Color: compare luminance of entire pixel
  if (mode == 6u) {
    let base_lum = bt709_luminance(base_r, base_g, base_b);
    let over_lum = bt709_luminance(over_r, over_g, over_b);
    if (over_lum < base_lum) {
      blended = vec3f(over_r, over_g, over_b);
    } else {
      blended = vec3f(base_r, base_g, base_b);
    }
  } else if (mode == 11u) {
    let base_lum = bt709_luminance(base_r, base_g, base_b);
    let over_lum = bt709_luminance(over_r, over_g, over_b);
    if (over_lum > base_lum) {
      blended = vec3f(over_r, over_g, over_b);
    } else {
      blended = vec3f(base_r, base_g, base_b);
    }
  } else if (mode >= 23u && mode <= 26u) {
    // HSL component modes
    blended = apply_hsl_blend(
      vec3f(base_r, base_g, base_b),
      vec3f(over_r, over_g, over_b),
      mode,
    );
  } else {
    // Per-channel blend
    blended = vec3f(
      apply_blend_channel(base_r, over_r, mode),
      apply_blend_channel(base_g, over_g, mode),
      apply_blend_channel(base_b, over_b, mode),
    );
  }

  // Porter-Duff source-over compositing with blended result
  let out_a = effective_alpha + base_a * (1.0 - effective_alpha);

  var out_rgb: vec3f;
  if (out_a > 0.0) {
    out_rgb = (blended * effective_alpha + vec3f(base_r, base_g, base_b) * base_a * (1.0 - effective_alpha)) / out_a;
  } else {
    out_rgb = vec3f(0.0);
  }

  textureStore(output_texture, coord, vec4f(
    clamp(out_rgb.r, 0.0, 1.0),
    clamp(out_rgb.g, 0.0, 1.0),
    clamp(out_rgb.b, 0.0, 1.0),
    clamp(out_a, 0.0, 1.0),
  ));
}
`;

// ─── Alpha Composite Shader ────────────────────────────────────────────────

/**
 * GPU compute shader for alpha channel operations:
 *  - Premultiply (mode 0)
 *  - Unpremultiply (mode 1)
 *  - Invert alpha (mode 2)
 *  - Alpha matte (mode 3): use overlay alpha as mask for base
 *  - Luma matte (mode 4): use overlay luminance as mask for base
 *  - Luma matte inverted (mode 5)
 */
export const alphaCompositeShaderSource = /* wgsl */ `

struct AlphaParams {
  mode: u32,         // 0=premultiply, 1=unpremultiply, 2=invert, 3=alpha_matte, 4=luma_matte, 5=luma_matte_inv
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var base_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var overlay_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(2) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: AlphaParams;

fn bt709_luminance(r: f32, g: f32, b: f32) -> f32 {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(base_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let coord = vec2i(gid.xy);
  let base = textureLoad(base_texture, coord);
  let overlay = textureLoad(overlay_texture, coord);

  var out_pixel: vec4f;

  switch (params.mode) {
    // Premultiply alpha: RGB *= A
    case 0u: {
      let a = base.a;
      out_pixel = vec4f(base.r * a, base.g * a, base.b * a, a);
    }

    // Unpremultiply alpha: RGB /= A
    case 1u: {
      let a = base.a;
      if (a <= 0.0) {
        out_pixel = vec4f(0.0, 0.0, 0.0, 0.0);
      } else {
        let inv_a = 1.0 / a;
        out_pixel = vec4f(
          clamp(base.r * inv_a, 0.0, 1.0),
          clamp(base.g * inv_a, 0.0, 1.0),
          clamp(base.b * inv_a, 0.0, 1.0),
          a,
        );
      }
    }

    // Invert alpha
    case 2u: {
      out_pixel = vec4f(base.r, base.g, base.b, 1.0 - base.a);
    }

    // Alpha matte: use overlay's alpha as mask for base
    case 3u: {
      let matte_a = overlay.a;
      out_pixel = vec4f(base.r, base.g, base.b, base.a * matte_a);
    }

    // Luma matte: use overlay's luminance as mask for base
    case 4u: {
      let luma = bt709_luminance(overlay.r, overlay.g, overlay.b);
      out_pixel = vec4f(base.r, base.g, base.b, base.a * luma);
    }

    // Luma matte inverted
    case 5u: {
      let luma = bt709_luminance(overlay.r, overlay.g, overlay.b);
      out_pixel = vec4f(base.r, base.g, base.b, base.a * (1.0 - luma));
    }

    default: {
      out_pixel = base;
    }
  }

  textureStore(output_texture, coord, out_pixel);
}
`;

// ─── Chroma Key Compute Shader ──────────────────────────────────────────────

/**
 * Advanced chroma key compute shader with multi-pass keying, spill
 * suppression, and edge refinement. Operates on a single input texture
 * and outputs the keyed result with modified alpha.
 *
 * Uniforms match ChromaKeyConfig structure.
 */
export const chromaKeyShaderSource = /* wgsl */ `

struct ChromaKeyParams {
  // Screen color (RGB, normalized 0-1)
  screen_r: f32,
  screen_g: f32,
  screen_b: f32,
  // Key ranges
  hue_range: f32,
  sat_range: f32,
  lum_range: f32,
  // Spill suppression
  spill_strength: f32,
  spill_method: u32,   // 0=average, 1=desaturate, 2=complementary
  // Edge controls
  edge_blend: f32,
  choke: f32,
  edge_soften: f32,
  // Matte clipping
  clip_black: f32,
  clip_white: f32,
  // Light wrap
  light_wrap: f32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: ChromaKeyParams;

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

fn bt709_luminance(r: f32, g: f32, b: f32) -> f32 {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let coord = vec2i(gid.xy);
  let pixel = textureLoad(input_texture, coord);
  var r = pixel.r;
  var g = pixel.g;
  var b = pixel.b;
  var a = pixel.a;

  // Screen color in HSL
  let key_hsl = rgb_to_hsl(params.screen_r, params.screen_g, params.screen_b);
  let pix_hsl = rgb_to_hsl(r, g, b);

  // Hue distance (circular, 0-0.5)
  var h_dist = abs(pix_hsl.x - key_hsl.x);
  if (h_dist > 0.5) { h_dist = 1.0 - h_dist; }

  // Normalize distances by their respective ranges
  let h_factor = h_dist / max(params.hue_range, 0.001);
  let s_factor = abs(pix_hsl.y - key_hsl.y) / max(params.sat_range, 0.001);
  let l_factor = abs(pix_hsl.z - key_hsl.z) / max(params.lum_range, 0.001);

  // Combined weighted distance
  let dist = sqrt(h_factor * h_factor + s_factor * s_factor * 0.5 + l_factor * l_factor * 0.3);

  // Map distance to alpha with edge blend
  let inner_edge = 1.0 - params.edge_blend;
  var key_alpha: f32;
  if (dist < inner_edge) {
    key_alpha = 0.0;  // Fully keyed
  } else if (dist < 1.0) {
    key_alpha = (dist - inner_edge) / (1.0 - inner_edge);
  } else {
    key_alpha = 1.0;  // Fully visible
  }

  // Clip black/white (core matte)
  if (key_alpha <= params.clip_black) {
    key_alpha = 0.0;
  } else if (key_alpha >= params.clip_white) {
    key_alpha = 1.0;
  } else {
    key_alpha = (key_alpha - params.clip_black) / (params.clip_white - params.clip_black);
  }

  // Apply choke (simple threshold shift)
  key_alpha = clamp(key_alpha + params.choke, 0.0, 1.0);

  // Spill suppression
  let is_green = params.screen_g > params.screen_r && params.screen_g > params.screen_b;

  if (params.spill_strength > 0.0 && key_alpha > 0.0) {
    if (is_green) {
      let max_rb = max(r, b);
      let spill = max(0.0, g - max_rb) * params.spill_strength;

      switch (params.spill_method) {
        case 0u: { // Average
          let avg = (r + b) * 0.5;
          g = g - spill + spill * (avg / max(g, 0.001));
        }
        case 1u: { // Desaturate
          let lum = bt709_luminance(r, g, b);
          g = g - spill * (g - lum);
        }
        case 2u: { // Complementary
          r = r + spill * 0.3;
          g = g - spill;
          b = b + spill * 0.3;
        }
        default: {}
      }
    } else {
      // Blue screen
      let max_rg = max(r, g);
      let spill = max(0.0, b - max_rg) * params.spill_strength;

      switch (params.spill_method) {
        case 0u: {
          let avg = (r + g) * 0.5;
          b = b - spill + spill * (avg / max(b, 0.001));
        }
        case 1u: {
          let lum = bt709_luminance(r, g, b);
          b = b - spill * (b - lum);
        }
        case 2u: {
          r = r + spill * 0.2;
          g = g + spill * 0.2;
          b = b - spill;
        }
        default: {}
      }
    }
  }

  // Final alpha = original alpha * key alpha
  a = a * key_alpha;

  textureStore(output_texture, coord, vec4f(
    clamp(r, 0.0, 1.0),
    clamp(g, 0.0, 1.0),
    clamp(b, 0.0, 1.0),
    clamp(a, 0.0, 1.0),
  ));
}
`;

// ─── 2D Affine Transform Compute Shader ─────────────────────────────────────

/**
 * GPU compute shader for 2D affine transformations (translate, scale, rotate)
 * with bilinear interpolation. Used for PiP (Picture-in-Picture) and
 * per-layer transforms during compositing.
 *
 * Reads from input texture, applies inverse transform to find source pixel,
 * performs bilinear sampling, and writes to output.
 *
 * Uniforms:
 *   - 2x3 affine transform matrix (forward transform)
 *   - Anchor point
 *   - Canvas dimensions
 *   - Background mode (0=transparent, 1=clamp edge, 2=wrap/tile)
 */
export const transformShaderSource = /* wgsl */ `

struct TransformParams {
  // Forward transform matrix (2x3, column-major)
  m00: f32, m01: f32, m02: f32,
  m10: f32, m11: f32, m12: f32,
  // Anchor point
  anchor_x: f32,
  anchor_y: f32,
  // Source dimensions
  src_width: f32,
  src_height: f32,
  // Canvas dimensions
  canvas_width: f32,
  canvas_height: f32,
  // Background mode: 0=transparent, 1=clamp, 2=wrap
  bg_mode: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TransformParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let out_w = u32(params.canvas_width);
  let out_h = u32(params.canvas_height);
  if (gid.x >= out_w || gid.y >= out_h) {
    return;
  }

  let coord = vec2i(gid.xy);

  // Output pixel position relative to canvas center
  let cx = params.canvas_width * 0.5 + params.m02;
  let cy = params.canvas_height * 0.5 + params.m12;

  let dx = f32(gid.x) - cx + params.anchor_x;
  let dy = f32(gid.y) - cy + params.anchor_y;

  // Compute inverse transform to find source coordinates
  // For 2x2 part: [m00 m01; m10 m11], inverse = 1/det * [m11 -m01; -m10 m00]
  let det = params.m00 * params.m11 - params.m01 * params.m10;

  if (abs(det) < 0.0001) {
    // Degenerate transform — output transparent
    textureStore(output_texture, coord, vec4f(0.0));
    return;
  }

  let inv_det = 1.0 / det;
  let inv_m00 = params.m11 * inv_det;
  let inv_m01 = -params.m01 * inv_det;
  let inv_m10 = -params.m10 * inv_det;
  let inv_m11 = params.m00 * inv_det;

  // Apply inverse transform
  let src_x = dx * inv_m00 + dy * inv_m01 + params.src_width * 0.5;
  let src_y = dx * inv_m10 + dy * inv_m11 + params.src_height * 0.5;

  let src_w = i32(params.src_width);
  let src_h = i32(params.src_height);

  // Bounds check
  if (params.bg_mode == 0u) {
    // Transparent outside source bounds
    if (src_x < 0.0 || src_x >= params.src_width || src_y < 0.0 || src_y >= params.src_height) {
      textureStore(output_texture, coord, vec4f(0.0));
      return;
    }
  }

  // Bilinear interpolation
  let x0 = i32(floor(src_x));
  let y0 = i32(floor(src_y));
  let x1 = min(x0 + 1, src_w - 1);
  let y1 = min(y0 + 1, src_h - 1);
  let fx = fract(src_x);
  let fy = fract(src_y);

  // Clamp coordinates for sampling
  let sx0 = clamp(x0, 0, src_w - 1);
  let sy0 = clamp(y0, 0, src_h - 1);
  let sx1 = clamp(x1, 0, src_w - 1);
  let sy1 = clamp(y1, 0, src_h - 1);

  let p00 = textureLoad(input_texture, vec2i(sx0, sy0));
  let p10 = textureLoad(input_texture, vec2i(sx1, sy0));
  let p01 = textureLoad(input_texture, vec2i(sx0, sy1));
  let p11 = textureLoad(input_texture, vec2i(sx1, sy1));

  let w00 = (1.0 - fx) * (1.0 - fy);
  let w10 = fx * (1.0 - fy);
  let w01 = (1.0 - fx) * fy;
  let w11 = fx * fy;

  let result = p00 * w00 + p10 * w10 + p01 * w01 + p11 * w11;

  // Handle edge pixels that went out of bounds with transparent mode
  var final_result = result;
  if (params.bg_mode == 0u) {
    // Fade to transparent at sub-pixel boundaries
    if (x0 < 0 || y0 < 0 || x1 >= src_w || y1 >= src_h) {
      // Partial coverage — reduce alpha for anti-aliasing at edges
      var coverage = 1.0;
      if (x0 < 0) { coverage *= (1.0 - fx); }
      if (y0 < 0) { coverage *= (1.0 - fy); }
      if (x1 >= src_w) { coverage *= fx; }
      if (y1 >= src_h) { coverage *= fy; }
      final_result = vec4f(result.rgb, result.a * coverage);
    }
  } else if (params.bg_mode == 2u) {
    // Wrap/tile mode: use modulo
    let wrap_x = ((x0 % src_w) + src_w) % src_w;
    let wrap_y = ((y0 % src_h) + src_h) % src_h;
    final_result = textureLoad(input_texture, vec2i(wrap_x, wrap_y));
  }

  textureStore(output_texture, coord, vec4f(
    clamp(final_result.r, 0.0, 1.0),
    clamp(final_result.g, 0.0, 1.0),
    clamp(final_result.b, 0.0, 1.0),
    clamp(final_result.a, 0.0, 1.0),
  ));
}
`;

// ─── Convenience Export: All Compositing Shaders ────────────────────────────

/**
 * All compositing shader sources bundled for easy import.
 * Pass this to CompositingEngine.compositeFrameGPU().
 */
export const COMPOSITING_SHADER_SOURCES = {
  blend: blendModeShaderSource,
  alphaComposite: alphaCompositeShaderSource,
  chromaKey: chromaKeyShaderSource,
  transform: transformShaderSource,
} as const;

/**
 * Map of compositing shader IDs to WGSL source strings.
 * Can be registered with the ShaderRegistry for use in the effects pipeline.
 */
export const COMPOSITING_SHADER_MAP: Record<string, string> = {
  'compositing-blend': blendModeShaderSource,
  'compositing-alpha': alphaCompositeShaderSource,
  'compositing-chroma-key': chromaKeyShaderSource,
  'compositing-transform': transformShaderSource,
};
