import React, { forwardRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenBadgeProps {
  /** Estimated token cost for the pending operation. */
  estimatedTokens: number;
  /** User's current token balance. */
  currentBalance: number;
  /** Optional category label (e.g. "Assembly", "Transcribe"). */
  category?: string;
  /** Force the warning state regardless of balance. */
  showWarning?: boolean;
  /** Called when the badge is clicked (e.g. to show purchase dialog). */
  onClick?: () => void;
  /** Additional CSS class names for the root element. */
  className?: string;
  /** Unique identifier for the root element. */
  id?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format large token numbers into compact display (e.g. 1.2K, 3.5M). */
function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact badge that displays the estimated token cost for a pending
 * operation alongside the user's remaining balance. Enters a warning
 * state when the balance is insufficient or when explicitly flagged.
 *
 * The badge uses `aria-live="polite"` to announce balance changes
 * to screen readers without interrupting current speech.
 */
export const TokenBadge = forwardRef<HTMLElement, TokenBadgeProps>(function TokenBadge(
  {
    estimatedTokens,
    currentBalance,
    category,
    showWarning,
    onClick,
    className,
    id,
  },
  ref,
) {
  const isInsufficient = estimatedTokens > currentBalance;
  const warn = showWarning || isInsufficient;

  const Tag = onClick ? 'button' : 'span';
  const interactiveProps = onClick
    ? { type: 'button' as const, onClick, tabIndex: 0 }
    : {};

  const ariaLabel = [
    `Estimated cost: ${estimatedTokens.toLocaleString()} tokens`,
    `Balance: ${currentBalance.toLocaleString()} tokens`,
    warn ? 'Warning: insufficient balance' : null,
  ].filter(Boolean).join('. ');

  return (
    <Tag
      ref={ref as React.Ref<HTMLButtonElement & HTMLSpanElement>}
      id={id}
      className={`token-badge${warn ? ' token-badge--warning' : ''}${className ? ` ${className}` : ''}`}
      role={onClick ? 'button' : 'status'}
      aria-label={ariaLabel}
      aria-live="polite"
      aria-atomic="true"
      data-testid="token-badge"
      {...interactiveProps}
    >
      {category && (
        <span className="token-badge-category" aria-hidden="true">{category}</span>
      )}

      <span className="token-badge-amount" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        {formatTokenCount(estimatedTokens)}
      </span>

      <span className="token-badge-separator" aria-hidden="true">/</span>

      <span className="token-badge-balance" aria-hidden="true">
        {formatTokenCount(currentBalance)} remaining
      </span>

      {warn && (
        <span className="token-badge-warn-icon" role="img" aria-label="Insufficient balance warning" title="Insufficient token balance">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
      )}
    </Tag>
  );
});
