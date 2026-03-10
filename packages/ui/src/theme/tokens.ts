// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Design Tokens (TypeScript source of truth)
//
//  These tokens power the CSS custom-property layer defined in
//  apps/web/src/styles/design-system.css.  Any value referenced as a
//  var(--<name>) in the CSS MUST have a corresponding entry here so the
//  two remain in lockstep.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Brand Colors ────────────────────────────────────────────────────────────

export const brand = {
  50:  '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
} as const;

// ─── Palette ─────────────────────────────────────────────────────────────────
// Maps directly to the CSS custom properties used in design-system.css

export const palette = {
  brand:        '#6d4cfa',
  brandBright:  '#9b7dff',
  brandDim:     'rgba(109,76,250,0.18)',
  accent:       '#7c5cfc',
  accentDim:    '#5a3fd4',
  accentGlow:   'rgba(124,92,252,0.3)',
  accentMuted:  'rgba(124,92,252,0.14)',

  // Track lane colors
  trackVideo:   '#4f63f5',
  trackAudio:   '#25a865',
  trackEffect:  '#d4873a',
  trackSub:     '#5ab8d9',
  trackGfx:     '#c94f84',

  // Playhead
  playhead:     '#ff3b3b',

  // Semantic / status
  success:      '#22c55e',
  warning:      '#f59e0b',
  error:        '#ef4444',
  info:         '#3b82f6',

  // AI
  aiAccent:     '#00D4AA',
  aiAccentDim:  'rgba(0,212,170,0.15)',
} as const;

// ─── Surface / Background (dark-first for NLE) ──────────────────────────────

export const surfaceDark = {
  void:      '#000000',
  canvas:    '#050508',
  base:      '#0a0a10',
  surface:   '#0e0e1a',
  raised:    '#141420',
  elevated:  '#1a1a2e',
  overlay:   '#222240',
  hover:     'rgba(255,255,255,0.05)',
  active:    'rgba(255,255,255,0.09)',
} as const;

export const surfaceLight = {
  void:      '#f5f5f8',
  canvas:    '#ebebf0',
  base:      '#e2e2ea',
  surface:   '#ffffff',
  raised:    '#f8f8fc',
  elevated:  '#ffffff',
  overlay:   '#e8e8f0',
  hover:     'rgba(0,0,0,0.04)',
  active:    'rgba(0,0,0,0.07)',
} as const;

// ─── Text ────────────────────────────────────────────────────────────────────

export const textDark = {
  primary:   '#e0e6ef',
  secondary: '#8a9cb5',
  tertiary:  '#556880',
  muted:     '#384a5e',
  disabled:  '#263344',
  accent:    '#9b7dff',
  onBrand:   '#ffffff',
} as const;

export const textLight = {
  primary:   '#1a1a2e',
  secondary: '#4a5568',
  tertiary:  '#718096',
  muted:     '#a0aec0',
  disabled:  '#cbd5e0',
  accent:    '#6d4cfa',
  onBrand:   '#ffffff',
} as const;

// ─── Borders ─────────────────────────────────────────────────────────────────

export const borderDark = {
  default:  'rgba(255,255,255,0.08)',
  subtle:   'rgba(255,255,255,0.04)',
  strong:   'rgba(255,255,255,0.14)',
  accent:   'rgba(109,76,250,0.4)',
  focus:    '#6d4cfa',
} as const;

