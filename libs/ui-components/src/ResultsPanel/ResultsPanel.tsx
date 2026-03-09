import React, { forwardRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResultItem {
  /** Unique identifier for this result. */
  id: string;
  /** Relevance score (0-1). */
  score: number;
  /** Origin type (e.g. "transcript", "visual", "audio", "metadata"). */
  sourceType: string;
  /** Matching text excerpt. */
  text?: string;
  /** Start time in seconds (for timeline-linked results). */
  startTime?: number;
  /** End time in seconds. */
  endTime?: number;
  /** Knowledge-db shard identifier. */
  shardId?: string;
  /** Node or asset identifier. */
  nodeId?: string;
  /** Provenance descriptor (e.g. "Whisper STT", "CLIP embedding"). */
  provenance?: string;
}

export interface ResultsPanelProps {
  /** The result items to display. */
  results: ResultItem[];
  /** Show loading skeleton when true. */
  isLoading?: boolean;
  /** The query that produced these results. */
  query?: string;
  /** Called when the user wants to jump to a timeline position. */
  onJumpToTimeline?: (time: number) => void;
  /** Called when the user clicks/selects a result. */
  onSelectResult?: (result: ResultItem) => void;
  /** Total hit count (may exceed results.length due to pagination). */
  totalHits?: number;
  /** Server-side query time in milliseconds. */
  queryTimeMs?: number;
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

/** Format seconds as mm:ss.f for compact display. */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

/** Map a 0-1 score to a human-readable percentage string. */
function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** SVG icon for a given source type. */
function SourceIcon({ type }: { type: string }) {
  const props = {
    width: 12,
    height: 12,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };

  switch (type) {
    case 'transcript':
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'visual':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'audio':
      return (
        <svg {...props}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays search or execution results with score badges, source icons,
 * text previews, and optional timeline-jump affordances.
 */
export const ResultsPanel = forwardRef<HTMLDivElement, ResultsPanelProps>(
  function ResultsPanel(
    {
      results,
      isLoading = false,
      query,
      onJumpToTimeline,
      onSelectResult,
      totalHits,
      queryTimeMs,
      className,
    },
    ref,
  ) {
    return (
      <div ref={ref} className={cx('results-panel', className)} role="region" aria-label="Search results">
        {/* -- Summary bar ----------------------------------------------- */}
        {(query || totalHits !== undefined) && (
          <div className="results-panel-summary">
            {query && <span className="results-panel-query">Results for &ldquo;{query}&rdquo;</span>}
            <span className="results-panel-stats">
              {totalHits !== undefined && <>{totalHits.toLocaleString()} hits</>}
              {queryTimeMs !== undefined && <> in {queryTimeMs}ms</>}
            </span>
          </div>
        )}

        {/* -- Loading state --------------------------------------------- */}
        {isLoading && (
          <div className="results-panel-loading" role="status" aria-label="Loading results">
            {[1, 2, 3].map((i) => (
              <div key={i} className="result-item result-item--skeleton" aria-hidden="true">
                <span className="result-score result-score--skeleton" />
                <div className="result-text result-text--skeleton" />
              </div>
            ))}
          </div>
        )}

        {/* -- Result list ----------------------------------------------- */}
        {!isLoading && results.length === 0 && (
          <div className="results-panel-empty" role="status">
            No results found.
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <ul className="results-panel-list" aria-label="Result list">
            {results.map((item) => (
              <li
                key={item.id}
                className="result-item"
                onClick={() => onSelectResult?.(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectResult?.(item);
                  }
                }}
                role={onSelectResult ? 'button' : 'listitem'}
                tabIndex={onSelectResult ? 0 : undefined}
                aria-label={`Result: ${item.text ?? item.sourceType} - ${formatScore(item.score)} relevance`}
              >
                <span className="result-score" title={`Relevance: ${formatScore(item.score)}`}>
                  {formatScore(item.score)}
                </span>

                <span className="result-source" title={item.sourceType}>
                  <SourceIcon type={item.sourceType} />
                </span>

                <div className="result-body">
                  {item.text && <span className="result-text">{item.text}</span>}
                  {item.provenance && (
                    <span className="result-provenance">{item.provenance}</span>
                  )}
                </div>

                {item.startTime !== undefined && onJumpToTimeline && (
                  <button
                    type="button"
                    className="result-jump-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onJumpToTimeline(item.startTime!);
                    }}
                    aria-label={`Jump to ${formatTime(item.startTime)}`}
                    title={`Jump to ${formatTime(item.startTime)}`}
                  >
                    {formatTime(item.startTime)}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
