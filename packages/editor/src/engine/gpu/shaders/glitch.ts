// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Glitch
//  Digital glitch effect: block displacement, RGB split, and scanlines.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct GlitchParams {
  amount: f32,        // overall intensity (0-100)
  block_size: f32,    // glitch block height in pixels (2-100)
  rgb_split: f32,     // RGB channel offset in pixels (0-50)
  scanlines: u32,     // 0 = off, 1 = on
  seed: u32,          // random seed (for variation)
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: GlitchParams;

fn pcg_hash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) / 4294967295.0;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let strength = params.amount / 100.0;
  if (strength <= 0.0) {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let block_h = max(u32(params.block_size), 2u);
  let block_row = gid.y / block_h;

  // Per-block random displacement
  let block_seed = block_row * 7919u + params.seed;
  let block_rand = rand_float(block_seed);
  let should_glitch = block_rand < strength * 0.5;

  var offset_x = 0;
  if (should_glitch) {
    let disp_rand = rand_float(block_seed + 1u);
    offset_x = i32((disp_rand - 0.5) * 2.0 * params.amount);
  }

  // Sample with block displacement
  let src_x = clamp(i32(gid.x) + offset_x, 0, i32(dims.x) - 1);

  // RGB channel splitting
  let split = i32(params.rgb_split * strength);
  let rx = clamp(src_x + split, 0, i32(dims.x) - 1);
  let gx = src_x;
  let bx = clamp(src_x - split, 0, i32(dims.x) - 1);

  let r_pixel = textureLoad(input_texture, vec2i(rx, i32(gid.y)));
  let g_pixel = textureLoad(input_texture, vec2i(gx, i32(gid.y)));
  let b_pixel = textureLoad(input_texture, vec2i(bx, i32(gid.y)));

  var r = r_pixel.r;
  var g = g_pixel.g;
  var b = b_pixel.b;
  let a = g_pixel.a;

  // Scanline darkening
  if (params.scanlines != 0u) {
    let scanline = f32(gid.y % 2u);
    let darken = 1.0 - scanline * 0.15 * strength;
    r *= darken;
    g *= darken;
    b *= darken;
  }

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), a));
}
`;
