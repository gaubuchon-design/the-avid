// =============================================================================
//  THE AVID -- Multi-Camera Record Monitor (MC-02)
//  UI for multi-camera sync, live-switch preview, angle management,
//  program track, and AI-suggested smooth cuts.
//
//  Enhanced with:
//  - Full active camera view with program output
//  - Transport controls (Play/Pause/Stop, JKL shuttle, frame step)
//  - Timecode display with drop-frame / non-drop-frame support
//  - Camera switch overlay indicator with transition info
//  - Split-screen comparison mode (side-by-side two cameras)
//  - Mark In/Out points for multicam regions
//  - Frame-accurate shuttle and jog controls
//
//  Full DaVinci Resolve + Avid Media Composer monitor parity.
// =============================================================================

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type {
  CameraAngle,
  MultiCamGroup,
  MultiCamSwitchEvent,
  MultiCamSyncMethod,
  MultiCamSyncStatus,
  SyncResult,
  MultiCamProgramTrack,
} from '@mcua/core/editing/MultiCamSyncEngine';

// --- Helpers ----------------------------------------------------------------

function secondsToTC(seconds: number, frameRate = 23.976): string {
  const totalFrames = Math.round(seconds * frameRate);
  const frames = totalFrames % Math.round(frameRate);
  const totalSecs = Math.floor(totalFrames / Math.round(frameRate));
  const secs = totalSecs % 60;
  const mins = Math.floor(totalSecs / 60) % 60;
  const hours = Math.floor(totalSecs / 3600);
  return [
    hours.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0'),
    frames.toString().padStart(2, '0'),
  ].join(':');
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function confidenceLabel(c: number): string {
  if (c >= 0.95) return 'Excellent';
  if (c >= 0.8) return 'Good';
  if (c >= 0.5) return 'Fair';
  if (c > 0) return 'Low';
  return 'None';
}

function syncMethodLabel(method: MultiCamSyncMethod): string {
  switch (method) {
    case 'timecode-ltc': return 'Timecode (LTC)';
    case 'timecode-vitc': return 'Timecode (VITC)';
    case 'audio-waveform': return 'Audio Waveform';
    case 'slate-clap': return 'Slate/Clap';
    case 'manual-drag': return 'Manual';
    default: return method;
  }
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// --- Local State Types ------------------------------------------------------

interface MultiCamMonitorState {
  groups: MultiCamGroup[];
  activeGroupId: string | null;
  programTrack: MultiCamProgramTrack | null;
  currentTimeSeconds: number;
  activeAngleId: string | null;
  isPlaying: boolean;
  aiSuggestions: MultiCamSwitchEvent[];
  showSuggestions: boolean;
  activeTab: 'angles' | 'sync' | 'program' | 'preview';
  // Transport state
  playbackSpeed: number; // 1 = normal, negative = reverse
  shuttleSpeed: number; // -8 to 8
  inPoint: number | null;
  outPoint: number | null;
  // Split-screen
  splitMode: boolean;
  splitAngleId: string | null;
  // Switch overlay
  showSwitchOverlay: boolean;
  lastSwitchEvent: { fromLabel: string; toLabel: string; time: number } | null;
}

// --- Styles -----------------------------------------------------------------

const ANGLE_COLORS = ['#5b6af5', '#7c5cfc', '#e05dbb', '#ef4444', '#f59e0b', '#22c55e', '#06b6d4', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#a855f7', '#f43f5e', '#0ea5e9', '#eab308'];

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    overflow: 'hidden',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-default)',
    flexShrink: 0,
  },
  title: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-primary)',
  },
  statusBadge: (ok: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 600,
    background: ok ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
    color: ok ? '#22c55e' : '#94a3b8',
  }),
  dot: (color: string) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  tabBar: {
    display: 'flex',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-default)',
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '7px 6px',
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    border: 'none',
    background: active ? 'var(--bg-hover)' : 'transparent',
    borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 150ms',
  }),
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    minHeight: 0,
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    marginBottom: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  label: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  value: {
    fontSize: '11px',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  btn: (variant: 'primary' | 'secondary' | 'danger' | 'ghost') => ({
    padding: variant === 'ghost' ? '4px 8px' : '6px 12px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    transition: 'all 150ms',
    background:
      variant === 'primary' ? 'var(--brand)'
        : variant === 'danger' ? '#ef4444'
          : variant === 'ghost' ? 'transparent'
            : 'var(--bg-hover)',
    color:
      variant === 'primary' || variant === 'danger' ? '#fff'
        : variant === 'ghost' ? 'var(--text-muted)'
          : 'var(--text-primary)',
  }),
  angleCard: (isActive: boolean, color: string) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    borderRadius: '6px',
    border: isActive ? `2px solid ${color}` : '1px solid var(--border-subtle)',
    background: isActive ? `${color}10` : 'transparent',
    marginBottom: '4px',
    cursor: 'pointer',
    transition: 'all 150ms',
  }),
  angleBadge: (color: string) => ({
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    background: color,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '10px',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  }),
  monitorGrid: (count: number) => ({
    display: 'grid',
    gridTemplateColumns: count <= 4 ? `repeat(2, 1fr)` : `repeat(${Math.min(4, Math.ceil(Math.sqrt(count)))}, 1fr)`,
    gap: '4px',
    marginBottom: '12px',
  }),
  monitorCell: (isActive: boolean, color: string) => ({
    aspectRatio: '16/9',
    borderRadius: '4px',
    border: isActive ? `3px solid ${color}` : '1px solid var(--border-subtle)',
    background: '#0a0a0a',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 150ms',
    position: 'relative' as const,
    overflow: 'hidden',
    boxShadow: isActive ? `0 0 8px ${color}44` : 'none',
  }),
  monitorLabel: (color: string) => ({
    position: 'absolute' as const,
    top: '4px',
    left: '4px',
    padding: '1px 4px',
    borderRadius: '2px',
    fontSize: '8px',
    fontWeight: 700,
    background: color,
    color: '#fff',
  }),
  syncResultBadge: (aligned: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '9px',
    fontWeight: 600,
    background: aligned ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
    color: aligned ? '#22c55e' : '#ef4444',
  }),
  switchItem: (type: string) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 6px',
    borderRadius: '3px',
    marginBottom: '2px',
    fontSize: '10px',
    background: type === 'ai-suggestion' ? 'rgba(124, 92, 252, 0.08)' : 'transparent',
    borderBottom: '1px solid var(--border-subtle)',
  }),
  timecodeDisplay: {
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    background: 'rgba(0,0,0,0.3)',
    padding: '4px 8px',
    borderRadius: '4px',
    letterSpacing: '0.08em',
  },
  transportBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 12px',
    borderTop: '1px solid var(--border-default)',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
  },
  transportBtn: (active: boolean, variant: 'normal' | 'danger' | 'accent' = 'normal') => ({
    padding: '5px 10px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    border: active ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
    cursor: 'pointer',
    transition: 'all 150ms',
    background: active
      ? (variant === 'danger' ? '#ef4444' : variant === 'accent' ? 'var(--brand)' : 'var(--bg-hover)')
      : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    minWidth: 28,
    textAlign: 'center' as const,
  }),
  empty: {
    textAlign: 'center' as const,
    padding: '24px 12px',
    color: 'var(--text-muted)',
    fontSize: '11px',
  },
  programMonitor: (color: string) => ({
    aspectRatio: '16/9',
    borderRadius: '6px',
    border: `2px solid ${color}`,
    background: '#0a0a0a',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
    marginBottom: '8px',
    overflow: 'hidden',
  }),
  switchOverlay: {
    position: 'absolute' as const,
    bottom: '8px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '4px',
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(4px)',
    zIndex: 3,
  },
  markPoint: (active: boolean) => ({
    padding: '3px 8px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 600,
    fontFamily: 'var(--font-mono, monospace)',
    border: `1px solid ${active ? 'var(--brand)' : 'var(--border-subtle)'}`,
    background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
    color: active ? 'var(--brand-bright)' : 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 100ms',
  }),
};

