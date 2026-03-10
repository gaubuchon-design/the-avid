import { useEffect } from 'react';
import { useUserSettingsStore } from '../store/userSettings.store';
import { useAuthStore } from '../store/auth.store';

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
    document.documentElement.style.setProperty('--brand', accentColor);
  }, [accentColor]);
}
