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
  50:  '#f5f5f7',
  100: '#e7e7eb',
  200: '#d1d1d8',
  300: '#b5b5bf',
  400: '#9a9aa6',
  500: '#81818d',
  600: '#676772',
  700: '#50505a',
  800: '#393942',
  900: '#232329',
} as const;

// ─── Palette ─────────────────────────────────────────────────────────────────
// Maps directly to the CSS custom properties used in design-system.css

export const palette = {
  brand:        '#81818d',
  brandBright:  '#d1d1d8',
  brandDim:     'rgba(129,129,141,0.18)',
  accent:       '#b5b5bf',
  accentDim:    '#676772',
  accentGlow:   'rgba(181,181,191,0.24)',
  accentMuted:  'rgba(181,181,191,0.14)',

  // Track lane colors
  trackVideo:   '#b8b8c0',
  trackAudio:   '#96969f',
  trackEffect:  '#7b7b84',
  trackSub:     '#a5a5ae',
  trackGfx:     '#5f5f68',

  // Playhead
  playhead:     '#ececf2',

  // Semantic / status
  success:      '#d7d7de',
  warning:      '#b9b9c2',
  error:        '#8d8d98',
  info:         '#ececf2',

  // AI
  aiAccent:     '#b8b8c2',
  aiAccentDim:  'rgba(184,184,194,0.15)',
} as const;

// ─── Surface / Background (dark-first for NLE) ──────────────────────────────

export const surfaceDark = {
  void:      '#000000',
  canvas:    '#070708',
  base:      '#101013',
  surface:   '#151519',
  raised:    '#1b1b20',
  elevated:  '#232329',
  overlay:   '#2b2b33',
  hover:     'rgba(255,255,255,0.05)',
  active:    'rgba(255,255,255,0.09)',
} as const;

export const surfaceLight = {
  void:      '#f3f3f5',
  canvas:    '#ebebee',
  base:      '#e1e1e6',
  surface:   '#ffffff',
  raised:    '#f7f7f9',
  elevated:  '#ffffff',
  overlay:   '#ececf0',
  hover:     'rgba(0,0,0,0.04)',
  active:    'rgba(0,0,0,0.07)',
} as const;

// ─── Text ────────────────────────────────────────────────────────────────────

export const textDark = {
  primary:   '#efeff2',
  secondary: '#b4b4bc',
  tertiary:  '#83838c',
  muted:     '#5e5e68',
  disabled:  '#44444d',
  accent:    '#d1d1d8',
  onBrand:   '#ffffff',
} as const;

export const textLight = {
  primary:   '#17171b',
  secondary: '#4f4f57',
  tertiary:  '#787880',
  muted:     '#a1a1a8',
  disabled:  '#c9c9cf',
  accent:    '#5f5f68',
  onBrand:   '#ffffff',
} as const;

// ─── Borders ─────────────────────────────────────────────────────────────────

export const borderDark = {
  default:  'rgba(255,255,255,0.08)',
  subtle:   'rgba(255,255,255,0.04)',
  strong:   'rgba(255,255,255,0.14)',
  accent:   'rgba(181,181,191,0.4)',
  focus:    '#b5b5bf',
} as const;

export const borderLight = {
  default:  'rgba(0,0,0,0.1)',
  subtle:   'rgba(0,0,0,0.04)',
  strong:   'rgba(0,0,0,0.16)',
  accent:   'rgba(95,95,104,0.3)',
  focus:    '#5f5f68',
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadowDark = {
  sm:     '0 1px 3px rgba(0,0,0,0.4)',
  md:     '0 4px 12px rgba(0,0,0,0.5)',
  lg:     '0 8px 24px rgba(0,0,0,0.6)',
  brand:  '0 0 16px rgba(181,181,191,0.22)',
  accent: '0 0 0 1px rgba(181,181,191,0.35)',
} as const;

export const shadowLight = {
  sm:     '0 1px 3px rgba(0,0,0,0.08)',
  md:     '0 4px 12px rgba(0,0,0,0.12)',
  lg:     '0 8px 24px rgba(0,0,0,0.15)',
  brand:  '0 0 16px rgba(95,95,104,0.12)',
  accent: '0 0 0 1px rgba(95,95,104,0.2)',
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
