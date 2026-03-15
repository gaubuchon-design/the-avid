// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Radial Blur
//  Spin (rotational) and zoom (radial) blur from a center point.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct RadialBlurParams {
  amount: f32,        // blur strength (0-100)
  blur_type: u32,     // 0 = spin, 1 = zoom
  center_x: f32,      // center X (0-1, normalized)
  center_y: f32,      // center Y (0-1, normalized)
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: RadialBlurParams;

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

  let cx = params.center_x * f32(dims.x);
  let cy = params.center_y * f32(dims.y);
  let px = f32(gid.x);
  let py = f32(gid.y);

  let dx = px - cx;
  let dy = py - cy;
  let dist = sqrt(dx * dx + dy * dy);

  let samples = 16;
  var accum = vec4f(0.0, 0.0, 0.0, 0.0);
  var count = 0.0;

  for (var i = 0; i < samples; i++) {
    let t = (f32(i) / f32(samples - 1) - 0.5) * strength;
    var sx: f32;
    var sy: f32;

    if (params.blur_type == 0u) {
      // Spin: rotate around center
      let angle = t * 0.1; // scale rotation
      let cos_a = cos(angle);
      let sin_a = sin(angle);
      sx = cx + dx * cos_a - dy * sin_a;
      sy = cy + dx * sin_a + dy * cos_a;
    } else {
      // Zoom: sample along radial line from center
      let scale = 1.0 + t * 0.1;
      sx = cx + dx * scale;
      sy = cy + dy * scale;
    }

    let ix = i32(round(sx));
    let iy = i32(round(sy));

    if (ix >= 0 && ix < i32(dims.x) && iy >= 0 && iy < i32(dims.y)) {
      accum += textureLoad(input_texture, vec2i(ix, iy));
      count += 1.0;
    }
  }

  if (count > 0.0) {
    textureStore(output_texture, vec2i(gid.xy), accum / count);
  } else {
    let pixel = textureLoad(input_texture, vec2i(gid.xy));
    textureStore(output_texture, vec2i(gid.xy), pixel);
  }
}
`;
