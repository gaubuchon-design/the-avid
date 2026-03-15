import { useEffect } from 'react';
import { useUserSettingsStore } from '../store/userSettings.store';
import { useAuthStore } from '../store/auth.store';

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '').trim();
  if (![3, 6].includes(normalized.length)) {
    return null;
  }

  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized;
  const value = Number.parseInt(expanded, 16);

  if (Number.isNaN(value)) {
    return null;
  }

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function shiftHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }

  return `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => clampChannel(channel + amount).toString(16).padStart(2, '0'))
    .join('')}`;
}

function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(128, 128, 128, ${alpha})`;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Hook that applies user settings to the DOM and other systems.
 * Mount once at the app root level.
 */
export function useSettingsEffects() {
  const theme = useUserSettingsStore((s) => s.settings.theme);
  const uiScale = useUserSettingsStore((s) => s.settings.uiScale);
  const accentColor = useUserSettingsStore((s) => s.settings.accentColor);
  const user = useAuthStore((s) => s.user);
  const initForUser = useUserSettingsStore((s) => s.initForUser);

  // Initialize settings for the current user on login
  useEffect(() => {
    if (user) {
      initForUser(user.id, user.name);
    }
  }, [user?.id, user?.name, initForUser]);

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

      const listener = (e: MediaQueryListEvent) => {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Apply UI scale
  useEffect(() => {
    document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  }, [uiScale]);

  // Apply accent color
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand', accentColor);
    root.style.setProperty('--brand-bright', shiftHex(accentColor, 42));
    root.style.setProperty('--brand-dim', withAlpha(accentColor, 0.16));
    root.style.setProperty('--accent', shiftHex(accentColor, 24));
    root.style.setProperty('--accent-dim', shiftHex(accentColor, -18));
    root.style.setProperty('--accent-muted', withAlpha(accentColor, 0.14));
    root.style.setProperty('--border-accent', withAlpha(accentColor, 0.28));
    root.style.setProperty('--text-accent', shiftHex(accentColor, 56));
    root.style.setProperty('--shadow-brand', `0 0 16px ${withAlpha(accentColor, 0.18)}`);
    root.style.setProperty('--shadow-glow', `0 0 24px ${withAlpha(accentColor, 0.22)}`);
  }, [accentColor]);
}
