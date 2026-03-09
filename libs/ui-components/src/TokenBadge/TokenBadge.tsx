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
  /** Additional CSS class(es) to apply to the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge base and optional extra class names. */
function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact badge that displays the estimated token cost for a pending
 * operation alongside the user's remaining balance. Enters a warning
 * state when the balance is insufficient or when explicitly flagged.
 */
export const TokenBadge = forwardRef<HTMLElement, TokenBadgeProps>(
  function TokenBadge(
    {
      estimatedTokens,
      currentBalance,
      category,
      showWarning,
      onClick,
      className,
    },
    ref,
  ) {
    const isInsufficient = estimatedTokens > currentBalance;
    const warn = showWarning || isInsufficient;

    const rootClass = cx(
      'token-badge',
      warn && 'token-badge--warning',
      className,
    );

    const sharedProps = {
      ref: ref as React.Ref<HTMLElement>,
      className: rootClass,
      role: onClick ? ('button' as const) : ('status' as const),
      'aria-label': `Estimated cost: ${estimatedTokens.toLocaleString()} tokens. Balance: ${currentBalance.toLocaleString()} tokens${warn ? '. Warning: insufficient balance' : ''}`,
    };

    const interactiveProps = onClick
      ? { type: 'button' as const, onClick, tabIndex: 0 }
      : {};

    const children = (
      <>
        {category && <span className="token-badge-category">{category}</span>}

        <span className="token-badge-amount" aria-label={`Cost: ${estimatedTokens.toLocaleString()}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {estimatedTokens.toLocaleString()}
        </span>

        <span className="token-badge-separator" aria-hidden="true">/</span>

        <span className="token-badge-balance" aria-label={`Balance: ${currentBalance.toLocaleString()}`}>
          {currentBalance.toLocaleString()} remaining
        </span>

        {warn && (
          <span className="token-badge-warn-icon" aria-hidden="true" title="Insufficient token balance">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
      </>
    );

    // Render as <button> when interactive, <span> otherwise.
    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          className={rootClass}
          role="button"
          aria-label={sharedProps['aria-label']}
          {...interactiveProps}
        >
          {children}
        </button>
      );
    }

    return (
      <span
        ref={ref as React.Ref<HTMLSpanElement>}
        className={rootClass}
        role="status"
        aria-label={sharedProps['aria-label']}
      >
        {children}
      </span>
    );
  },
);
