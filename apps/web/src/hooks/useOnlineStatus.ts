// =============================================================================
//  THE AVID -- Online Status Hook
//  Tracks browser online/offline state and provides a reactive boolean.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';

/**
 * Returns whether the browser is currently online.
 * Automatically re-renders when the connection status changes.
 *
 * @returns `true` if the browser is online, `false` if offline
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  const handleOnline = useCallback(() => setIsOnline(true), []);
  const handleOffline = useCallback(() => setIsOnline(false), []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return isOnline;
}