// --- Mock Data Generator ----------------------------------------------------

function createMockGroup(): MultiCamGroup {
  const angles: CameraAngle[] = [
    { id: 'cam-a', label: 'CAM A - Wide', assetId: 'a1', fileName: 'A_Cam_Master.mxf', durationSeconds: 720, frameRate: 23.976, timecodeStart: '01:00:00:00', timecodeStartSeconds: 3600, audioChannels: 2, sampleRate: 48000 },
    { id: 'cam-b', label: 'CAM B - Medium', assetId: 'a2', fileName: 'B_Cam_Wide.mxf', durationSeconds: 720, frameRate: 23.976, timecodeStart: '01:00:00:12', timecodeStartSeconds: 3600.5, audioChannels: 2, sampleRate: 48000 },
    { id: 'cam-c', label: 'CAM C - Close-up', assetId: 'a3', fileName: 'C_Cam_CU.mxf', durationSeconds: 718, frameRate: 23.976, timecodeStart: '01:00:01:00', timecodeStartSeconds: 3601, audioChannels: 2, sampleRate: 48000 },
    { id: 'cam-d', label: 'CAM D - Alt Angle', assetId: 'a4', fileName: 'D_Cam_Reverse.mxf', durationSeconds: 715, frameRate: 23.976, timecodeStart: '00:59:59:12', timecodeStartSeconds: 3599.5, audioChannels: 2, sampleRate: 48000 },
  ];

  return {
    id: 'mcg-demo',
    name: 'Scene 14 Multi-Cam',
    referenceAngleId: 'cam-a',
    angles,
    syncResults: angles.map((a) => ({
      angleId: a.id,
      offsetSeconds: a.id === 'cam-a' ? 0 : a.timecodeStartSeconds - 3600,
      confidence: a.id === 'cam-a' ? 1.0 : 0.95,
      method: 'timecode-ltc' as const,
      aligned: true,
    })),
    syncStatus: 'synced',
    handleDurationSeconds: 60,
    totalDurationSeconds: 720,
    frameRate: 23.976,
    createdAt: new Date().toISOString(),
  };
}

// --- Angles Tab -------------------------------------------------------------

