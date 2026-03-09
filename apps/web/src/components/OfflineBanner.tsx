// =============================================================================
//  THE AVID -- Offline Banner
//  Displays a dismissible banner when the browser loses network connectivity.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Renders a fixed banner at the top of the viewport when the user goes offline.
 * Automatically hides when the connection is restored (with a brief success message).
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setShowReconnected(false);
    } else if (wasOffline) {
      // Show "reconnected" message briefly
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (isOnline && !showReconnected) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--font-ui, -apple-system, BlinkMacSystemFont, sans-serif)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        transition: 'background 300ms, color 300ms',
        background: isOnline
          ? 'rgba(34, 197, 94, 0.12)'
          : 'rgba(239, 68, 68, 0.12)',
        borderBottom: isOnline
          ? '1px solid rgba(34, 197, 94, 0.25)'
          : '1px solid rgba(239, 68, 68, 0.25)',
        color: isOnline ? '#22c55e' : '#ef4444',
      }}
    >
      {/* Icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {isOnline ? (
          // Wifi icon
          <>
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </>
        ) : (
          // Wifi off icon
          <>
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </>
        )}
      </svg>

      {isOnline
        ? 'Connection restored'
        : 'You are offline. Some features may be unavailable.'}
    </div>
  );
}
