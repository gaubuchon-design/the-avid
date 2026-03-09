// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Halftone
//  Rotated grid halftone pattern with configurable dot shape.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct HalftoneParams {
  dot_size: f32,     // size of halftone cells in pixels (2-50)
  angle: f32,        // rotation angle in degrees (0-360)
  shape: u32,        // 0 = circle, 1 = square, 2 = diamond
  _pad: u32,
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: HalftoneParams;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  let cell_size = max(params.dot_size, 2.0);

  // Rotate coordinates
  let rad = params.angle * 3.14159265 / 180.0;
  let cos_a = cos(rad);
  let sin_a = sin(rad);

  let px = f32(gid.x);
  let py = f32(gid.y);

  // Rotate into grid space
  let rx = px * cos_a + py * sin_a;
  let ry = -px * sin_a + py * cos_a;

  // Find cell center
  let cell_x = floor(rx / cell_size) * cell_size + cell_size * 0.5;
  let cell_y = floor(ry / cell_size) * cell_size + cell_size * 0.5;

  // Distance from cell center (in rotated space)
  let dx = rx - cell_x;
  let dy = ry - cell_y;

  // Sample luminance at cell center (rotate back to image space)
  let img_x = i32(round(cell_x * cos_a - cell_y * sin_a));
  let img_y = i32(round(cell_x * sin_a + cell_y * cos_a));

  var luma: f32;
  if (img_x >= 0 && img_x < i32(dims.x) && img_y >= 0 && img_y < i32(dims.y)) {
    let sample = textureLoad(input_texture, vec2i(img_x, img_y));
    luma = 0.2126 * sample.r + 0.7152 * sample.g + 0.0722 * sample.b;
  } else {
    luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
  }

  // Dot radius based on luminance (brighter = smaller dot for print-style)
  let max_radius = cell_size * 0.5;
  let dot_radius = max_radius * (1.0 - luma);

  // Distance metric based on shape
  var dist: f32;
  if (params.shape == 0u) {
    // Circle
    dist = sqrt(dx * dx + dy * dy);
  } else if (params.shape == 1u) {
    // Square
    dist = max(abs(dx), abs(dy));
  } else {
    // Diamond
    dist = abs(dx) + abs(dy);
  }

  // Inside / outside dot
  var out_luma: f32;
  if (dist <= dot_radius) {
    out_luma = 0.0; // ink
  } else {
    out_luma = 1.0; // paper
  }

  textureStore(output_texture, vec2i(gid.xy),
    vec4f(out_luma, out_luma, out_luma, pixel.a));
}
`;
