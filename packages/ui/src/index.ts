// @mcua/ui — Design tokens, hooks, and utilities for The Avid UI
// v0.2.0

// ── Theme Tokens ─────────────────────────────────────────────────────────────
export {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  motion,
  zIndex,
  layout,
  breakpoints,
  theme,
} from './theme/tokens';

export type {
  Theme,
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
  Motion,
  ZIndex,
  Layout,
  Breakpoints,
} from './theme/tokens';

// ── Hooks ────────────────────────────────────────────────────────────────────
export { useTimeline } from './hooks/useTimeline';
export type { UseTimelineReturn, UseTimelineOptions } from './hooks/useTimeline';

export { useMediaPlayer } from './hooks/useMediaPlayer';
export type { UseMediaPlayerReturn, UseMediaPlayerOptions } from './hooks/useMediaPlayer';
