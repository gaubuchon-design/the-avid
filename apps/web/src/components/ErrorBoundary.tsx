// =============================================================================
//  THE AVID -- Application Error Boundary
//  Provides global and page-level error boundaries with fallback UIs,
//  retry buttons, and structured error logging.
// =============================================================================

import React, { Component, ErrorInfo, ReactNode, useCallback, useState } from 'react';
import { createLogger } from '../lib/logger';

const logger = createLogger('ErrorBoundary');

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Custom fallback render function receiving error + reset callback. */
  fallbackRender?: (props: { error: Error; resetErrorBoundary: () => void }) => ReactNode;
  /** Optional callback invoked when the boundary catches an error. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * When any value in this array changes, the error boundary automatically
   * resets -- useful for route transitions or key prop changes.
   */
  resetKeys?: unknown[];
  /** Determines the severity level for UI styling. */
  level?: 'global' | 'page' | 'panel';
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

// ─── Error Boundary Component ───────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null, errorInfo: null, errorCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const level = this.props.level ?? 'panel';
    logger.error(`Uncaught error in ${level} boundary`, error, {
      componentStack: info.componentStack || '',
      level,
      errorCount: this.state.errorCount + 1,
    });
    this.setState((prev) => ({
      errorInfo: info,
      errorCount: prev.errorCount + 1,
    }));
    this.props.onError?.(error, info);
  }

  override componentDidUpdate(prevProps: Readonly<Props>): void {
    // Auto-reset when resetKeys change while in an error state
    if (this.state.hasError && this.props.resetKeys) {
      const prev = prevProps.resetKeys ?? [];
      const next = this.props.resetKeys;
      const changed =
        prev.length !== next.length || prev.some((v, i) => v !== next[i]);
      if (changed) {
        this.resetBoundary();
      }
    }
  }

  private resetBoundary = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback render function
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetErrorBoundary: this.resetBoundary,
        });
      }

      // Static fallback element
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      const level = this.props.level ?? 'panel';

      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          errorCount={this.state.errorCount}
          level={level}
          onReset={this.resetBoundary}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Default Fallback UI ────────────────────────────────────────────────────

interface DefaultErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  level: 'global' | 'page' | 'panel';
  onReset: () => void;
}

function DefaultErrorFallback({
  error,
  errorInfo,
  errorCount,
  level,
  onReset,
}: DefaultErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isDev =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as Record<string, Record<string, unknown>>)['env']?.['DEV'] === true;

  const isRecurring = errorCount > 2;

  const title =
    level === 'global'
      ? 'Application Error'
      : level === 'page'
        ? 'Page Error'
        : 'Something went wrong';

  const description =
    level === 'global'
      ? 'An unexpected error occurred in the application. Try reloading the page.'
      : level === 'page'
        ? 'This page encountered an error. You can try again or navigate to another page.'
        : 'This section encountered an error.';

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const handleGoHome = useCallback(() => {
    window.location.href = '/';
  }, []);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        padding: level === 'panel' ? 24 : 40,
        textAlign: 'center',
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: level === 'global' ? '100vh' : level === 'page' ? 300 : 120,
        background: level === 'global' ? 'var(--bg-void, #0a0a0a)' : undefined,
      }}
    >
      {/* Error icon */}
      <div
        aria-hidden="true"
        style={{
          width: level === 'panel' ? 36 : 48,
          height: level === 'panel' ? 36 : 48,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '2px solid rgba(239, 68, 68, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          fontSize: level === 'panel' ? 16 : 22,
          color: 'var(--error, #ef4444)',
        }}
      >
        <svg
          width={level === 'panel' ? 18 : 24}
          height={level === 'panel' ? 18 : 24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h2
        style={{
          color: 'var(--text-primary)',
          marginBottom: 8,
          fontSize: level === 'panel' ? 14 : 18,
          fontWeight: 600,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          marginBottom: 8,
          fontSize: level === 'panel' ? 11 : 13,
          maxWidth: 400,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>

      {error?.message && (
        <p
          style={{
            marginBottom: 16,
            fontSize: 11,
            color: 'var(--error, #ef4444)',
            fontFamily: 'var(--font-mono, monospace)',
            maxWidth: 500,
            wordBreak: 'break-word',
          }}
        >
          {error.message}
        </p>
      )}

      {isRecurring && (
        <p
          style={{
            marginBottom: 16,
            fontSize: 11,
            color: 'var(--warning, #f59e0b)',
            fontWeight: 500,
          }}
        >
          This error has occurred multiple times. Try reloading the page.
        </p>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className="tl-btn"
          onClick={onReset}
          style={{
            background: 'var(--accent-primary, #4f63f5)',
            color: '#fff',
            padding: '8px 20px',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Try Again
        </button>

        {level !== 'panel' && (
          <button
            className="tl-btn"
            onClick={handleGoHome}
            style={{
              background: 'var(--bg-elevated, #2a2a2a)',
              color: 'var(--text-secondary)',
              padding: '8px 20px',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Go to Dashboard
          </button>
        )}

        {(level === 'global' || isRecurring) && (
          <button
            className="tl-btn"
            onClick={handleReload}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              padding: '8px 20px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Reload Page
          </button>
        )}
      </div>

      {/* Dev-mode error details */}
      {isDev && (error?.stack || errorInfo?.componentStack) && (
        <div style={{ width: '100%', maxWidth: 600 }}>
          <button
            onClick={() => setShowDetails((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 10,
              cursor: 'pointer',
              textDecoration: 'underline',
              marginBottom: 8,
            }}
          >
            {showDetails ? 'Hide' : 'Show'} error details
          </button>
          {showDetails && (
            <pre
              style={{
                textAlign: 'left',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                background: 'var(--bg-raised, #1a1a1a)',
                padding: 12,
                borderRadius: 'var(--radius-md, 6px)',
                maxHeight: 250,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {error?.stack}
              {errorInfo?.componentStack && (
                <>
                  {'\n\n--- Component Stack ---\n'}
                  {errorInfo.componentStack}
                </>
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page Error Boundary ────────────────────────────────────────────────────
// A convenience wrapper for page-level boundaries.

export function PageErrorBoundary({ children, pageName }: { children: ReactNode; pageName?: string }) {
  return (
    <ErrorBoundary
      level="page"
      onError={(error, info) => {
        logger.error(`Page error${pageName ? ` in ${pageName}` : ''}`, error, {
          componentStack: info.componentStack || '',
          pageName: pageName ?? 'unknown',
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

// ─── Panel Error Boundary ───────────────────────────────────────────────────
// Lightweight boundary for individual panels so one failure does not cascade.

export function PanelErrorBoundary({
  children,
  panelName,
  fallback,
}: {
  children: ReactNode;
  panelName?: string;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary
      level="panel"
      fallback={fallback}
      onError={(error, info) => {
        logger.error(`Panel error${panelName ? ` in ${panelName}` : ''}`, error, {
          componentStack: info.componentStack || '',
          panelName: panelName ?? 'unknown',
        });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
