import { useState, useEffect, useCallback } from 'react';

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * Automatically updates on viewport changes.
 *
 * @param query - CSS media query string (e.g. '(max-width: 768px)')
 * @returns Whether the media query currently matches
 *
 * @example
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 768px)');
 * const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
 * const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = useState<boolean>(getMatches);

  useEffect(() => {
    const mql = window.matchMedia(query);

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    // Set initial value
    setMatches(mql.matches);

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

// ─── Common breakpoint presets ──────────────────────────────────────────────

/** Returns true when viewport width is <= 640px */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 640px)');
}

/** Returns true when viewport width is between 641px and 1024px */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 641px) and (max-width: 1024px)');
}

/** Returns true when viewport width is >= 1025px */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1025px)');
}

/** Returns true when the user prefers reduced motion */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Returns true when the user prefers a dark color scheme */
export function usePrefersDarkMode(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}
