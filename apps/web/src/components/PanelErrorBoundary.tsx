// =============================================================================
//  THE AVID — Panel-specific Error Boundary
// =============================================================================

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createLogger } from '../lib/logger';

const logger = createLogger('PanelErrorBoundary');

interface Props {
  panelName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * A scoped error boundary for individual panels.
 *
 * When a panel crashes, it shows a minimal error message with a
 * "Reload Panel" button instead of tearing down the entire editor.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error(`Panel "${this.props.panelName}" crashed`, error, {
      componentStack: info.componentStack || '',
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: 24,
            color: 'var(--text-secondary)',
            textAlign: 'center',
            background: 'var(--bg-surface)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            {this.props.panelName} encountered an error
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              marginBottom: 16,
              maxWidth: 320,
              wordBreak: 'break-word',
            }}
          >
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Reload Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
