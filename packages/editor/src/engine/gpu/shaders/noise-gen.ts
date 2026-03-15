// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Noise Generator
//  PCG hash-based pseudo-random noise overlay (gaussian or uniform).
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct NoiseParams {
  amount: f32,        // noise strength (0-100)
  noise_type: u32,    // 0 = gaussian, 1 = uniform
  colored: u32,       // 0 = monochrome, 1 = per-channel color noise
  seed: u32,          // random seed (for animation / variation)
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: NoiseParams;

// PCG hash for high-quality pseudo-random numbers
fn pcg_hash(input: u32) -> u32 {
  var state = input * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand_float(seed: u32) -> f32 {
  return f32(pcg_hash(seed)) / 4294967295.0;
}

// Box-Muller transform for gaussian distribution
fn rand_gaussian(seed1: u32, seed2: u32) -> f32 {
  let u1 = max(rand_float(seed1), 0.0001); // avoid log(0)
  let u2 = rand_float(seed2);
  return sqrt(-2.0 * log(u1)) * cos(6.28318530 * u2);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  if (params.amount <= 0.0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let intensity = params.amount / 100.0 * 0.5;
  let base_seed = gid.x + gid.y * dims.x + params.seed * 1000003u;

  var noise_r: f32;
  var noise_g: f32;
  var noise_b: f32;

  if (params.noise_type == 0u) {
    // Gaussian noise
    noise_r = rand_gaussian(base_seed, base_seed + 1u) * intensity;
    if (params.colored != 0u) {
      noise_g = rand_gaussian(base_seed + 2u, base_seed + 3u) * intensity;
      noise_b = rand_gaussian(base_seed + 4u, base_seed + 5u) * intensity;
    } else {
      noise_g = noise_r;
      noise_b = noise_r;
    }
  } else {
    // Uniform noise
    noise_r = (rand_float(base_seed) - 0.5) * 2.0 * intensity;
    if (params.colored != 0u) {
      noise_g = (rand_float(base_seed + 1u) - 0.5) * 2.0 * intensity;
      noise_b = (rand_float(base_seed + 2u) - 0.5) * 2.0 * intensity;
    } else {
      noise_g = noise_r;
      noise_b = noise_r;
    }
  }

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(
      clamp(pixel.r + noise_r, 0.0, 1.0),
      clamp(pixel.g + noise_g, 0.0, 1.0),
      clamp(pixel.b + noise_b, 0.0, 1.0),
      pixel.a,
    ));
}
`;
