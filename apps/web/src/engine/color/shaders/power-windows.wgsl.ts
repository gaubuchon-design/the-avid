// =============================================================================
//  WGSL Compute Shader: Power Windows (Shape-Based Isolation)
//  Circle, Linear, Polygon, Gradient masks with softness.
// =============================================================================

export const powerWindowShader = /* wgsl */ `

struct WindowParams {
  // Shape type: 0=circle, 1=linear, 2=polygon, 3=gradient
  shape_type: u32,
  // Common: center position (normalized 0..1)
  center_x: f32,
  center_y: f32,
  // Rotation in radians
  rotation: f32,
  // Circle: radii (normalized)
  radius_x: f32,
  radius_y: f32,
  // Linear: width/height of rectangle
  width: f32,
  height: f32,
  // Softness (0..1)
  softness: f32,
  // Invert
  invert: u32,
  // Gradient: angle (radians) and transition width
  gradient_angle: f32,
  gradient_width: f32,
}

@group(0) @binding(0) var matte_in: texture_storage_2d<r32float, read>;
@group(0) @binding(1) var matte_out: texture_storage_2d<r32float, write>;
@group(0) @binding(2) var<uniform> params: WindowParams;

fn rotate_point(px: f32, py: f32, cx: f32, cy: f32, angle: f32) -> vec2f {
  let dx = px - cx;
  let dy = py - cy;
  let cos_a = cos(angle);
  let sin_a = sin(angle);
  return vec2f(
    cos_a * dx - sin_a * dy + cx,
    sin_a * dx + cos_a * dy + cy,
  );
}

fn circle_mask(uv: vec2f) -> f32 {
  let p = rotate_point(uv.x, uv.y, params.center_x, params.center_y, -params.rotation);
  let dx = (p.x - params.center_x) / max(params.radius_x, 0.001);
  let dy = (p.y - params.center_y) / max(params.radius_y, 0.001);
  let dist = sqrt(dx * dx + dy * dy);
  let soft = max(params.softness, 0.001);
  return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, dist);
}

fn linear_mask(uv: vec2f) -> f32 {
  let p = rotate_point(uv.x, uv.y, params.center_x, params.center_y, -params.rotation);
  let dx = abs(p.x - params.center_x) / max(params.width * 0.5, 0.001);
  let dy = abs(p.y - params.center_y) / max(params.height * 0.5, 0.001);
  let dist = max(dx, dy);
  let soft = max(params.softness, 0.001);
  return 1.0 - smoothstep(1.0 - soft, 1.0 + soft, dist);
}

fn gradient_mask(uv: vec2f) -> f32 {
  let cos_a = cos(params.gradient_angle);
  let sin_a = sin(params.gradient_angle);
  let dx = uv.x - params.center_x;
  let dy = uv.y - params.center_y;
  let proj = cos_a * dx + sin_a * dy;
  let w = max(params.gradient_width, 0.001);
  return smoothstep(-w * 0.5, w * 0.5, proj);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(matte_in);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let uv = vec2f(f32(gid.x) / f32(dims.x), f32(gid.y) / f32(dims.y));

  var mask: f32;
  switch params.shape_type {
    case 0u: { mask = circle_mask(uv); }
    case 1u: { mask = linear_mask(uv); }
    case 3u: { mask = gradient_mask(uv); }
    default: { mask = 1.0; }  // polygon handled separately
  }

  if (params.invert != 0u) {
    mask = 1.0 - mask;
  }

  // Multiply with existing matte (qualifier * window = final matte)
  let existing = textureLoad(matte_in, vec2i(gid.xy)).r;
  let combined = existing * mask;

  textureStore(matte_out, vec2i(gid.xy), vec4f(combined, 0.0, 0.0, 0.0));
}
`;
