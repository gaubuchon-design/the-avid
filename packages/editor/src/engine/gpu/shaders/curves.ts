// ═══════════════════════════════════════════════════════════════════════════
//  WGSL Compute Shader: Curves
//  Quadratic bezier curve adjustment per channel via shadow/midtone/highlight
//  control points.
// ═══════════════════════════════════════════════════════════════════════════

export const shaderSource = /* wgsl */ `

struct CurvesParams {
  channel: u32,      // 0 = RGB, 1 = R, 2 = G, 3 = B
  shadows: f32,      // -1 to 1 (control point at t=0)
  midtones: f32,     // -1 to 1 (control point at t=0.5)
  highlights: f32,   // -1 to 1 (control point at t=1)
}

@group(0) @binding(0) var input_texture: texture_storage_2d<rgba8unorm, read>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: CurvesParams;

// Evaluate quadratic bezier: P0=(0, shadows), P1=(0.5, 0.5+midtones), P2=(1, 1+highlights)
// Remap so the curve maps 0->0 and 1->1 when adjustments are zero.
fn eval_curve(t: f32) -> f32 {
  // Control points for the bezier curve offset
  let p0 = params.shadows;        // offset at shadows (x=0)
  let p1 = params.midtones;       // offset at midtones (x=0.5)
  let p2 = params.highlights;     // offset at highlights (x=1)

  // Quadratic bezier: B(t) = (1-t)^2*p0 + 2*(1-t)*t*p1 + t^2*p2
  let one_minus_t = 1.0 - t;
  let offset = one_minus_t * one_minus_t * p0
             + 2.0 * one_minus_t * t * p1
             + t * t * p2;

  return clamp(t + offset, 0.0, 1.0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dims = textureDimensions(input_texture);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  let pixel = textureLoad(input_texture, vec2i(gid.xy));
  var r = pixel.r;
  var g = pixel.g;
  var b = pixel.b;

  // Apply curve to selected channel(s)
  if (params.channel == 0u || params.channel == 1u) {
    r = eval_curve(r);
  }
  if (params.channel == 0u || params.channel == 2u) {
    g = eval_curve(g);
  }
  if (params.channel == 0u || params.channel == 3u) {
    b = eval_curve(b);
  }

  textureStore(output_texture, vec2i(gid.xy), vec4f(r, g, b, pixel.a));
}
`;
