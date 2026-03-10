// =============================================================================
//  THE AVID -- Empty State Component
//  Reusable placeholder for empty lists, search results, or data sections.
// =============================================================================

import React from 'react';

interface EmptyStateProps {
  /** Main title shown in the empty state. */
  title: string;
  /** Optional description text below the title. */
  description?: string;
  /** Optional icon (SVG element) displayed above the title. */
  icon?: React.ReactNode;
  /** Optional action button. */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Compact mode uses less padding for inline sections. */
  compact?: boolean;
}

/**
 * A consistent empty state component for use throughout the application.
 * Handles the case when a list, search, or data section has no results.
 */
export function EmptyState({ title, description, icon, action, compact }: EmptyStateProps) {
  return (
    <div
      role="status"
      style={{
        padding: compact ? 20 : 40,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      {icon && (
        <div
          aria-hidden="true"
          style={{
            color: 'var(--text-muted)',
            marginBottom: compact ? 4 : 8,
            opacity: 0.5,
          }}
        >
          {icon}
        </div>
      )}

      <div
        style={{
          fontSize: compact ? 12 : 13,
          fontWeight: 500,
          color: 'var(--text-secondary)',
        }}
      >
        {title}
      </div>

      {description && (
        <div
          style={{
            fontSize: compact ? 10 : 11,
            color: 'var(--text-muted)',
            maxWidth: 300,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="btn btn-secondary btn-sm"
          style={{ marginTop: compact ? 8 : 12 }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ─── Preset Variants ────────────────────────────────────────────────────────

/** Empty state for search results with no matches. */
export function NoSearchResults({
  query,
  onClear,
}: {
  query: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      title="No matching results"
      description={`No results found for "${truncateText(query, 40)}". Try adjusting your search.`}
      icon={
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      }
      action={onClear ? { label: 'Clear Search', onClick: onClear } : undefined}
    />
  );
}

/** Empty state for empty lists. */
export function EmptyList({
  itemName = 'items',
  onAdd,
  addLabel,
}: {
  itemName?: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <EmptyState
      title={`No ${itemName} yet`}
      description={onAdd ? `Create your first ${itemName.replace(/s$/, '')} to get started.` : undefined}
      icon={
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      }
      action={onAdd ? { label: addLabel ?? `Add ${itemName.replace(/s$/, '')}`, onClick: onAdd } : undefined}
    />
  );
}

// ─── Text Utility ───────────────────────────────────────────────────────────

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}
