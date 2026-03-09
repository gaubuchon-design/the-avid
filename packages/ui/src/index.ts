// ═══════════════════════════════════════════════════════════════════════════
//  @mcua/ui — UI Package Barrel Export
//
//  Re-exports theme tokens, utilities, and shared React hooks.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Theme System ─────────────────────────────────────────────────────────
export {
  // Token collections
  brand,
  palette,
  surfaceDark,
  surfaceLight,
  textDark,
  textLight,
  borderDark,
  borderLight,
  shadowDark,
  shadowLight,
  typography,
  spacing,
  borderRadius,
  layout,
  motion,
  zIndex,
  // Assembled theme object
  theme,
  // Utility functions
  cssVar,
  getSurfaces,
  getTextColors,
  getBorders,
  getShadows,
} from './theme/tokens';

export type { Theme, ThemeMode } from './theme/tokens';

// ─── Hooks ────────────────────────────────────────────────────────────────
export { useTimeline } from './hooks/useTimeline';
export type { UseTimelineReturn, UseTimelineOptions } from './hooks/useTimeline';

export { useMediaPlayer } from './hooks/useMediaPlayer';
export type { UseMediaPlayerReturn, UseMediaPlayerOptions } from './hooks/useMediaPlayer';
