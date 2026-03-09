// ─── Design Tokens v3 ─────────────────────────────────────────────────────────
// Mirrors the CSS custom properties defined in design-system.css
// Use these for TypeScript / JS contexts (styled-components, inline styles, etc.)

// ── Color Palette ─────────────────────────────────────────────────────────────

export const colors = {
  // Brand violet scale
  brand: {
    50:  '#f0edff',
    100: '#dbd4ff',
    200: '#bfb0ff',
    300: '#9b7dff',
    400: '#8464ff',
    500: '#6d4cfa',  // primary
    600: '#5a3dd6',
    700: '#4930b0',
    800: '#3a268c',
    900: '#2a1c66',
  },

  // Surface hierarchy (dark-first for NLE app)
  surface: {
    void:     '#000000',
    canvas:   '#0a0a0f',
    base:     '#0e0e16',
    default:  '#13131e', // --bg-surface
    raised:   '#181826',
    elevated: '#1e1e30',
    overlay:  '#26263e',
    popover:  '#2a2a44',
  },

  // Interactive surface states
  interactive: {
    hover:    'rgba(255, 255, 255, 0.04)',
    active:   'rgba(255, 255, 255, 0.07)',
    selected: 'rgba(255, 255, 255, 0.10)',
  },

  // Text hierarchy
  text: {
    primary:   '#e2e8f0',
    secondary: '#8a9cb5',
    tertiary:  '#556880',
    muted:     '#3d4f64',
    disabled:  '#283544',
    accent:    '#9b7dff',
    onBrand:   '#ffffff',
    inverse:   '#0a0a0f',
  },

  // Border scale
  border: {
    subtle:  'rgba(255, 255, 255, 0.04)',
    default: 'rgba(255, 255, 255, 0.08)',
    strong:  'rgba(255, 255, 255, 0.14)',
    accent:  'rgba(109, 76, 250, 0.40)',
    focus:   '#6d4cfa',
  },

  // Track colors for timeline
  track: {
    video:    '#4f63f5',
    audio:    '#25a865',
    effect:   '#d4873a',
    subtitle: '#5ab8d9',
    gfx:      '#c94f84',
    data:     '#8b5cf6',
  },

  // Playhead
  playhead: '#ff3b3b',

  // Semantic status colors
  success:  '#22c55e',
  warning:  '#f59e0b',
  error:    '#ef4444',
  info:     '#3b82f6',

  // AI accent
  ai: {
    accent:   '#00d4aa',
    dim:      'rgba(0, 212, 170, 0.14)',
    glow:     'rgba(0, 212, 170, 0.25)',
  },

  // Accent aliases
  accent: {
    default: '#7c5cfc',
    dim:     '#5a3fd4',
    glow:    'rgba(124, 92, 252, 0.28)',
    muted:   'rgba(124, 92, 252, 0.12)',
  },
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    ui:      "'DM Sans', 'Inter', system-ui, -apple-system, sans-serif",
    display: "'Syne', 'Inter', sans-serif",
    mono:    "'DM Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
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
    '3xl':  '22px',
    '4xl':  '28px',
  },

  fontWeight: {
    light:    300,
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
    black:    800,
  },

  lineHeight: {
    none:    1,
    tight:   1.2,
    snug:    1.35,
    normal:  1.5,
    relaxed: 1.65,
  },

  letterSpacing: {
    tighter: '-0.03em',
    tight:   '-0.01em',
    normal:  '0',
    wide:    '0.04em',
    wider:   '0.08em',
    widest:  '0.12em',
  },
} as const;

// ── Spacing ───────────────────────────────────────────────────────────────────

export const spacing = {
  0:     '0',
  px:    '1px',
  0.5:   '2px',
  1:     '4px',
  1.5:   '6px',
  2:     '8px',
  2.5:   '10px',
  3:     '12px',
  4:     '16px',
  5:     '20px',
  6:     '24px',
  8:     '32px',
  10:    '40px',
  12:    '48px',
  16:    '64px',
  20:    '80px',
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────────

export const borderRadius = {
  none: '0',
  xs:   '2px',
  sm:   '3px',
  md:   '5px',
  lg:   '8px',
  xl:   '12px',
  '2xl': '16px',
  full: '9999px',
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────

export const shadows = {
  xs:     '0 1px 2px rgba(0, 0, 0, 0.30)',
  sm:     '0 1px 3px rgba(0, 0, 0, 0.40), 0 1px 2px rgba(0, 0, 0, 0.30)',
  md:     '0 4px 12px rgba(0, 0, 0, 0.50)',
  lg:     '0 8px 24px rgba(0, 0, 0, 0.60)',
  xl:     '0 16px 48px rgba(0, 0, 0, 0.70)',
  brand:  '0 0 16px rgba(109, 76, 250, 0.25)',
  glow:   '0 0 24px rgba(109, 76, 250, 0.35)',
  inset:  'inset 0 1px 2px rgba(0, 0, 0, 0.35)',
} as const;

// ── Motion ────────────────────────────────────────────────────────────────────

export const motion = {
  easing: {
    default:  'cubic-bezier(0.2, 0, 0, 1)',
    snap:     'cubic-bezier(0.2, 0, 0, 1)',
    spring:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
    bounce:   'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    in:       'cubic-bezier(0.4, 0, 1, 1)',
    out:      'cubic-bezier(0, 0, 0.2, 1)',
    inOut:    'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  duration: {
    instant:  0,
    fast:     75,
    normal:   150,
    slow:     250,
    slower:   400,
    slowest:  600,
  },
} as const;

// ── Z-Index Scale ─────────────────────────────────────────────────────────────

export const zIndex = {
  base:      0,
  raised:    1,
  dropdown:  10,
  sticky:    20,
  overlay:   30,
  panel:     40,
  modal:     50,
  popover:   60,
  tooltip:   70,
  toast:     80,
  spotlight: 90,
  max:       9999,
} as const;

// ── Layout ────────────────────────────────────────────────────────────────────

export const layout = {
  toolbarHeight:     '44px',
  subToolbarHeight:  '28px',
  binWidth:          '260px',
  inspectorWidth:    '280px',
  timelineHeight:    '260px',
  trackHeight:       '36px',
  statusBarHeight:   '24px',
  rulerHeight:       '24px',
  trackHeaderWidth:  '148px',
  panelHeaderHeight: '30px',
  tabBarHeight:      '32px',
} as const;

// ── Breakpoints ───────────────────────────────────────────────────────────────

export const breakpoints = {
  sm:  640,
  md:  768,
  lg:  1024,
  xl:  1280,
  '2xl': 1536,
} as const;

// ── Composite Theme Export ────────────────────────────────────────────────────

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  motion,
  zIndex,
  layout,
  breakpoints,
} as const;

export type Theme = typeof theme;
export type Colors = typeof colors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;
export type Motion = typeof motion;
export type ZIndex = typeof zIndex;
export type Layout = typeof layout;
export type Breakpoints = typeof breakpoints;
