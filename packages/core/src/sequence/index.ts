// ─── Sequence Package — Barrel Export ────────────────────────────────────────
// Re-exports sequence processing engines:
//   - Frame Rate Mixer (FT-07)
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Constants
  STANDARD_FRAME_RATES,
  FRAME_RATE_PRESETS,

  // Types
  type ConformMethod,
  type MismatchSeverity,
  type ClipFrameRateIndicator,
  type FrameRateMismatchWarning,
  type ConformOptions,
  type ConformResult,
  type FrameRateSummary,

  // Classes
  FrameRateMixer,
  FrameRateMixerError,
} from './FrameRateMixer';
