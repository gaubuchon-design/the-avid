import React, { forwardRef, useRef, useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The domain entity the context pill represents. */
export type ContextPillType = 'project' | 'bin' | 'selection' | 'sequence' | 'clip';

export interface ContextPillProps {
  /** The type of editing context represented by this pill. */
  type: ContextPillType;
  /** Human-readable label describing the context. */
  label: string;
  /** Called when the pill body is clicked (e.g. to inspect the context). */
  onClick?: () => void;
  /** Called when the remove/dismiss button is clicked. */
  onRemove?: () => void;
  /** Whether the pill is currently the active/selected context. */
  isActive?: boolean;
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

/** Human-readable type label for screen readers. */
function typeLabel(type: ContextPillType): string {
  const labels: Record<ContextPillType, string> = {
    project: 'Project',
    bin: 'Bin',
    selection: 'Selection',
    sequence: 'Sequence',
    clip: 'Clip',
  };
  return labels[type];
}

/** Returns an SVG icon element matching the context type. */
function ContextIcon({ type }: { type: ContextPillType }) {
  const size = 12;
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (type) {
    case 'project':
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'bin':
      return (
        <svg {...common}>
          <polyline points="21 8 21 21 3 21 3 8" />
          <rect x="1" y="3" width="22" height="5" />
          <line x1="10" y1="12" x2="14" y2="12" />
        </svg>
      );
    case 'selection':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 2" />
        </svg>
      );
    case 'sequence':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="4" rx="1" />
          <rect x="2" y="14" width="14" height="4" rx="1" />
        </svg>
      );
    case 'clip':
      return (
        <svg {...common}>
          <rect x="2" y="2" width="20" height="20" rx="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact pill/badge that communicates the editing context the agent is
 * operating on. Provides optional click-to-inspect and remove affordances.
 *
 * Features:
 * - Tooltip on truncated labels
 * - Keyboard dismiss (Backspace/Delete on focused pill)
 * - Enter/exit animations via CSS classes
 * - Active state highlighting
 */
export const ContextPill = forwardRef<HTMLSpanElement, ContextPillProps>(
  function ContextPill({ type, label, onClick, onRemove, isActive, className }, ref) {
    const labelRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    // Detect truncation to show tooltip
    useEffect(() => {
      const el = labelRef.current;
      if (el) {
        setIsTruncated(el.scrollWidth > el.clientWidth);
      }
    }, [label]);

    const handleRemove = useCallback(() => {
      if (!onRemove) return;
      setIsDismissing(true);
      // Allow CSS exit animation to play before calling onRemove
      const timeout = setTimeout(() => {
        onRemove();
      }, 150);
      return () => clearTimeout(timeout);
    }, [onRemove]);

    const handleBodyKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLSpanElement>) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
          return;
        }
        // Allow keyboard dismiss from the pill body
        if (onRemove && (e.key === 'Backspace' || e.key === 'Delete')) {
          e.preventDefault();
          handleRemove();
        }
      },
      [onClick, onRemove, handleRemove],
    );

    const handleRemoveKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          handleRemove();
        }
      },
      [handleRemove],
    );

    const humanType = typeLabel(type);

    return (
      <span
        ref={ref}
        className={cx(
          'context-pill',
          `context-pill--${type}`,
          isActive && 'context-pill--active',
          isDismissing && 'context-pill--dismissing',
          className,
        )}
        role="status"
        aria-label={`${humanType} context: ${label}`}
      >
        <span
          className="context-pill-body"
          onClick={onClick}
          onKeyDown={handleBodyKeyDown}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick || onRemove ? 0 : undefined}
          aria-label={onClick ? `Inspect ${humanType}: ${label}` : undefined}
        >
          <ContextIcon type={type} />
          <span
            ref={labelRef}
            className="context-pill-label"
            title={isTruncated ? label : undefined}
          >
            {label}
          </span>
        </span>

        {onRemove && (
          <button
            type="button"
            className="context-pill-remove"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            onKeyDown={handleRemoveKeyDown}
            aria-label={`Remove ${humanType} context: ${label}`}
            title="Remove context"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </span>
    );
  },
);
