// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Turbulent Displace
//  Perlin noise-based displacement map for organic distortion effects.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct TurbulentDisplaceParams {
  amount: f32,          // displacement strength in pixels (0-200)
  size: f32,            // noise scale (1-500)
  complexity: f32,      // octave count as float (1-6)
  evolution: f32,       // animation phase (0-360)
  displace_type: u32,   // 0 = turbulent, 1 = bulge, 2 = twist
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: TurbulentDisplaceParams;

// Hash function for gradient noise
fn hash2(p: vec2f) -> vec2f {
  var q = vec2f(
    dot(p, vec2f(127.1, 311.7)),
    dot(p, vec2f(269.5, 183.3)),
  );
  return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}

// 2D gradient noise
fn gradient_noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);

  // Smooth interpolation
  let u = f * f * (3.0 - 2.0 * f);

  let n00 = dot(hash2(i + vec2f(0.0, 0.0)), f - vec2f(0.0, 0.0));
  let n10 = dot(hash2(i + vec2f(1.0, 0.0)), f - vec2f(1.0, 0.0));
  let n01 = dot(hash2(i + vec2f(0.0, 1.0)), f - vec2f(0.0, 1.0));
  let n11 = dot(hash2(i + vec2f(1.0, 1.0)), f - vec2f(1.0, 1.0));

  let nx0 = mix(n00, n10, u.x);
  let nx1 = mix(n01, n11, u.x);
  return mix(nx0, nx1, u.y);
}

// Fractal Brownian Motion (turbulence)
fn fbm(p: vec2f, octaves: i32) -> f32 {
  var value = 0.0;
  var amplitude = 0.5;
  var freq = 1.0;
  var pos = p;

  for (var i = 0; i < octaves; i++) {
    value += amplitude * gradient_noise(pos * freq);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  if (params.amount <= 0.0) {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let scale = max(params.size, 1.0);
  let octaves = i32(clamp(params.complexity, 1.0, 6.0));
  let phase = params.evolution * 3.14159265 / 180.0;

  // Noise coordinates
  let nx = f32(gid.x) / scale;
  let ny = f32(gid.y) / scale;

  var disp_x: f32;
  var disp_y: f32;

  if (params.displace_type == 0u) {
    // Turbulent: independent X/Y noise
    disp_x = fbm(vec2f(nx + phase, ny), octaves) * params.amount;
    disp_y = fbm(vec2f(nx, ny + phase + 100.0), octaves) * params.amount;
  } else if (params.displace_type == 1u) {
    // Bulge: radial displacement from center
    let cx = f32(dims.x) * 0.5;
    let cy = f32(dims.y) * 0.5;
    let dx = f32(gid.x) - cx;
    let dy = f32(gid.y) - cy;
    let noise_val = fbm(vec2f(nx + phase, ny), octaves);
    let dist = sqrt(dx * dx + dy * dy) + 0.001;
    disp_x = (dx / dist) * noise_val * params.amount;
    disp_y = (dy / dist) * noise_val * params.amount;
  } else {
    // Twist: angular displacement
    let cx = f32(dims.x) * 0.5;
    let cy = f32(dims.y) * 0.5;
    let dx = f32(gid.x) - cx;
    let dy = f32(gid.y) - cy;
    let noise_val = fbm(vec2f(nx + phase, ny), octaves);
    let angle_offset = noise_val * params.amount * 0.01;
    let cos_a = cos(angle_offset);
    let sin_a = sin(angle_offset);
    disp_x = dx * cos_a - dy * sin_a - dx;
    disp_y = dx * sin_a + dy * cos_a - dy;
  }

  let src_x = i32(round(f32(gid.x) + disp_x));
  let src_y = i32(round(f32(gid.y) + disp_y));

  if (src_x >= 0 && src_x < i32(dims.x) && src_y >= 0 && src_y < i32(dims.y)) {
    let pixel = textureLoad(input_texture, vec2i(src_x, src_y));
    textureStore(output_texture, vec2i(gid.xy), pixel);
  } else {
    textureStore(output_texture, vec2i(gid.xy), vec4f(0.0, 0.0, 0.0, 0.0));
  }
}
`;
