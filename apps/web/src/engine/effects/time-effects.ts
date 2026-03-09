// =============================================================================
//  Boris FX Time Effects (Stubs)
//  Optical Flow Slowmo, Frame Interpolation
//  These require multi-frame buffer access and are stubbed for now.
// =============================================================================

// ─── Optical Flow Slow Motion ────────────────────────────────────────────────

/**
 * Optical flow-based slow motion effect.
 *
 * STUB: This effect requires access to a multi-frame buffer and optical flow
 * computation which cannot be performed on a single frame. Returns the input
 * ImageData unmodified. Full implementation would involve:
 *   1. Computing optical flow between adjacent frames
 *   2. Synthesizing intermediate frames via motion-compensated interpolation
 *   3. Outputting frames at the reduced speed
 *
 * @param imageData        Source image — returned unmodified
 * @param _speed           10-100% — target playback speed
 * @param _quality         'draft' | 'normal' | 'high'
 * @param _motionEstimation 'block' | 'optical-flow'
 * @returns The input ImageData unchanged
 */
export function applyOpticalFlowSlowmo(
  imageData: ImageData,
  _speed?: number,
  _quality?: string,
  _motionEstimation?: string,
): ImageData {
  // Stub: multi-frame time effects require a frame buffer pipeline.
  // The PlaybackEngine should handle speed changes and frame interpolation
  // by managing a circular buffer of decoded frames.
  return imageData;
}

// ─── Frame Interpolation ─────────────────────────────────────────────────────

/**
 * Frame interpolation to increase temporal resolution.
 *
 * STUB: This effect requires access to a multi-frame buffer and motion
 * estimation. Returns the input ImageData unmodified. Full implementation
 * would involve:
 *   1. Analyzing motion between source frames
 *   2. Generating intermediate frames via warping and blending
 *   3. Outputting at the target frame rate
 *
 * @param imageData  Source image — returned unmodified
 * @param _targetFps '24' | '30' | '48' | '60' | '120'
 * @param _quality   'draft' | 'normal' | 'high'
 * @returns The input ImageData unchanged
 */
export function applyFrameInterpolation(
  imageData: ImageData,
  _targetFps?: string,
  _quality?: string,
): ImageData {
  // Stub: frame interpolation requires frame-pair access.
  // Implementation would use the PlaybackEngine's frame buffer to
  // synthesize intermediate frames.
  return imageData;
}
