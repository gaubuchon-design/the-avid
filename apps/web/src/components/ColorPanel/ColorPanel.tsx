// =============================================================================
//  THE AVID -- Color Panel (Resolve-Style Tabbed Controls)
//  Primary/Log wheels, curves, qualifier, power windows, node graph.
// =============================================================================

import React from 'react';
import { useColorStore, ColorViewTab } from '../../store/color.store';
import { PrimaryWheels, LogWheels } from './PrimaryWheels';
import { CurvesEditor } from './CurvesEditor';
import { QualifierPanel } from './QualifierPanel';
import { PowerWindowsPanel } from './PowerWindowsPanel';
import { NodeGraph } from './NodeGraph';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS: { value: ColorViewTab; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'log', label: 'Log' },
  { value: 'curves', label: 'Curves' },
  { value: 'qualifier', label: 'Qualifier' },
  { value: 'windows', label: 'Windows' },
  { value: 'nodeGraph', label: 'Nodes' },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export function ColorPanel() {
  const activeView = useColorStore((s) => s.activeView);
  const setActiveView = useColorStore((s) => s.setActiveView);
  const processingMode = useColorStore((s) => s.processingMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-raised)',
        flexShrink: 0,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveView(tab.value)}
            style={{
              padding: '5px 14px',
              fontSize: 10,
              fontWeight: activeView === tab.value ? 600 : 400,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: activeView === tab.value ? 'var(--text-primary)' : 'var(--text-muted)',
              background: activeView === tab.value ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: activeView === tab.value
                ? '2px solid var(--brand)'
                : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* GPU status indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 8px',
          fontSize: 8,
          color: 'var(--text-muted)',
        }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: processingMode === 'gpu' ? '#4ade80' : '#fbbf24',
          }} />
          {processingMode.toUpperCase()}
        </div>
      </div>

      {/* Active panel */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {activeView === 'primary' && <PrimaryWheels />}
        {activeView === 'log' && <LogWheels />}
        {activeView === 'curves' && <CurvesEditor />}
        {activeView === 'qualifier' && <QualifierPanel />}
        {activeView === 'windows' && <PowerWindowsPanel />}
        {activeView === 'nodeGraph' && <NodeGraph />}
      </div>
    </div>
  );
}
