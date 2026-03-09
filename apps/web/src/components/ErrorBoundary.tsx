// =============================================================================
//  THE AVID — Application Error Boundary
// =============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createLogger } from '../lib/logger';

const logger = createLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional callback invoked when the boundary catches an error. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * When any value in this array changes, the error boundary automatically
   * resets — useful for route transitions or key prop changes.
   */
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  /** Stash the previous resetKeys for comparison in componentDidUpdate. */
  private prevResetKeys: unknown[] | undefined = undefined;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Uncaught error in component tree', error, {
      componentStack: info.componentStack || '',
    });
    this.setState({ errorInfo: info });
    this.props.onError?.(error, info);
  }

  componentDidMount(): void {
    this.prevResetKeys = this.props.resetKeys;
  }

  componentDidUpdate(prevProps: Readonly<Props>): void {
    // Auto-reset when resetKeys change while in an error state
    if (this.state.hasError && this.props.resetKeys) {
      const prev = prevProps.resetKeys ?? [];
      const next = this.props.resetKeys;
      const changed =
        prev.length !== next.length || prev.some((v, i) => v !== next[i]);
      if (changed) {
        this.setState({ hasError: false, error: null, errorInfo: null });
      }
    }
    this.prevResetKeys = this.props.resetKeys;
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDev =
        typeof import.meta !== 'undefined' &&
        (import.meta as unknown as Record<string, Record<string, unknown>>).env?.DEV === true;

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>
            Something went wrong
          </h2>
          <p style={{ marginBottom: 16 }}>{this.state.error?.message}</p>

          {/* Show component stack in dev mode */}
          {isDev && this.state.errorInfo?.componentStack && (
            <pre
              style={{
                textAlign: 'left',
                fontSize: 11,
                color: 'var(--text-tertiary)',
                background: 'var(--bg-raised)',
                padding: 12,
                borderRadius: 'var(--radius-md)',
                maxHeight: 200,
                overflow: 'auto',
                marginBottom: 16,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.errorInfo.componentStack}
            </pre>
          )}

          <button
            className="tl-btn"
            onClick={() =>
              this.setState({ hasError: false, error: null, errorInfo: null })
            }
            style={{
              background: 'var(--accent-primary)',
              color: '#fff',
              padding: '8px 20px',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
