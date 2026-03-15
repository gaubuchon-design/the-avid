// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Film Grain
//  Pseudo-random noise generator seeded by frame number.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct FilmGrainParams {
  amount: f32,      // 0-100
  size: f32,        // 0.5-5 (grain size factor)
  softness: f32,    // 0-100
  seed: u32,        // frame number (0 = static grain)
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: FilmGrainParams;

// Hash function for pseudo-random noise
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

  let pixel = textureLoad(input_texture, vec2i(gid.xy));

  if (params.amount <= 0.0) {
    textureStore(output_texture, vec2i(gid.xy), pixel);
    return;
  }

  let intensity = (params.amount / 100.0) * 0.235; // max ~60/255 levels of noise

  // Scale coordinates by inverse grain size for larger grain
  let grain_x = u32(f32(gid.x) / max(params.size, 0.5));
  let grain_y = u32(f32(gid.y) / max(params.size, 0.5));

  // Hash based on position + seed for animated grain
  let hash_input = grain_x + grain_y * dims.x + params.seed * 1000003u;
  let noise = (rand_float(hash_input) - 0.5) * 2.0 * intensity;

  // Softness reduces effect
  let blend = 1.0 - (params.softness / 100.0) * 0.5;

  let final_noise = noise * blend;

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(
      clamp(pixel.r + final_noise, 0.0, 1.0),
      clamp(pixel.g + final_noise, 0.0, 1.0),
      clamp(pixel.b + final_noise, 0.0, 1.0),
      pixel.a,
    ));
}
`;
