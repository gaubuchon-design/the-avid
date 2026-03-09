// =============================================================================
//  THE AVID — Deliver Page (Resolve + Media Encoder Hybrid)
//  Three-panel layout: Template browser | Format config + preview | Queue/Workers
//  Powered by dedicated deliver.store and RenderFarmEngine.
// =============================================================================

import React from 'react';
import { TemplatePanel } from '../components/Deliver/TemplatePanel';
import { FormatSettingsPanel } from '../components/Deliver/FormatSettingsPanel';
import { RenderQueuePanel } from '../components/Deliver/RenderQueuePanel';
import { WorkerAdminPanel } from '../components/Deliver/WorkerAdminPanel';
import { JobHistoryPanel } from '../components/Deliver/JobHistoryPanel';
import { TemplateEditor } from '../components/Deliver/TemplateEditor';
import { useDeliverStore } from '../store/deliver.store';
import type { RightPanelTab } from '../types/deliver.types';

// ─── Right Panel Tab Config ─────────────────────────────────────────────────

const RIGHT_TABS: { key: RightPanelTab; label: string }[] = [
  { key: 'queue', label: 'Queue' },
  { key: 'workers', label: 'Workers' },
  { key: 'history', label: 'History' },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function DeliverPage() {
  const rightPanelTab = useDeliverStore((s) => s.rightPanelTab);
  const renderQueue = useDeliverStore((s) => s.renderQueue);
  const workers = useDeliverStore((s) => s.workers);
  const completedJobs = useDeliverStore((s) => s.completedJobs);
  const setRightPanelTab = useDeliverStore((s) => s.setRightPanelTab);

  return (
    <div style={pageStyle}>
      {/* Left Panel — Template Browser */}
      <TemplatePanel />

      {/* Center Panel — Preview + Format Settings */}
      <FormatSettingsPanel />

      {/* Right Panel — Queue / Workers / History */}
      <div style={rightPanelStyle}>
        {/* Tab header */}
        <div style={tabBarStyle}>
          {RIGHT_TABS.map((tab) => {
            const count = tab.key === 'queue' ? renderQueue.length
              : tab.key === 'workers' ? workers.length
              : completedJobs.length;
            return (
              <button
                key={tab.key}
                onClick={() => setRightPanelTab(tab.key)}
                style={{
                  ...tabBtnStyle,
                  borderBottom: rightPanelTab === tab.key ? '2px solid var(--brand)' : '2px solid transparent',
                  color: rightPanelTab === tab.key ? 'var(--text-accent)' : 'var(--text-muted)',
                }}
              >
                {tab.label}
                {count > 0 && <span style={countBadgeStyle}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {rightPanelTab === 'queue' && <RenderQueuePanel />}
        {rightPanelTab === 'workers' && <WorkerAdminPanel />}
        {rightPanelTab === 'history' && <JobHistoryPanel />}
      </div>

      {/* Template Editor Modal */}
      <TemplateEditor />
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  overflow: 'hidden',
};

const rightPanelStyle: React.CSSProperties = {
  width: 300,
  flexShrink: 0,
  borderLeft: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  borderBottom: '1px solid var(--border-default)',
};

const tabBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 0',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 8,
  padding: '0px 4px',
  borderRadius: 6,
  background: 'var(--bg-overlay)',
  color: 'var(--text-tertiary)',
  fontWeight: 700,
  minWidth: 14,
  textAlign: 'center',
};
