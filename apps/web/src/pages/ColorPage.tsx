// =============================================================================
//  THE AVID -- Color Page (Resolve-Style)
//  Color wheels, curves, node graph, scopes, and gallery for grading.
// =============================================================================

import React, { useState } from 'react';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { ColorPanel } from '../components/ColorPanel/ColorPanel';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';

type ColorTab = 'wheels' | 'curves' | 'hsl' | 'nodes';

export function ColorPage() {
  const [activeTab, setActiveTab] = useState<ColorTab>('wheels');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top section: Scopes + Monitor + Gallery */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Scopes panel */}
        <div style={{
          width: 260, flexShrink: 0, borderRight: '1px solid var(--border-default)',
          background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
            Scopes
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: 4 }}>
            {/* Waveform */}
            <div style={{ flex: 1, background: '#000', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <canvas width={240} height={120} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            {/* Vectorscope */}
            <div style={{ flex: 1, background: '#000', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <canvas width={240} height={120} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        </div>

        {/* Record Monitor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <RecordMonitor />
        </div>

        {/* Gallery */}
        <div style={{
          width: 200, flexShrink: 0, borderLeft: '1px solid var(--border-default)',
          background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
            Gallery
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {/* Gallery stills would go here */}
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
              Right-click viewer to grab a still
            </div>
          </div>
        </div>
      </div>

      {/* Color grading controls */}
      <div style={{ height: 240, flexShrink: 0, borderTop: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-raised)' }}>
          {(['wheels', 'curves', 'hsl', 'nodes'] as ColorTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '5px 16px', fontSize: 10, fontWeight: activeTab === tab ? 600 : 400,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                background: activeTab === tab ? 'var(--bg-active)' : 'transparent',
                border: 'none', borderBottom: activeTab === tab ? '2px solid var(--brand)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ColorPanel />
        </div>
      </div>

      {/* Compact timeline strip */}
      <div style={{ height: 80, flexShrink: 0, borderTop: '1px solid var(--border-default)' }}>
        <TimelinePanel />
      </div>
    </div>
  );
}
