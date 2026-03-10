// =============================================================================
//  THE AVID -- API Error Banner
//  Contextual error display for API/network errors with appropriate actions.
// =============================================================================

import React from 'react';
import { handleApiError } from '../lib/fetchWithRetry';

interface ApiErrorBannerProps {
  /** The error to display. Can be an Error object or string. */
  error: Error | string | null;
  /** Callback to retry the failed operation. */
  onRetry?: () => void;
  /** Callback to dismiss the error banner. */
  onDismiss?: () => void;
  /** Compact mode for inline use. */
  compact?: boolean;
}

/**
 * Displays an appropriate error message based on the error type,
 * with action buttons for retry, dismiss, or navigation.
 */
export function ApiErrorBanner({ error, onRetry, onDismiss, compact }: ApiErrorBannerProps) {
  if (!error) return null;

  const errorObj = typeof error === 'string' ? new Error(error) : error;
  const result = handleApiError(errorObj);

  const bgColor =
    result.action === 'show-offline'
      ? 'rgba(245, 158, 11, 0.08)'
      : result.action === 'show-rate-limit'
        ? 'rgba(245, 158, 11, 0.08)'
        : 'rgba(239, 68, 68, 0.08)';

  const borderColor =
    result.action === 'show-offline'
      ? 'rgba(245, 158, 11, 0.2)'
      : result.action === 'show-rate-limit'
        ? 'rgba(245, 158, 11, 0.2)'
        : 'rgba(239, 68, 68, 0.2)';

  const textColor =
    result.action === 'show-offline' || result.action === 'show-rate-limit'
      ? 'var(--warning, #f59e0b)'
      : 'var(--error, #ef4444)';

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        padding: compact ? '8px 12px' : '12px 16px',
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md, 6px)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: compact ? 11 : 12,
      }}
    >
      {/* Icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={textColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      {/* Message */}
      <span style={{ flex: 1, color: textColor, fontWeight: 500 }}>
        {result.message}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {(result.action === 'retry' || onRetry) && (
          <button
            onClick={onRetry}
            className="btn btn-sm"
            style={{
              padding: '2px 10px',
              fontSize: 10,
              fontWeight: 600,
              background: 'var(--bg-raised)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        )}
        {result.action === 'redirect-login' && (
          <button
            onClick={() => { window.location.href = '/login'; }}
            className="btn btn-sm"
            style={{
              padding: '2px 10px',
              fontSize: 10,
              fontWeight: 600,
              background: 'var(--brand, #4f63f5)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss error"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0 2px',
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
