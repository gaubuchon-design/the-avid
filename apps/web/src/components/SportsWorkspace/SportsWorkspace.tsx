// ─── Sports Workspace Preset ──────────────────────────────────────────────────
// SP-12: Complete sports production workspace layout with EVS Browser top-left,
// SportsHighlights center-left, Record Monitor top-center, SportsCam top-right,
// Timeline bottom 60%, PackageBuilder right panel.

import React from 'react';
import { EVSBrowser } from '../EVSBrowser/EVSBrowser';
import { SportsHighlights } from '../SportsHighlights/SportsHighlights';
import { SportsCamViewer } from '../SportsCamViewer/SportsCamViewer';
import { PackageBuilderPanel } from '../PackageBuilder/PackageBuilderPanel';
import { StatsOverlay } from '../StatsOverlay/StatsOverlay';
import { TimelinePanel } from '../TimelinePanel/TimelinePanel';
import { useSportsStore } from '../../store/sports.store';
import { useEditorStore } from '../../store/editor.store';

// ─── Record Monitor Placeholder ───────────────────────────────────────────────
// In production, this connects to the actual Record Monitor component.
// For the workspace preset, we render a placeholder with the stats overlay.

function RecordMonitorArea() {
  const { showStatsOverlay, sportsMetadata } = useSportsStore();
  const { playheadTime, duration, isPlaying } = useEditorStore();

  const formatTC = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 25);
    return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':') + ':' + String(f).padStart(2, '0');
  };

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        background: '#111',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Monitor area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #0a0a0a 0%, #161616 100%)',
          position: 'relative',
        }}
      >
        <span style={{ fontSize: 14, color: '#444' }}>RECORD MONITOR</span>

        {/* Stats overlay in corner */}
        {showStatsOverlay && (
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <StatsOverlay />
          </div>
        )}

        {/* Recording indicator */}
        {isPlaying && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ef4444',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>REC</span>
          </div>
        )}
      </div>

      {/* Timecode bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 10px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: '#1a1a1a',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
          {formatTC(playheadTime)}
        </span>
        <span style={{ fontSize: 9, color: '#555' }}>|</span>
        <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
          DUR {formatTC(duration)}
        </span>
      </div>
    </div>
  );
}

// ─── Main Workspace ───────────────────────────────────────────────────────────

export function SportsWorkspace() {
  const { showEVSBrowser, showHighlightsPanel, showPackageBuilder, showCamGrid } = useSportsStore();

  return (
    <div
      className="sports-workspace"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        gap: 2,
        background: '#141414',
        overflow: 'hidden',
      }}
    >
      {/* Top row: 40% height */}
      <div
        style={{
          display: 'flex',
          height: '40%',
          gap: 2,
          minHeight: 0,
        }}
      >
        {/* Left column: EVS Browser + Highlights */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: showPackageBuilder ? '25%' : '30%',
            gap: 2,
            minWidth: 0,
          }}
        >
          {showEVSBrowser && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <EVSBrowser />
            </div>
          )}
          {showHighlightsPanel && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <SportsHighlights />
            </div>
          )}
        </div>

        {/* Center: Record Monitor */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <RecordMonitorArea />
        </div>

        {/* Right column: Multi-Cam + Package Builder */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: showPackageBuilder ? '25%' : '20%',
            gap: 2,
            minWidth: 0,
          }}
        >
          {showCamGrid && (
            <div style={{ flex: showPackageBuilder ? 1 : 2, minHeight: 0 }}>
              <SportsCamViewer />
            </div>
          )}
          {showPackageBuilder && (
            <div style={{ flex: 1, minHeight: 0 }}>
              <PackageBuilderPanel />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Timeline 60% height */}
      <div style={{ height: '60%', minHeight: 0 }}>
        <TimelinePanel />
      </div>
    </div>
  );
}

// ─── Workspace Preset Activator ───────────────────────────────────────────────

/**
 * Hook to activate the sports workspace preset.
 * Sets all panel visibility flags and configures the editor for sports mode.
 */
export function useSportsWorkspacePreset() {
  const {
    toggleEVSBrowser,
    toggleHighlightsPanel,
    togglePackageBuilder,
    toggleCamGrid,
    toggleStatsOverlay,
    showEVSBrowser,
    showHighlightsPanel,
    showPackageBuilder,
    showCamGrid,
    showStatsOverlay,
  } = useSportsStore();

  const activate = () => {
    if (!showEVSBrowser) toggleEVSBrowser();
    if (!showHighlightsPanel) toggleHighlightsPanel();
    if (!showPackageBuilder) togglePackageBuilder();
    if (!showCamGrid) toggleCamGrid();
    if (!showStatsOverlay) toggleStatsOverlay();
  };

  const deactivate = () => {
    if (showEVSBrowser) toggleEVSBrowser();
    if (showHighlightsPanel) toggleHighlightsPanel();
    if (showPackageBuilder) togglePackageBuilder();
    if (showCamGrid) toggleCamGrid();
    if (showStatsOverlay) toggleStatsOverlay();
  };

  return { activate, deactivate };
}
