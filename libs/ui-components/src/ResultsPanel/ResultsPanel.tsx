import React, { forwardRef, useRef, useState, useCallback, memo, type KeyboardEvent } from 'react';

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
  /** ID of the currently selected/active result. */
  activeResultId?: string;
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

/** Map source type to human label. */
function sourceLabel(type: string): string {
  const labels: Record<string, string> = {
    transcript: 'Transcript',
    visual: 'Visual',
    audio: 'Audio',
    metadata: 'Metadata',
  };
  return labels[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
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
 *
 * Features:
 * - Keyboard navigation (ArrowUp/ArrowDown through results, Enter to select)
 * - Visual score bar alongside percentage
 * - Active/selected result highlighting
 * - Improved empty state with search icon
 * - Screen reader announcements for result count
 */
/** Memoized source icon to avoid re-rendering SVGs on parent re-render. */
const MemoSourceIcon = memo(SourceIcon);

export const ResultsPanel = memo(forwardRef<HTMLDivElement, ResultsPanelProps>(
  function ResultsPanel(
    {
      results,
      isLoading = false,
      query,
      onJumpToTimeline,
      onSelectResult,
      totalHits,
      queryTimeMs,
      activeResultId,
      className,
    },
    ref,
  ) {
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const listRef = useRef<HTMLUListElement>(null);

    const focusItem = useCallback((index: number) => {
      setFocusedIndex(index);
      const list = listRef.current;
      if (list) {
        const items = list.querySelectorAll<HTMLLIElement>('.result-item');
        const target = items[index];
        if (target) {
          target.focus();
          // Scroll into view for long lists
          target.scrollIntoView({ block: 'nearest' });
        }
      }
    }, []);

    const handleListKeyDown = useCallback(
      (e: KeyboardEvent<HTMLUListElement>) => {
        const count = results.length;
        if (count === 0) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = focusedIndex < count - 1 ? focusedIndex + 1 : 0;
          focusItem(next);
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const next = focusedIndex > 0 ? focusedIndex - 1 : count - 1;
          focusItem(next);
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const item = results[focusedIndex];
          if (item && onSelectResult) {
            onSelectResult(item);
          }
          return;
        }

        // Home/End for quick navigation
        if (e.key === 'Home') {
          e.preventDefault();
          focusItem(0);
          return;
        }
        if (e.key === 'End') {
          e.preventDefault();
          focusItem(count - 1);
        }
      },
      [results, focusedIndex, focusItem, onSelectResult],
    );

    return (
      <div ref={ref} className={cx('results-panel', className)} role="region" aria-label="Search results" style={{ contain: 'layout style' }}>
        {/* -- Summary bar ----------------------------------------------- */}
        {(query || totalHits !== undefined) && (
          <div className="results-panel-summary">
            {query && (
              <span className="results-panel-query" title={query}>
                Results for &ldquo;{query}&rdquo;
              </span>
            )}
            <span className="results-panel-stats">
              {totalHits !== undefined && <>{totalHits.toLocaleString()} hits</>}
              {queryTimeMs !== undefined && <> in {queryTimeMs}ms</>}
            </span>
          </div>
        )}

        {/* -- Loading state --------------------------------------------- */}
        {isLoading && (
          <div className="results-panel-loading" role="status" aria-label="Loading results">
            <span className="sr-only">Loading results...</span>
            {[1, 2, 3].map((i) => (
              <div key={i} className="result-item result-item--skeleton" aria-hidden="true">
                <span className="result-score result-score--skeleton" />
                <div className="result-body-skeleton">
                  <div className="result-text result-text--skeleton" />
                  <div className="result-text result-text--skeleton result-text--skeleton-short" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* -- Empty state ----------------------------------------------- */}
        {!isLoading && results.length === 0 && (
          <div className="results-panel-empty" role="status">
            <svg
              className="results-panel-empty-icon"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="results-panel-empty-text">No results found</span>
            {query && (
              <span className="results-panel-empty-hint">
                Try adjusting your search terms
              </span>
            )}
          </div>
        )}

        {/* -- Result list ----------------------------------------------- */}
        {!isLoading && results.length > 0 && (
          <>
            {/* Screen reader announcement */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {results.length} results displayed
              {totalHits !== undefined && totalHits > results.length
                ? ` of ${totalHits} total`
                : ''}
            </div>

            <ul
              ref={listRef}
              className="results-panel-list"
              aria-label="Result list"
              onKeyDown={handleListKeyDown}
            >
              {results.map((item, i) => (
                <li
                  key={item.id}
                  className={cx(
                    'result-item',
                    i === focusedIndex && 'result-item--focused',
                    activeResultId === item.id && 'result-item--active',
                  )}
                  onClick={() => onSelectResult?.(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectResult?.(item);
                    }
                  }}
                  onFocus={() => setFocusedIndex(i)}
                  role={onSelectResult ? 'button' : 'listitem'}
                  tabIndex={onSelectResult ? 0 : undefined}
                  aria-label={`Result: ${item.text ?? item.sourceType} - ${formatScore(item.score)} relevance`}
                  aria-current={activeResultId === item.id ? 'true' : undefined}
                >
                  {/* Score badge with visual bar */}
                  <div className="result-score-group" title={`Relevance: ${formatScore(item.score)}`}>
                    <span className="result-score">
                      {formatScore(item.score)}
                    </span>
                    <span className="result-score-bar" aria-hidden="true">
                      <span
                        className="result-score-bar-fill"
                        style={{ width: `${Math.round(item.score * 100)}%` }}
                      />
                    </span>
                  </div>

                  {/* Source type badge */}
                  <span
                    className={`result-source result-source--${item.sourceType}`}
                    title={sourceLabel(item.sourceType)}
                  >
                    <MemoSourceIcon type={item.sourceType} />
                    <span className="result-source-label">
                      {sourceLabel(item.sourceType)}
                    </span>
                  </span>

                  <div className="result-body">
                    {item.text && (
                      <span className="result-text" title={item.text}>
                        {item.text}
                      </span>
                    )}
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
                      title={`Jump to ${formatTime(item.startTime)}${item.endTime !== undefined ? ` - ${formatTime(item.endTime)}` : ''}`}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      {formatTime(item.startTime)}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  },
));
