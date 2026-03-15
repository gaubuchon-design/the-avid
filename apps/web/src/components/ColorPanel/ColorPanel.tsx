// =============================================================================
//  THE AVID -- Color Panel (Resolve-Style Tabbed Controls)
//  Primary/Log wheels, curves, qualifier, power windows, node graph.
// =============================================================================

import React, { memo } from 'react';
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
  { value: 'pipeline', label: 'Pipeline' },
];

// ─── Color Pipeline Settings Panel ──────────────────────────────────────────

const COLOR_SPACE_LABELS: Record<string, string> = {
  'rec709': 'Rec. 709 (HD)',
  'rec2020': 'Rec. 2020 (UHD / WCG)',
  'dci-p3': 'DCI-P3 (Cinema)',
  'aces-linear': 'ACES AP0 Linear',
  'aces-cct': 'ACEScct',
  'srgb': 'sRGB',
};

const DISPLAY_TRANSFORM_LABELS: Record<string, string> = {
  'sdr-rec709': 'SDR — Rec. 709',
  'hdr-pq': 'HDR — PQ (ST 2084)',
  'hdr-hlg': 'HDR — HLG',
};

const pipelineSelectStyle: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  background: 'var(--bg-void)',
  color: 'var(--text-primary)',
  fontSize: 11,
  flex: 1,
  cursor: 'pointer',
  outline: 'none',
};

function PipelineSettingsPanel() {
  const sourceColorSpace = useColorStore((s) => s.sourceColorSpace);
  const workingColorSpace = useColorStore((s) => s.workingColorSpace);
  const displayTransform = useColorStore((s) => s.displayTransform);
  const pipelineMismatch = useColorStore((s) => s.pipelineMismatch);
  const pipelineAutoDetect = useColorStore((s) => s.pipelineAutoDetect);
  const setSourceColorSpace = useColorStore((s) => s.setSourceColorSpace);
  const setWorkingColorSpace = useColorStore((s) => s.setWorkingColorSpace);
  const setDisplayTransform = useColorStore((s) => s.setDisplayTransform);
  const setPipelineAutoDetect = useColorStore((s) => s.setPipelineAutoDetect);

  return (
    <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
        Color Pipeline
      </div>

      {/* Source Color Space */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 110 }}>Source</span>
          {pipelineAutoDetect ? (
            <span style={{ ...pipelineSelectStyle, background: 'transparent', border: '1px dashed var(--border-subtle)', cursor: 'default' }}>
              {sourceColorSpace ? COLOR_SPACE_LABELS[sourceColorSpace] ?? sourceColorSpace : 'Auto-detect (no clip selected)'}
            </span>
          ) : (
            <select
              style={pipelineSelectStyle}
              value={sourceColorSpace ?? 'rec709'}
              onChange={(e) => setSourceColorSpace(e.target.value as any)}
            >
              {Object.entries(COLOR_SPACE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          )}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={pipelineAutoDetect}
            onChange={(e) => setPipelineAutoDetect(e.target.checked)}
          />
          Auto-detect from source clip metadata
        </label>
      </div>

      {/* Working Color Space */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 110 }}>Working</span>
        <select
          style={pipelineSelectStyle}
          value={workingColorSpace}
          onChange={(e) => setWorkingColorSpace(e.target.value as any)}
        >
          <option value="rec709">Rec. 709 (HD)</option>
          <option value="rec2020">Rec. 2020 (UHD / WCG)</option>
          <option value="dci-p3">DCI-P3 (Cinema)</option>
          <option value="aces-cct">ACEScct (ACES)</option>
        </select>
      </div>

      {/* Display Transform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 110 }}>Display</span>
        <select
          style={pipelineSelectStyle}
          value={displayTransform}
          onChange={(e) => setDisplayTransform(e.target.value as any)}
        >
          {Object.entries(DISPLAY_TRANSFORM_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Pipeline Status */}
      <div style={{
        marginTop: 16, padding: 12,
        background: pipelineMismatch ? 'rgba(251, 191, 36, 0.08)' : 'rgba(74, 222, 128, 0.06)',
        border: `1px solid ${pipelineMismatch ? 'rgba(251, 191, 36, 0.25)' : 'rgba(74, 222, 128, 0.2)'}`,
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: pipelineMismatch ? '#fbbf24' : '#4ade80', marginBottom: 6 }}>
          {pipelineMismatch ? 'Transform Active' : 'Pipeline Clean'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {pipelineMismatch
            ? `Source (${COLOR_SPACE_LABELS[sourceColorSpace ?? ''] ?? sourceColorSpace ?? 'unknown'}) differs from working space (${COLOR_SPACE_LABELS[workingColorSpace] ?? workingColorSpace}). An input color transform will be applied.`
            : 'Source and working color spaces match. No input transform needed.'
          }
        </div>
      </div>

      {/* Pipeline Flow Diagram */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)' }}>
        <span style={{ padding: '3px 8px', background: 'var(--bg-elevated)', borderRadius: 4, fontWeight: 600 }}>
          {COLOR_SPACE_LABELS[sourceColorSpace ?? 'rec709'] ?? 'Source'}
        </span>
        <span style={{ color: pipelineMismatch ? '#fbbf24' : 'var(--text-muted)' }}>→</span>
        <span style={{ padding: '3px 8px', background: 'var(--brand-dim, rgba(91,110,244,0.12))', borderRadius: 4, fontWeight: 600, color: 'var(--brand-bright)' }}>
          {COLOR_SPACE_LABELS[workingColorSpace] ?? workingColorSpace}
        </span>
        <span>→</span>
        <span style={{ padding: '3px 8px', background: 'var(--bg-elevated)', borderRadius: 4, fontWeight: 600 }}>
          {DISPLAY_TRANSFORM_LABELS[displayTransform] ?? displayTransform}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const ColorPanel = memo(function ColorPanel() {
  const activeView = useColorStore((s) => s.activeView);
  const setActiveView = useColorStore((s) => s.setActiveView);
  const processingMode = useColorStore((s) => s.processingMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} role="region" aria-label="Color Panel">
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-raised)',
        flexShrink: 0,
      }} role="tablist" aria-label="Color correction tabs">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveView(tab.value)}
            role="tab"
            aria-selected={activeView === tab.value}
            aria-controls={`color-panel-${tab.value}`}
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
        }} role="status" aria-label={`Processing mode: ${processingMode.toUpperCase()}`}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: processingMode === 'gpu' ? '#4ade80' : '#fbbf24',
          }} aria-hidden="true" />
          {processingMode.toUpperCase()}
        </div>
      </div>

      {/* Active panel */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }} role="tabpanel" id={`color-panel-${activeView}`}>
        {activeView === 'primary' && <PrimaryWheels />}
        {activeView === 'log' && <LogWheels />}
        {activeView === 'curves' && <CurvesEditor />}
        {activeView === 'qualifier' && <QualifierPanel />}
        {activeView === 'windows' && <PowerWindowsPanel />}
        {activeView === 'nodeGraph' && <NodeGraph />}
        {activeView === 'pipeline' && <PipelineSettingsPanel />}
      </div>
    </div>
  );
});
