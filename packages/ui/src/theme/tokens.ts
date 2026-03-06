// ─── Design Tokens ─────────────────────────────────────────────────────────────

export const colors = {
  // Brand
  brand: {
    50:  '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',  // primary
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
  },
  // Neutrals (dark-first for media app)
  surface: {
    50:  '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    700: '#334155',
    800: '#1e293b',  // panels
    850: '#161f2e',
    900: '#0f172a',  // canvas / background
    950: '#080e1a',
  },
  // Semantic
  success: '#22c55e',
  warning: '#f59e0b',
  error:   '#ef4444',
  info:    '#3b82f6',
} as const;

export const typography = {
  fontFamily: {
    sans:  'Inter, system-ui, -apple-system, sans-serif',
    mono:  'JetBrains Mono, Fira Code, monospace',
  },
  fontSize: {
    xs:   '0.75rem',
    sm:   '0.875rem',
    base: '1rem',
    lg:   '1.125rem',
    xl:   '1.25rem',
    '2xl': '1.5rem',
  },
} as const;

export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  6: '1.5rem',
  8: '2rem',
  12: '3rem',
  16: '4rem',
} as const;

export const borderRadius = {
  sm:  '0.25rem',
  md:  '0.375rem',
  lg:  '0.5rem',
  xl:  '0.75rem',
  full: '9999px',
} as const;

export const shadows = {
  sm:   '0 1px 2px 0 rgb(0 0 0 / 0.3)',
  md:   '0 4px 6px -1px rgb(0 0 0 / 0.4)',
  lg:   '0 10px 15px -3px rgb(0 0 0 / 0.4)',
  glow: '0 0 20px rgb(99 102 241 / 0.3)',
} as const;

export const theme = { colors, typography, spacing, borderRadius, shadows };
export type Theme = typeof theme;