export const borderLight = {
  default:  'rgba(0,0,0,0.1)',
  subtle:   'rgba(0,0,0,0.04)',
  strong:   'rgba(0,0,0,0.16)',
  accent:   'rgba(109,76,250,0.3)',
  focus:    '#6d4cfa',
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadowDark = {
  sm:     '0 1px 3px rgba(0,0,0,0.4)',
  md:     '0 4px 12px rgba(0,0,0,0.5)',
  lg:     '0 8px 24px rgba(0,0,0,0.6)',
  brand:  '0 0 16px rgba(109,76,250,0.3)',
  accent: '0 0 0 1px rgba(124,92,252,0.4)',
} as const;

export const shadowLight = {
  sm:     '0 1px 3px rgba(0,0,0,0.08)',
  md:     '0 4px 12px rgba(0,0,0,0.12)',
  lg:     '0 8px 24px rgba(0,0,0,0.15)',
  brand:  '0 0 16px rgba(109,76,250,0.15)',
  accent: '0 0 0 1px rgba(124,92,252,0.25)',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    ui:      "'DM Sans', 'Inter', system-ui, sans-serif",
    display: "'Syne', sans-serif",
    mono:    "'DM Mono', 'JetBrains Mono', 'Fira Code', monospace",
  },

  fontSize: {
    '2xs':  '9px',
    xs:     '10px',
    sm:     '11px',
    base:   '12px',
    md:     '13px',
    lg:     '14px',
    xl:     '16px',
    '2xl':  '18px',
    '3xl':  '24px',
  },
  fontWeight: {
    light:    300,
    regular:  400,
    medium:   500,
    semibold: 600,
    bold:     700,
    extrabold: 800,
  },
  lineHeight: {
    tight:   1.2,
    normal:  1.4,
    relaxed: 1.6,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const spacing = {
  0:  '0',
  px: '1px',
  0.5: '2px',
  1:  '4px',
  1.5: '6px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────

export const borderRadius = {
  xs:   '3px',
  sm:   '4px',
  md:   '6px',
  lg:   '10px',
  xl:   '12px',
  full: '9999px',
} as const;

// ─── Layout ──────────────────────────────────────────────────────────────────

export const layout = {
  toolbarH:    '44px',
  binW:        '260px',
  inspectorW:  '280px',
  timelineH:   '260px',
  trackH:      '38px',
  statusbarH:  '24px',
  rulerH:      '24px',
  trackHdrW:   '148px',
} as const;

// ─── Motion / Animation ──────────────────────────────────────────────────────

export const motion = {
  easing: {
    snap:   'cubic-bezier(0.2, 0, 0, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    ease:   'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  duration: {
    fast: '75ms',
    mid:  '150ms',
    slow: '260ms',
  },
} as const;

// ─── Z-Index Scale ───────────────────────────────────────────────────────────

export const zIndex = {
  base:      0,
  dropdown:  10,
  sticky:    20,
  overlay:   30,
  modal:     40,
  popover:   50,
  tooltip:   60,
  commandPalette: 70,
  toast:     80,
  max:       9999,
} as const;

// ─── Assembled Theme Object ──────────────────────────────────────────────────

export const theme = {
  brand,
  palette,
  surfaces: { dark: surfaceDark, light: surfaceLight },
  text:     { dark: textDark, light: textLight },
  borders:  { dark: borderDark, light: borderLight },
  shadows:  { dark: shadowDark, light: shadowLight },
  typography,
  spacing,
  borderRadius,
  layout,
  motion,
  zIndex,
} as const;

export type Theme = typeof theme;
export type ThemeMode = 'dark' | 'light';

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Resolve a CSS custom property reference, e.g. `cssVar('bg-canvas')` -> `var(--bg-canvas)`
 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/**
 * Return the correct surface token set for a given theme mode.
 */
export function getSurfaces(mode: ThemeMode) {
  return mode === 'dark' ? surfaceDark : surfaceLight;
}

/**
 * Return the correct text token set for a given theme mode.
 */
export function getTextColors(mode: ThemeMode) {
  return mode === 'dark' ? textDark : textLight;
}

/**
 * Return the correct border token set for a given theme mode.
 */
export function getBorders(mode: ThemeMode) {
  return mode === 'dark' ? borderDark : borderLight;
}

/**
 * Return the correct shadow token set for a given theme mode.
 */
export function getShadows(mode: ThemeMode) {
  return mode === 'dark' ? shadowDark : shadowLight;
}
