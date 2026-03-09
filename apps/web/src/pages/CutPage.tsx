// =============================================================================
//  THE AVID -- Cut Page (Resolve-Style)
//  Simplified dual source/record layout for fast cutting with filmstrip timeline.
// =============================================================================

import React from 'react';
import { SourceMonitor } from '../components/SourceMonitor/SourceMonitor';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { BinPanel } from '../components/Bins/BinPanel';

export function CutPage() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--border-subtle)' }}>
          <SourceMonitor />
        </div>

        {/* Record Monitor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <RecordMonitor />
        </div>
      </div>

      {/* Bottom: Compact timeline */}
      <div style={{ height: 200, flexShrink: 0, borderTop: '1px solid var(--border-default)' }}>
        <TimelinePanel />
      </div>
    </div>
  );
}
