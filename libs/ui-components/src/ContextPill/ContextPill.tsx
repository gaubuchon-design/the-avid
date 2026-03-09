import React, { forwardRef } from 'react';

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
  /** Additional CSS class names for the root element. */
  className?: string;
  /** Unique identifier for the root element. */
  id?: string;
  /** Whether this pill is the currently active/selected context. */
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Icon name mapping for screen readers (non-visual context). */
const TYPE_LABELS: Record<ContextPillType, string> = {
  project: 'Project',
  bin: 'Bin',
  selection: 'Selection',
  sequence: 'Sequence',
  clip: 'Clip',
};

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
 * Keyboard: Enter/Space to inspect (when onClick provided).
 */
export const ContextPill = forwardRef<HTMLSpanElement, ContextPillProps>(function ContextPill(
  { type, label, onClick, onRemove, className, id, isActive },
  ref,
) {
  const typeLabel = TYPE_LABELS[type];

  return (
    <span
      ref={ref}
      id={id}
      className={`context-pill context-pill--${type}${isActive ? ' context-pill--active' : ''}${className ? ` ${className}` : ''}`}
      role="status"
      aria-label={`${typeLabel} context: ${label}`}
      aria-current={isActive ? 'true' : undefined}
      data-testid="context-pill"
      data-context-type={type}
    >
      <span
        className="context-pill-body"
        onClick={onClick}
        onKeyDown={onClick ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        } : undefined}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? `Inspect ${typeLabel.toLowerCase()} context: ${label}` : undefined}
      >
        <ContextIcon type={type} />
        <span className="context-pill-label">{label}</span>
      </span>

      {onRemove && (
        <button
          type="button"
          className="context-pill-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${typeLabel.toLowerCase()} context: ${label}`}
          title="Remove context"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  );
});