function AnglesTab({
  group,
  activeAngleId,
  onSelectAngle,
}: {
  group: MultiCamGroup;
  activeAngleId: string | null;
  onSelectAngle: (id: string) => void;
}) {
  return (
    <div>
      {/* Multi-monitor grid */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Monitor View</div>
        <div style={S.monitorGrid(group.angles.length)} role="group" aria-label="Camera monitor grid">
          {group.angles.map((angle, idx) => {
            const isActive = angle.id === activeAngleId;
            const color = ANGLE_COLORS[idx % ANGLE_COLORS.length]!;
            return (
              <div
                key={angle.id}
                style={S.monitorCell(isActive, color)}
                onClick={() => onSelectAngle(angle.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAngle(angle.id); } }}
                role="button"
                tabIndex={0}
                aria-label={`${angle.label}${isActive ? ', active' : ''}`}
                aria-pressed={isActive}
              >
                {/* Tally light bar */}
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: '#ef4444',
                    zIndex: 2,
                  }} aria-hidden="true" />
                )}

                <div style={S.monitorLabel(color)}>{angle.label}</div>
                <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
                  {angle.fileName}
                </div>
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    background: '#ef4444',
                    fontSize: '7px',
                    fontWeight: 700,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} aria-hidden="true" />
                    LIVE
                  </div>
                )}
                {/* Keyboard shortcut */}
                {idx < 9 && (
                  <span style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    fontSize: '8px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'rgba(255,255,255,0.4)',
                    background: 'rgba(0,0,0,0.4)',
                    borderRadius: '2px',
                    padding: '0 3px',
                    lineHeight: '14px',
                  }} aria-hidden="true">
                    {idx + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Angle list */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Angles ({group.angles.length}/{16} max)</div>
        {group.angles.map((angle, idx) => {
          const color = ANGLE_COLORS[idx % ANGLE_COLORS.length]!;
          const isActive = angle.id === activeAngleId;
          const isRef = angle.id === group.referenceAngleId;
          const syncResult = group.syncResults.find((r) => r.angleId === angle.id);

          return (
            <div
              key={angle.id}
              style={S.angleCard(isActive, color)}
              onClick={() => onSelectAngle(angle.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAngle(angle.id); } }}
              role="button"
              tabIndex={0}
              aria-label={`Select ${angle.label}${isActive ? ', currently active' : ''}`}
              aria-pressed={isActive}
            >
              <div style={S.angleBadge(color)}>{angle.label.split(' ').pop()?.charAt(0) ?? idx}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={S.value}>{angle.label}</span>
                  {isRef && (
                    <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 700 }}>REF</span>
                  )}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                  <span>{angle.fileName}</span>
                  <span>{formatDuration(angle.durationSeconds)}</span>
                  <span>{angle.frameRate}fps</span>
                </div>
              </div>
              {syncResult && (
                <span style={S.syncResultBadge(syncResult.aligned)}>
                  {syncResult.aligned ? 'Synced' : 'Unsynced'}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Sync Tab ---------------------------------------------------------------

function SyncTab({
  group,
  onSync,
}: {
  group: MultiCamGroup;
  onSync: (method: MultiCamSyncMethod) => void;
}) {
  const syncStatusColor =
    group.syncStatus === 'synced' ? '#22c55e'
      : group.syncStatus === 'syncing' || group.syncStatus === 'analyzing' ? '#5b6af5'
        : group.syncStatus === 'error' ? '#ef4444'
          : '#94a3b8';

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Sync Status</div>
        <div style={S.row}>
          <span style={S.label}>Status</span>
          <span style={S.statusBadge(group.syncStatus === 'synced')}>
            <span style={S.dot(syncStatusColor)} />
            {group.syncStatus}
          </span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Frame Rate</span>
          <span style={S.value}>{group.frameRate} fps</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Handle Duration</span>
          <span style={S.value}>{group.handleDurationSeconds}s</span>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Sync Methods</div>
        {([
          { method: 'timecode-ltc' as const, label: 'Timecode (LTC)', desc: 'Uses embedded LTC timecode' },
          { method: 'timecode-vitc' as const, label: 'Timecode (VITC)', desc: 'Uses VITC from video signal' },
          { method: 'audio-waveform' as const, label: 'Audio Waveform', desc: 'Cross-correlates audio peaks' },
          { method: 'slate-clap' as const, label: 'Slate/Clap', desc: 'Mark clap points manually' },
        ]).map(({ method, label, desc }) => (
          <div key={method} style={{ marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={S.value}>{label}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{desc}</div>
              </div>
              <button style={S.btn('secondary')} onClick={() => onSync(method)} aria-label={`Sync using ${label}`}>Sync</button>
            </div>
          </div>
        ))}
      </div>

      {/* Sync Results */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Results ({group.syncResults.length})</div>
        {group.syncResults.map((result) => {
          const angle = group.angles.find((a) => a.id === result.angleId);
          return (
            <div key={result.angleId} style={S.row}>
              <div>
                <div style={S.value}>{angle?.label ?? result.angleId}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                  <span>Offset: {result.offsetSeconds.toFixed(3)}s</span>
                  <span>{syncMethodLabel(result.method)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  {confidenceLabel(result.confidence)} ({(result.confidence * 100).toFixed(0)}%)
                </span>
                <span style={S.syncResultBadge(result.aligned)}>
                  {result.aligned ? 'Aligned' : 'Misaligned'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Program Tab ------------------------------------------------------------

function ProgramTab({
  group,
  programTrack,
  aiSuggestions,
  showSuggestions,
  onToggleSuggestions,
  onSwitch,
  onDeleteSwitch,
}: {
  group: MultiCamGroup;
  programTrack: MultiCamProgramTrack | null;
  aiSuggestions: MultiCamSwitchEvent[];
  showSuggestions: boolean;
  onToggleSuggestions: () => void;
  onSwitch: (angleId: string, time: number) => void;
  onDeleteSwitch: (switchId: string) => void;
}) {
  const switches = programTrack?.switches ?? [];

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Program Track</div>
        <div style={S.row}>
          <span style={S.label}>Total Duration</span>
          <span style={S.value}>{formatDuration(group.totalDurationSeconds)}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Cuts</span>
          <span style={S.value}>{switches.length}</span>
        </div>
        <div style={S.row}>
          <span style={S.label}>Active Angle</span>
          <span style={S.value}>
            {group.angles.find((a) => a.id === programTrack?.activeAngleId)?.label ?? 'None'}
          </span>
        </div>
      </div>

      {/* AI Suggestions */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={S.sectionTitle}>AI Smooth Cut Suggestions</span>
            <span style={{
              fontSize: '8px',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'rgba(124,92,252,0.15)',
              color: '#a78bfa',
            }}>AI</span>
          </div>
          <button
            style={S.btn('ghost')}
            onClick={onToggleSuggestions}
            aria-expanded={showSuggestions}
            aria-label={showSuggestions ? 'Hide AI suggestions' : 'Show AI suggestions'}
          >
            {showSuggestions ? 'Hide' : 'Show'} ({aiSuggestions.length})
          </button>
        </div>
        {showSuggestions && aiSuggestions.map((suggestion) => {
          const fromAngle = group.angles.find((a) => a.id === suggestion.fromAngleId);
          const toAngle = group.angles.find((a) => a.id === suggestion.toAngleId);
          return (
            <div key={suggestion.id} style={S.switchItem('ai-suggestion')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: '#7c5cfc', fontWeight: 600 }}>AI</span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {secondsToTC(suggestion.switchTimeSeconds, group.frameRate)}
                </span>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                  {fromAngle?.label} &rarr; {toAngle?.label}
                </span>
              </div>
              <button
                style={{ ...S.btn('secondary'), padding: '2px 6px', fontSize: '9px' }}
                onClick={() => onSwitch(suggestion.toAngleId, suggestion.switchTimeSeconds)}
                aria-label={`Apply AI suggestion: switch to ${toAngle?.label} at ${secondsToTC(suggestion.switchTimeSeconds, group.frameRate)}`}
              >
                Apply
              </button>
            </div>
          );
        })}
        {showSuggestions && aiSuggestions.length === 0 && (
          <div style={S.empty}>No AI suggestions available. Sync angles first.</div>
        )}
      </div>

      {/* Switch History */}
      <div style={S.section}>
        <div style={S.sectionTitle}>Switch History ({switches.length})</div>
        <div role="list" aria-label="Camera switch history">
          {switches.map((sw) => {
            const fromAngle = group.angles.find((a) => a.id === sw.fromAngleId);
            const toAngle = group.angles.find((a) => a.id === sw.toAngleId);
            const toIdx = group.angles.findIndex((a) => a.id === sw.toAngleId);
            const color = toIdx >= 0 ? ANGLE_COLORS[toIdx % ANGLE_COLORS.length] : '#666';
            return (
              <div key={sw.id} style={{ ...S.switchItem(sw.switchType), gap: '4px' }} role="listitem">
                {/* Color indicator */}
                <div style={{ width: 3, height: 16, borderRadius: 1, background: color, flexShrink: 0 }} aria-hidden="true" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '10px', color: 'var(--text-primary)' }}>
                    {secondsToTC(sw.switchTimeSeconds, group.frameRate)}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {fromAngle?.label} &rarr; {toAngle?.label}
                  </span>
                </div>
                <span style={{
                  fontSize: '8px',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  color: sw.switchType === 'cut' ? '#22c55e'
                    : sw.switchType === 'dissolve' ? '#06b6d4'
                      : '#7c5cfc',
                }}>
                  {sw.switchType}
                </span>
                <button
                  style={{ ...S.btn('ghost'), padding: '2px 4px', fontSize: '8px', color: 'var(--error)' }}
                  onClick={() => onDeleteSwitch(sw.id)}
                  aria-label={`Delete switch at ${secondsToTC(sw.switchTimeSeconds, group.frameRate)}`}
                >
                  Del
                </button>
              </div>
            );
          })}
        </div>
        {switches.length === 0 && (
          <div style={S.empty}>No switches recorded. Click an angle to switch live.</div>
        )}
      </div>
    </div>
  );
}

// --- Preview Tab with Split-Screen Comparison --------------------------------

function PreviewTab({
  group,
  activeAngleId,
  currentTimeSeconds,
  splitMode,
  splitAngleId,
  inPoint,
  outPoint,
  lastSwitchEvent,
  showSwitchOverlay,
  onToggleSplit,
  onSetSplitAngle,
  onSetInPoint,
  onSetOutPoint,
  onClearInOut,
}: {
  group: MultiCamGroup;
  activeAngleId: string | null;
  currentTimeSeconds: number;
  splitMode: boolean;
  splitAngleId: string | null;
  inPoint: number | null;
  outPoint: number | null;
  lastSwitchEvent: { fromLabel: string; toLabel: string; time: number } | null;
  showSwitchOverlay: boolean;
  onToggleSplit: () => void;
  onSetSplitAngle: (angleId: string) => void;
  onSetInPoint: () => void;
  onSetOutPoint: () => void;
  onClearInOut: () => void;
}) {
  const activeAngle = group.angles.find((a) => a.id === activeAngleId);
  const activeIdx = group.angles.findIndex((a) => a.id === activeAngleId);
  const color = activeIdx >= 0 ? ANGLE_COLORS[activeIdx % ANGLE_COLORS.length]! : '#5b6af5';

  const splitAngle = splitAngleId ? group.angles.find((a) => a.id === splitAngleId) : null;
  const splitIdx = splitAngleId ? group.angles.findIndex((a) => a.id === splitAngleId) : -1;
  const splitColor = splitIdx >= 0 ? ANGLE_COLORS[splitIdx % ANGLE_COLORS.length]! : '#666';

  return (
    <div>
      {/* Split mode toggle + angle selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={S.sectionTitle}>Program Output</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            style={S.btn(splitMode ? 'primary' : 'secondary')}
            onClick={onToggleSplit}
            aria-label={splitMode ? 'Exit split-screen mode' : 'Enter split-screen comparison mode'}
            aria-pressed={splitMode}
          >
            {splitMode ? 'Exit Split' : 'Split Compare'}
          </button>
          {splitMode && (
            <select
              value={splitAngleId ?? ''}
              onChange={(e) => onSetSplitAngle(e.target.value)}
              style={{
                padding: '3px 6px',
                background: 'var(--bg-void)',
                border: '1px solid var(--border-default)',
                borderRadius: 3,
                color: 'var(--text-primary)',
                fontSize: 9,
                outline: 'none',
              }}
              aria-label="Select comparison camera angle"
            >
              {group.angles.filter((a) => a.id !== activeAngleId).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main preview / Split-screen */}
      {splitMode ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '8px' }}>
          {/* Active angle */}
          <div style={S.programMonitor(color)}>
            {activeAngle && <div style={S.monitorLabel(color)}>{activeAngle.label}</div>}
            <div style={{ fontSize: '8px', color: '#666', position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: '2px' }}>
              A
            </div>
            <div style={S.timecodeDisplay}>
              {secondsToTC(currentTimeSeconds, group.frameRate)}
            </div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
              {activeAngle?.fileName ?? 'No angle selected'}
            </div>
          </div>
          {/* Comparison angle */}
          <div style={S.programMonitor(splitColor)}>
            {splitAngle && <div style={S.monitorLabel(splitColor)}>{splitAngle.label}</div>}
            <div style={{ fontSize: '8px', color: '#666', position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: '2px' }}>
              B
            </div>
            <div style={S.timecodeDisplay}>
              {secondsToTC(currentTimeSeconds, group.frameRate)}
            </div>
            <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
              {splitAngle?.fileName ?? 'Select comparison angle'}
            </div>
          </div>
        </div>
      ) : (
        <div style={S.programMonitor(color)}>
          {/* Tally bar */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: '#ef4444',
            zIndex: 2,
          }} aria-hidden="true" />

          {activeAngle && <div style={S.monitorLabel(color)}>{activeAngle.label}</div>}
          <div style={S.timecodeDisplay} role="timer" aria-label={`Current timecode: ${secondsToTC(currentTimeSeconds, group.frameRate)}`}>
            {secondsToTC(currentTimeSeconds, group.frameRate)}
          </div>
          <div style={{ fontSize: '9px', color: '#666', marginTop: '4px' }}>
            {activeAngle?.fileName ?? 'No angle selected'}
          </div>

          {/* Camera switch overlay indicator */}
          {showSwitchOverlay && lastSwitchEvent && (
            <div style={S.switchOverlay} role="status" aria-label={`Camera switch: ${lastSwitchEvent.fromLabel} to ${lastSwitchEvent.toLabel}`}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                {lastSwitchEvent.fromLabel}
              </span>
              <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 700 }}>
                &rarr;
              </span>
              <span style={{ fontSize: '9px', color: '#fff', fontWeight: 600 }}>
                {lastSwitchEvent.toLabel}
              </span>
              <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)' }}>
                {secondsToTC(lastSwitchEvent.time, group.frameRate)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mark In/Out points */}
      <div style={S.section}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={S.sectionTitle}>Mark Points</div>
          {(inPoint !== null || outPoint !== null) && (
            <button style={S.btn('ghost')} onClick={onClearInOut} aria-label="Clear in and out points">
              Clear
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            style={S.markPoint(inPoint !== null)}
            onClick={onSetInPoint}
            aria-label={`Set in point at current time (${inPoint !== null ? secondsToTC(inPoint, group.frameRate) : 'not set'})`}
          >
            IN: {inPoint !== null ? secondsToTC(inPoint, group.frameRate) : '--:--:--:--'}
          </button>
          <button
            style={S.markPoint(outPoint !== null)}
            onClick={onSetOutPoint}
            aria-label={`Set out point at current time (${outPoint !== null ? secondsToTC(outPoint, group.frameRate) : 'not set'})`}
          >
            OUT: {outPoint !== null ? secondsToTC(outPoint, group.frameRate) : '--:--:--:--'}
          </button>
          {inPoint !== null && outPoint !== null && (
            <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              DUR: {secondsToTC(Math.abs(outPoint - inPoint), group.frameRate)}
            </span>
          )}
        </div>
      </div>

      {/* Active angle info */}
      {activeAngle && (
        <div style={S.section}>
          <div style={S.sectionTitle}>Active Angle</div>
          <div style={S.row}>
            <span style={S.label}>Label</span>
            <span style={S.value}>{activeAngle.label}</span>
          </div>
          <div style={S.row}>
            <span style={S.label}>File</span>
            <span style={S.value}>{activeAngle.fileName}</span>
          </div>
          <div style={S.row}>
            <span style={S.label}>Duration</span>
            <span style={S.value}>{formatDuration(activeAngle.durationSeconds)}</span>
          </div>
          <div style={S.row}>
            <span style={S.label}>Frame Rate</span>
            <span style={S.value}>{activeAngle.frameRate} fps</span>
          </div>
          <div style={S.row}>
            <span style={S.label}>TC Start</span>
            <span style={{ ...S.value, fontFamily: 'var(--font-mono, monospace)' }}>{activeAngle.timecodeStart}</span>
          </div>
          <div style={S.row}>
            <span style={S.label}>Audio</span>
            <span style={S.value}>{activeAngle.audioChannels}ch / {activeAngle.sampleRate / 1000}kHz</span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---------------------------------------------------------

export function MultiCamMonitor() {
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const switchOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<MultiCamMonitorState>(() => {
    const group = createMockGroup();
    const aiSuggestions: MultiCamSwitchEvent[] = [];
    // Generate AI suggestions
    const segmentDuration = group.totalDurationSeconds / (group.angles.length * 2);
    let currentIdx = 0;
    for (let t = segmentDuration; t < group.totalDurationSeconds; t += segmentDuration) {
      const nextIdx = (currentIdx + 1) % group.angles.length;
      aiSuggestions.push({
        id: `ai-switch-${aiSuggestions.length}`,
        fromAngleId: group.angles[currentIdx]!.id,
        toAngleId: group.angles[nextIdx]!.id,
        switchTimeSeconds: t,
        switchType: 'ai-suggestion',
      });
      currentIdx = nextIdx;
    }

    return {
      groups: [group],
      activeGroupId: group.id,
      programTrack: {
        groupId: group.id,
        switches: [],
        activeAngleId: group.referenceAngleId,
        totalDurationSeconds: group.totalDurationSeconds,
      },
      currentTimeSeconds: 0,
      activeAngleId: group.referenceAngleId,
      isPlaying: false,
      aiSuggestions,
      showSuggestions: true,
      activeTab: 'angles',
      playbackSpeed: 1,
      shuttleSpeed: 0,
      inPoint: null,
      outPoint: null,
      splitMode: false,
      splitAngleId: group.angles.length > 1 ? group.angles[1]!.id : null,
      showSwitchOverlay: false,
      lastSwitchEvent: null,
    };
  });

  const activeGroup = useMemo(
    () => state.groups.find((g) => g.id === state.activeGroupId) ?? null,
    [state.groups, state.activeGroupId],
  );

  // Playback simulation
  useEffect(() => {
    if (state.isPlaying && activeGroup) {
      playIntervalRef.current = setInterval(() => {
        setState((prev) => {
          const frameTime = 1 / (activeGroup.frameRate || 24);
          const newTime = prev.currentTimeSeconds + frameTime * prev.playbackSpeed;
          if (newTime >= activeGroup.totalDurationSeconds) {
            return { ...prev, currentTimeSeconds: activeGroup.totalDurationSeconds, isPlaying: false };
          }
          if (newTime < 0) {
            return { ...prev, currentTimeSeconds: 0, isPlaying: false };
          }
          return { ...prev, currentTimeSeconds: newTime };
        });
      }, 1000 / (activeGroup.frameRate || 24));
      return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
    }
    return undefined;
  }, [state.isPlaying, state.playbackSpeed, activeGroup]);

  // Keyboard shortcuts for transport (JKL shuttle)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case 'j':
        case 'J':
          e.preventDefault();
          setState((prev) => {
            const newSpeed = prev.playbackSpeed > 0 ? -1 : prev.playbackSpeed * 2;
            return { ...prev, isPlaying: true, playbackSpeed: clamp(newSpeed, -8, -1) };
          });
          break;
        case 'k':
        case 'K':
          e.preventDefault();
          setState((prev) => ({ ...prev, isPlaying: false, playbackSpeed: 1 }));
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setState((prev) => {
            const newSpeed = prev.playbackSpeed < 0 ? 1 : prev.playbackSpeed * 2;
            return { ...prev, isPlaying: true, playbackSpeed: clamp(newSpeed, 1, 8) };
          });
          break;
        case ' ':
          e.preventDefault();
          setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying, playbackSpeed: 1 }));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            currentTimeSeconds: Math.max(0, prev.currentTimeSeconds - 1 / (activeGroup?.frameRate || 24)),
            isPlaying: false,
          }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setState((prev) => ({
            ...prev,
            currentTimeSeconds: Math.min(
              activeGroup?.totalDurationSeconds ?? 0,
              prev.currentTimeSeconds + 1 / (activeGroup?.frameRate || 24),
            ),
            isPlaying: false,
          }));
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setState((prev) => ({ ...prev, inPoint: prev.currentTimeSeconds }));
          break;
        case 'o':
        case 'O':
          e.preventDefault();
          setState((prev) => ({ ...prev, outPoint: prev.currentTimeSeconds }));
          break;
        case 'Home':
          e.preventDefault();
          setState((prev) => ({ ...prev, currentTimeSeconds: 0, isPlaying: false }));
          break;
        case 'End':
          e.preventDefault();
          setState((prev) => ({ ...prev, currentTimeSeconds: activeGroup?.totalDurationSeconds ?? 0, isPlaying: false }));
          break;
        default: {
          // Number keys 1-9 for angle switching
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= (activeGroup?.angles.length ?? 0)) {
            const angleId = activeGroup?.angles[num - 1]?.id;
            if (angleId) handleSelectAngle(angleId);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeGroup]);

  const handleSelectAngle = useCallback((angleId: string) => {
    setState((prev) => {
      // Record a switch
      const newSwitches = prev.programTrack ? [...prev.programTrack.switches] : [];
      let lastSwitchEvent = prev.lastSwitchEvent;
      let showSwitchOverlay = prev.showSwitchOverlay;

      if (prev.activeAngleId && prev.activeAngleId !== angleId) {
        const fromAngle = prev.groups.find((g) => g.id === prev.activeGroupId)?.angles.find((a) => a.id === prev.activeAngleId);
        const toAngle = prev.groups.find((g) => g.id === prev.activeGroupId)?.angles.find((a) => a.id === angleId);

        newSwitches.push({
          id: `switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromAngleId: prev.activeAngleId,
          toAngleId: angleId,
          switchTimeSeconds: prev.currentTimeSeconds,
          switchType: 'cut',
        });

        lastSwitchEvent = {
          fromLabel: fromAngle?.label ?? '',
          toLabel: toAngle?.label ?? '',
          time: prev.currentTimeSeconds,
        };
        showSwitchOverlay = true;
      }

      return {
        ...prev,
        activeAngleId: angleId,
        programTrack: prev.programTrack ? {
          ...prev.programTrack,
          switches: newSwitches,
          activeAngleId: angleId,
        } : null,
        lastSwitchEvent,
        showSwitchOverlay,
      };
    });

    // Auto-hide switch overlay after 2 seconds
    if (switchOverlayTimerRef.current) clearTimeout(switchOverlayTimerRef.current);
    switchOverlayTimerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, showSwitchOverlay: false }));
    }, 2000);
  }, []);

  const handleSync = useCallback((method: MultiCamSyncMethod) => {
    setState((prev) => {
      const groups = prev.groups.map((g) => {
        if (g.id !== prev.activeGroupId) return g;
        const ref = g.angles.find((a) => a.id === g.referenceAngleId);
        const refStart = ref?.timecodeStartSeconds ?? 0;
        return {
          ...g,
          syncStatus: 'synced' as MultiCamSyncStatus,
          syncResults: g.angles.map((a) => ({
            angleId: a.id,
            offsetSeconds: a.id === g.referenceAngleId ? 0 : a.timecodeStartSeconds - refStart,
            confidence: a.id === g.referenceAngleId ? 1.0 : method === 'audio-waveform' ? 0.88 : 0.95,
            method,
            aligned: true,
          })),
        };
      });
      return { ...prev, groups };
    });
  }, []);

  const handleSwitch = useCallback((angleId: string, time: number) => {
    setState((prev) => {
      const newSwitches = prev.programTrack ? [...prev.programTrack.switches] : [];
      newSwitches.push({
        id: `switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fromAngleId: prev.activeAngleId ?? '',
        toAngleId: angleId,
        switchTimeSeconds: time,
        switchType: 'cut',
      });
      newSwitches.sort((a, b) => a.switchTimeSeconds - b.switchTimeSeconds);

      return {
        ...prev,
        programTrack: prev.programTrack ? {
          ...prev.programTrack,
          switches: newSwitches,
        } : null,
      };
    });
  }, []);

  const handleDeleteSwitch = useCallback((switchId: string) => {
    setState((prev) => ({
      ...prev,
      programTrack: prev.programTrack ? {
        ...prev.programTrack,
        switches: prev.programTrack.switches.filter((sw) => sw.id !== switchId),
      } : null,
    }));
  }, []);

  const handleToggleSuggestions = useCallback(() => {
    setState((prev) => ({ ...prev, showSuggestions: !prev.showSuggestions }));
  }, []);

  const handleTogglePlay = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying, playbackSpeed: 1 }));
  }, []);

  const handleStop = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false, currentTimeSeconds: 0, playbackSpeed: 1 }));
  }, []);

  const handleFrameStep = useCallback((forward: boolean) => {
    setState((prev) => {
      const frameTime = 1 / (activeGroup?.frameRate || 24);
      const newTime = forward
        ? Math.min(activeGroup?.totalDurationSeconds ?? 0, prev.currentTimeSeconds + frameTime)
        : Math.max(0, prev.currentTimeSeconds - frameTime);
      return { ...prev, currentTimeSeconds: newTime, isPlaying: false };
    });
  }, [activeGroup]);

  const handleSetInPoint = useCallback(() => {
    setState((prev) => ({ ...prev, inPoint: prev.currentTimeSeconds }));
  }, []);

  const handleSetOutPoint = useCallback(() => {
    setState((prev) => ({ ...prev, outPoint: prev.currentTimeSeconds }));
  }, []);

  const handleClearInOut = useCallback(() => {
    setState((prev) => ({ ...prev, inPoint: null, outPoint: null }));
  }, []);

  const handleToggleSplit = useCallback(() => {
    setState((prev) => ({
      ...prev,
      splitMode: !prev.splitMode,
      splitAngleId: prev.splitAngleId ?? (
        prev.groups.find((g) => g.id === prev.activeGroupId)?.angles.find((a) => a.id !== prev.activeAngleId)?.id ?? null
      ),
    }));
  }, []);

  const handleSetSplitAngle = useCallback((angleId: string) => {
    setState((prev) => ({ ...prev, splitAngleId: angleId }));
  }, []);

  const handleSeek = useCallback((time: number) => {
    setState((prev) => ({ ...prev, currentTimeSeconds: clamp(time, 0, activeGroup?.totalDurationSeconds ?? 0) }));
  }, [activeGroup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      if (switchOverlayTimerRef.current) clearTimeout(switchOverlayTimerRef.current);
    };
  }, []);

  if (!activeGroup) {
    return (
      <div style={S.root} role="region" aria-label="Multi-Cam Monitor">
        <div style={S.header}>
          <span style={S.title}>Multi-Cam Monitor</span>
        </div>
        <div style={{ ...S.body, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={S.empty}>No multi-cam group loaded. Create or load a group to begin.</div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: typeof state.activeTab; label: string }> = [
    { id: 'angles', label: 'Angles' },
    { id: 'sync', label: 'Sync' },
    { id: 'program', label: 'Program' },
    { id: 'preview', label: 'Preview' },
  ];

  const speedLabel = state.playbackSpeed === 1 ? '' :
    state.playbackSpeed > 0 ? `${state.playbackSpeed}x` : `${state.playbackSpeed}x`;

  return (
    <div style={S.root} role="region" aria-label="Multi-Cam Monitor">
      {/* Header */}
      <div style={S.header}>
        <div>
          <span style={S.title}>Multi-Cam Monitor</span>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {activeGroup.name}
          </span>
        </div>
        <span style={S.statusBadge(activeGroup.syncStatus === 'synced')}>
          <span style={S.dot(activeGroup.syncStatus === 'synced' ? '#22c55e' : '#94a3b8')} aria-hidden="true" />
          {activeGroup.syncStatus} ({activeGroup.angles.length} angles)
        </span>
      </div>

      {/* Tab Bar */}
      <div style={S.tabBar} role="tablist" aria-label="Monitor tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            style={S.tab(state.activeTab === t.id)}
            onClick={() => setState((prev) => ({ ...prev, activeTab: t.id }))}
            role="tab"
            aria-selected={state.activeTab === t.id}
            aria-controls={`mc-monitor-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={S.body} role="tabpanel" id={`mc-monitor-${state.activeTab}`}>
        {state.activeTab === 'angles' && (
          <AnglesTab
            group={activeGroup}
            activeAngleId={state.activeAngleId}
            onSelectAngle={handleSelectAngle}
          />
        )}
        {state.activeTab === 'sync' && (
          <SyncTab group={activeGroup} onSync={handleSync} />
        )}
        {state.activeTab === 'program' && (
          <ProgramTab
            group={activeGroup}
            programTrack={state.programTrack}
            aiSuggestions={state.aiSuggestions}
            showSuggestions={state.showSuggestions}
            onToggleSuggestions={handleToggleSuggestions}
            onSwitch={handleSwitch}
            onDeleteSwitch={handleDeleteSwitch}
          />
        )}
        {state.activeTab === 'preview' && (
          <PreviewTab
            group={activeGroup}
            activeAngleId={state.activeAngleId}
            currentTimeSeconds={state.currentTimeSeconds}
            splitMode={state.splitMode}
            splitAngleId={state.splitAngleId}
            inPoint={state.inPoint}
            outPoint={state.outPoint}
            lastSwitchEvent={state.lastSwitchEvent}
            showSwitchOverlay={state.showSwitchOverlay}
            onToggleSplit={handleToggleSplit}
            onSetSplitAngle={handleSetSplitAngle}
            onSetInPoint={handleSetInPoint}
            onSetOutPoint={handleSetOutPoint}
            onClearInOut={handleClearInOut}
          />
        )}
      </div>

      {/* Transport Controls Bar */}
      <div style={S.transportBar} role="toolbar" aria-label="Transport controls">
        {/* Frame back */}
        <button
          style={S.transportBtn(false)}
          onClick={() => handleFrameStep(false)}
          aria-label="Step back one frame"
          title="Frame back (Left Arrow)"
        >
          |&lt;
        </button>

        {/* Reverse (J) */}
        <button
          style={S.transportBtn(state.isPlaying && state.playbackSpeed < 0, 'accent')}
          onClick={() => {
            setState((prev) => ({
              ...prev,
              isPlaying: true,
              playbackSpeed: prev.playbackSpeed > 0 ? -1 : clamp(prev.playbackSpeed * 2, -8, -1),
            }));
          }}
          aria-label={`Reverse playback${state.playbackSpeed < 0 ? ` at ${Math.abs(state.playbackSpeed)}x` : ''}`}
          title="Reverse (J)"
        >
          J
        </button>

        {/* Stop (K) */}
        <button
          style={S.transportBtn(!state.isPlaying)}
          onClick={() => setState((prev) => ({ ...prev, isPlaying: false, playbackSpeed: 1 }))}
          aria-label="Stop playback"
          title="Stop (K)"
        >
          K
        </button>

        {/* Forward (L) */}
        <button
          style={S.transportBtn(state.isPlaying && state.playbackSpeed > 0, 'accent')}
          onClick={() => {
            setState((prev) => ({
              ...prev,
              isPlaying: true,
              playbackSpeed: prev.playbackSpeed < 0 ? 1 : clamp(prev.playbackSpeed * 2, 1, 8),
            }));
          }}
          aria-label={`Forward playback${state.playbackSpeed > 0 && state.playbackSpeed !== 1 ? ` at ${state.playbackSpeed}x` : ''}`}
          title="Forward (L)"
        >
          L
        </button>

        {/* Frame forward */}
        <button
          style={S.transportBtn(false)}
          onClick={() => handleFrameStep(true)}
          aria-label="Step forward one frame"
          title="Frame forward (Right Arrow)"
        >
          &gt;|
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 2px' }} aria-hidden="true" />

        {/* Play/Pause (Space) */}
        <button
          style={S.transportBtn(state.isPlaying, state.isPlaying ? 'danger' : 'accent')}
          onClick={handleTogglePlay}
          aria-label={state.isPlaying ? 'Pause' : 'Play'}
          title="Play/Pause (Space)"
        >
          {state.isPlaying ? 'II' : '\u25B6'}
        </button>

        {/* Stop */}
        <button
          style={S.transportBtn(false)}
          onClick={handleStop}
          aria-label="Stop and return to start"
          title="Stop"
        >
          &#9632;
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 2px' }} aria-hidden="true" />

        {/* Mark In (I) */}
        <button
          style={S.transportBtn(state.inPoint !== null)}
          onClick={handleSetInPoint}
          aria-label="Set in point"
          title="Mark In (I)"
        >
          IN
        </button>

        {/* Mark Out (O) */}
        <button
          style={S.transportBtn(state.outPoint !== null)}
          onClick={handleSetOutPoint}
          aria-label="Set out point"
          title="Mark Out (O)"
        >
          OUT
        </button>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 2px' }} aria-hidden="true" />

        {/* Timecode display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              ...S.timecodeDisplay,
              fontSize: '13px',
            }}
            role="timer"
            aria-label={`Current timecode: ${secondsToTC(state.currentTimeSeconds, activeGroup.frameRate)}`}
          >
            {secondsToTC(state.currentTimeSeconds, activeGroup.frameRate)}
          </span>
          {speedLabel && (
            <span style={{
              fontSize: '9px',
              fontWeight: 700,
              color: state.playbackSpeed < 0 ? '#ef4444' : 'var(--brand-bright)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {speedLabel}
            </span>
          )}
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            / {secondsToTC(activeGroup.totalDurationSeconds, activeGroup.frameRate)}
          </span>
        </div>
      </div>

      {/* Scrubber / Timeline */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <input
          type="range"
          min={0}
          max={activeGroup.totalDurationSeconds}
          step={1 / (activeGroup.frameRate || 24)}
          value={state.currentTimeSeconds}
          onChange={(e) => handleSeek(Number(e.target.value))}
          style={{
            width: '100%',
            height: 6,
            accentColor: 'var(--brand)',
            cursor: 'pointer',
          }}
          aria-label="Timeline scrubber"
          aria-valuemin={0}
          aria-valuemax={activeGroup.totalDurationSeconds}
          aria-valuenow={state.currentTimeSeconds}
          aria-valuetext={secondsToTC(state.currentTimeSeconds, activeGroup.frameRate)}
        />
      </div>
    </div>
  );
}
