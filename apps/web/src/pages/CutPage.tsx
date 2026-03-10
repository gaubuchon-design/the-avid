// =============================================================================
//  THE AVID -- Cut Page (Resolve-Style)
//  Simplified dual source/record layout for fast cutting with filmstrip timeline.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { SourceMonitor } from '../components/SourceMonitor/SourceMonitor';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { BinPanel } from '../components/Bins/BinPanel';

function CutPageSkeleton() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} aria-hidden="true">
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          <div style={{ padding: 12 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 8, width: `${60 + Math.random() * 40}%` }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
        </div>
        <div style={{ flex: 1, background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid var(--border-subtle)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      </div>
      <div style={{ height: 200, flexShrink: 0, borderTop: '1px solid var(--border-default)', background: 'var(--bg-surface)' }} />
    </div>
  );
}

export function CutPage() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Brief loading state for panel initialization
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return <CutPageSkeleton />;
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      role="region"
      aria-label="Cut Page - Dual monitor editing"
    >
      {/* Top: Dual monitors with compact bin browser */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Compact bin strip */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <BinPanel />
        </div>

        {/* Source Monitor */}
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--border-subtle)' }}
          role="region"
          aria-label="Source monitor"
        >
          <SourceMonitor />
        </div>

        {/* Record Monitor */}
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          role="region"
          aria-label="Record monitor"
        >
          <RecordMonitor />
        </div>
      </div>

      {/* Bottom: Compact timeline */}
      <div
        style={{ height: 200, flexShrink: 0, borderTop: '1px solid var(--border-default)' }}
        role="region"
        aria-label="Cut page timeline"
      >
        <TimelinePanel />
      </div>
    </div>
  );
}
