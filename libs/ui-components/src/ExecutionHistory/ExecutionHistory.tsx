import React, { forwardRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  /** Unique entry identifier. */
  id: string;
  /** The plan identifier this entry corresponds to. */
  planId: string;
  /** The original user intent. */
  intent: string;
  /** Lifecycle status of the plan. */
  status: string;
  /** Number of steps that completed successfully. */
  stepsCompleted: number;
  /** Total number of steps in the plan. */
  totalSteps: number;
  /** Tokens consumed by this execution. */
  tokensUsed: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Whether this plan can be undone via compensation. */
  canUndo?: boolean;
}

export interface ExecutionHistoryProps {
  /** Ordered list of past executions (newest first). */
  entries: HistoryEntry[];
  /** Called when the user requests an undo. */
  onUndo?: (planId: string) => void;
  /** Called when the user wants to inspect a plan. */
  onViewPlan?: (planId: string) => void;
  /** Called when the user clears the history. */
  onClearHistory?: () => void;
  /** Additional CSS class(es) to apply to the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Merge base and optional extra class names. */
function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

/** Maps a status string to a display variant. */
function statusVariant(status: string): 'success' | 'error' | 'active' | 'muted' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'executing':
    case 'planning':
      return 'active';
    default:
      return 'muted';
  }
}

/** Status icon SVG based on variant. */
function StatusIcon({ status }: { status: string }) {
  const variant = statusVariant(status);
  const props = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (variant) {
    case 'success':
      return (
        <svg {...props}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'error':
      return (
        <svg {...props}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
    case 'active':
      return (
        <svg {...props} className="history-entry-spinner">
          <circle cx="12" cy="12" r="8" strokeDasharray="36" strokeDashoffset="10" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}

/** Format an ISO timestamp to a compact relative or absolute string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Scrollable history of past agent executions. Shows status, progress,
 * token usage, and provides undo and inspect affordances.
 */
export const ExecutionHistory = forwardRef<HTMLDivElement, ExecutionHistoryProps>(
  function ExecutionHistory(
    {
      entries,
      onUndo,
      onViewPlan,
      onClearHistory,
      className,
    },
    ref,
  ) {
    return (
      <div ref={ref} className={cx('execution-history', className)} role="region" aria-label="Execution history">
        {/* -- Header --------------------------------------------------- */}
        <div className="execution-history-header">
          <span className="execution-history-title">History</span>
          {onClearHistory && entries.length > 0 && (
            <button
              type="button"
              className="execution-history-clear"
              onClick={onClearHistory}
              aria-label="Clear execution history"
              title="Clear history"
            >
              Clear
            </button>
          )}
        </div>

        {/* -- Empty state ----------------------------------------------- */}
        {entries.length === 0 && (
          <div className="execution-history-empty" role="status">
            No executions yet.
          </div>
        )}

        {/* -- Entry list ------------------------------------------------ */}
        {entries.length > 0 && (
          <ul className="execution-history-list" aria-label="Past executions">
            {entries.map((entry) => {
              const variant = statusVariant(entry.status);
              return (
                <li key={entry.id} className="history-entry" aria-label={`${entry.intent} - ${entry.status}`}>
                  <span className={`history-entry-status history-entry-status--${variant}`}>
                    <StatusIcon status={entry.status} />
                  </span>

                  <div className="history-entry-body">
                    <span className="history-entry-intent">{entry.intent}</span>

                    <div className="history-entry-meta">
                      <span className="history-entry-progress">
                        {entry.stepsCompleted}/{entry.totalSteps} steps
                      </span>
                      <span className="history-entry-tokens">
                        {entry.tokensUsed.toLocaleString()} tokens
                      </span>
                      <span className="history-entry-time">
                        {formatTimestamp(entry.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="history-entry-actions">
                    {onViewPlan && (
                      <button
                        type="button"
                        className="history-view-btn"
                        onClick={() => onViewPlan(entry.planId)}
                        aria-label={`View plan: ${entry.intent}`}
                        title="View plan details"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </button>
                    )}
                    {onUndo && entry.canUndo && (
                      <button
                        type="button"
                        className="history-undo-btn"
                        onClick={() => onUndo(entry.planId)}
                        aria-label={`Undo: ${entry.intent}`}
                        title="Undo this execution"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="1 4 1 10 7 10" />
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  },
);
