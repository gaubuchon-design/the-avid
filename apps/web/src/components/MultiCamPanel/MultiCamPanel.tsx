// =============================================================================
//  THE AVID -- Multi-Camera Editing Panel
//  Grid monitoring, live angle switching, sync controls, AI suggestions,
//  timecode per camera, record/program toggle, keyboard shortcut hints,
//  multicam group creation, sync mode selector, 4x4 grid, cut/switch history
//  editing, audio source selector with mixing, and multicam timeline view.
//
//  Full DaVinci Resolve + Avid Media Composer multicam parity.
// =============================================================================

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type {
  MultiCamAngle,
  MultiCamGroup,
  MultiCamGroupStatus,
  MultiCamSyncMethod,
} from '@mcua/core';

// -- Helpers ------------------------------------------------------------------

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24);
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0'),
    f.toString().padStart(2, '0'),
  ].join(':');
}

function parseTimecodeToSeconds(tc: string): number {
  const parts = tc.split(':').map(Number);
  if (parts.length !== 4) return 0;
  const [h = 0, m = 0, s = 0, f = 0] = parts;
  return h * 3600 + m * 60 + s + f / 24;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// -- Local types --------------------------------------------------------------

type GridLayout = '2x2' | '3x3' | '4x4';

type PanelTab = 'monitor' | 'create' | 'history' | 'timeline';

interface AISwitchSuggestion {
  timeSeconds: number;
  angleIndex: number;
  label: string;
  reason: string;
  confidence: number;
}

interface CutHistoryEntry {
  id: string;
  time: number;
  label: string;
  angleIndex: number;
  color: string;
}

interface AudioMixLevel {
  angleIndex: number;
  volume: number; // 0-100
  muted: boolean;
  solo: boolean;
}

// -- Demo data ----------------------------------------------------------------

const DEMO_ANGLES: MultiCamAngle[] = [
  {
    id: 'mca-a', label: 'CAM A - Wide', assetId: 'a1', assetName: 'Wide Shot',
    syncOffsetSeconds: 0, enabled: true, audioChannel: 0, color: '#4f63f5',
    durationSeconds: 120, timecodeStart: '01:00:00:00',
  },
  {
    id: 'mca-b', label: 'CAM B - Medium', assetId: 'a2', assetName: 'Medium Close',
    syncOffsetSeconds: 0.08, enabled: true, audioChannel: 1, color: '#25a865',
    durationSeconds: 118, timecodeStart: '01:00:00:02',
  },
  {
    id: 'mca-c', label: 'CAM C - Close-up', assetId: 'a3', assetName: 'Close-Up',
    syncOffsetSeconds: -0.04, enabled: true, audioChannel: 2, color: '#e05b8e',
    durationSeconds: 115, timecodeStart: '01:00:00:01',
  },
  {
    id: 'mca-d', label: 'CAM D - Alt Angle', assetId: 'a4', assetName: 'Alt Angle',
    syncOffsetSeconds: 0, enabled: true, audioChannel: 3, color: '#e8943a',
    durationSeconds: 90, timecodeStart: '01:00:05:00',
  },
  {
    id: 'mca-e', label: 'Camera E', assetId: 'a5', assetName: 'High Angle',
    syncOffsetSeconds: 0.12, enabled: false, audioChannel: 4, color: '#8b5cf6',
    durationSeconds: 100, timecodeStart: '01:00:02:00',
  },
  {
    id: 'mca-f', label: 'Camera F', assetId: 'a6', assetName: 'Handheld',
    syncOffsetSeconds: 0, enabled: false, audioChannel: 5, color: '#22c55e',
    durationSeconds: 95, timecodeStart: '01:00:01:12',
  },
  {
    id: 'mca-g', label: 'Camera G', assetId: 'a7', assetName: 'Slow Mo',
    syncOffsetSeconds: 0, enabled: false, audioChannel: 6, color: '#ef4444',
    durationSeconds: 60, timecodeStart: '01:00:10:00',
  },
  {
    id: 'mca-h', label: 'Camera H', assetId: 'a8', assetName: 'Screen Cap',
    syncOffsetSeconds: 0, enabled: false, audioChannel: 7, color: '#6366f1',
    durationSeconds: 120, timecodeStart: '01:00:00:00',
  },
  {
    id: 'mca-i', label: 'Camera I', assetId: 'a9', assetName: 'Audience',
    syncOffsetSeconds: 0, enabled: false, audioChannel: 8, color: '#14b8a6',
    durationSeconds: 120, timecodeStart: '01:00:00:05',
  },
];

const DEMO_GROUP: MultiCamGroup = {
  id: 'mcg-demo',
  name: 'Scene 3 Multicam',
  syncMethod: 'timecode',
  status: 'ready',
  angles: DEMO_ANGLES,
  activeAngleIndex: 0,
  durationSeconds: 120,
  playheadSeconds: 0,
  isLiveSwitching: false,
  audioFollowsVideo: true,
  audioAngleIndex: 0,
  createdAt: new Date().toISOString(),
};

const DEMO_AI_SUGGESTIONS: AISwitchSuggestion[] = [
  { timeSeconds: 8.2, angleIndex: 1, label: 'CAM B - Medium', reason: 'Speaker change detected', confidence: 0.92 },
  { timeSeconds: 18.5, angleIndex: 2, label: 'CAM C - Close-up', reason: 'Reaction shot opportunity', confidence: 0.78 },
  { timeSeconds: 32.0, angleIndex: 0, label: 'CAM A - Wide', reason: 'Return to master for context', confidence: 0.85 },
  { timeSeconds: 45.3, angleIndex: 1, label: 'CAM B - Medium', reason: 'Emotional peak detected', confidence: 0.88 },
];

// Available clips for multicam group creation (demo)
const AVAILABLE_CLIPS = [
  { id: 'clip-1', name: 'A_Cam_Master.mxf', duration: 720, timecodeStart: '01:00:00:00' },
  { id: 'clip-2', name: 'B_Cam_Wide.mxf', duration: 718, timecodeStart: '01:00:00:02' },
  { id: 'clip-3', name: 'C_Cam_CU.mxf', duration: 715, timecodeStart: '01:00:00:01' },
  { id: 'clip-4', name: 'D_Cam_Reverse.mxf', duration: 710, timecodeStart: '00:59:59:12' },
  { id: 'clip-5', name: 'E_Cam_Overhead.mxf', duration: 700, timecodeStart: '01:00:02:00' },
  { id: 'clip-6', name: 'F_Cam_Handheld.mxf', duration: 695, timecodeStart: '01:00:01:12' },
];

// -- Styles -------------------------------------------------------------------

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-display), system-ui, sans-serif',
    fontSize: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
    flex: 1,
  },
  body: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 12,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  rowValue: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  toggleSwitch: (enabled: boolean) => ({
    width: 28,
    height: 14,
    borderRadius: 7,
    background: enabled ? 'var(--brand)' : 'var(--bg-elevated)',
    border: `1px solid ${enabled ? 'var(--brand)' : 'var(--border-default)'}`,
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'all 150ms',
  }),
  toggleDot: (enabled: boolean) => ({
    position: 'absolute' as const,
    top: 1,
    left: enabled ? 14 : 1,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: enabled ? '#fff' : 'var(--text-muted)',
    transition: 'all 150ms',
  }),
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  tab: (active: boolean) => ({
    flex: 1,
    padding: '8px 6px',
    fontSize: 10,
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
  btn: (variant: 'primary' | 'secondary' | 'danger' | 'ghost') => ({
    padding: variant === 'ghost' ? '4px 8px' : '6px 12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 10,
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
  select: {
    width: '100%',
    padding: '5px 8px',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 10,
    outline: 'none',
  },
  input: {
    width: '100%',
    padding: '5px 8px',
    background: 'var(--bg-void)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 10,
    outline: 'none',
    fontFamily: 'var(--font-mono)',
  },
  checkbox: {
    width: 14,
    height: 14,
    accentColor: 'var(--brand)',
    cursor: 'pointer',
    flexShrink: 0,
  },
} as const;

// -- Sync Status Indicator ----------------------------------------------------

function SyncIndicator({ status }: { status: MultiCamGroupStatus }) {
  const map: Record<MultiCamGroupStatus, { color: string; label: string }> = {
    syncing: { color: 'var(--warning)', label: 'Syncing' },
    ready: { color: 'var(--success)', label: 'Synced' },
    editing: { color: 'var(--brand)', label: 'Recording' },
    error: { color: 'var(--error)', label: 'Error' },
  };
  const info = map[status];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} role="status" aria-label={`Sync status: ${info.label}`}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} aria-hidden="true" />
      <span style={{ fontSize: 10, fontWeight: 600, color: info.color }}>{info.label}</span>
    </div>
  );
}

// -- Grid Layout Selector -----------------------------------------------------

function LayoutSelector({ layout, onChange }: { layout: GridLayout; onChange: (l: GridLayout) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }} role="radiogroup" aria-label="Grid layout">
      {(['2x2', '3x3', '4x4'] as GridLayout[]).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className="tl-btn"
          role="radio"
          aria-checked={layout === l}
          aria-label={`${l} grid layout`}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${layout === l ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
            background: layout === l ? 'rgba(99,102,241,0.1)' : 'transparent',
            color: layout === l ? 'var(--accent-primary)' : 'var(--text-muted)',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 80ms',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

// -- Camera Cell --------------------------------------------------------------

function CameraCell({
  angle,
  index,
  isActive,
  isAudioSource,
  playheadSeconds,
  isLiveSwitching,
  onClick,
}: {
  angle: MultiCamAngle;
  index: number;
  isActive: boolean;
  isAudioSource: boolean;
  playheadSeconds: number;
  isLiveSwitching: boolean;
  onClick: () => void;
}) {
  const angleTime = playheadSeconds + angle.syncOffsetSeconds;

  return (
    <div
      onClick={() => angle.enabled && onClick()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && angle.enabled) {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={angle.enabled ? 0 : -1}
      aria-label={`${angle.label}${isActive ? ', active' : ''}${!angle.enabled ? ', disabled' : ''}`}
      aria-pressed={isActive}
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-void)',
        border: `2px solid ${isActive ? angle.color : 'var(--border-subtle)'}`,
        cursor: angle.enabled ? 'pointer' : 'default',
        overflow: 'hidden',
        transition: 'all 100ms',
        aspectRatio: '16 / 9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: angle.enabled ? 1 : 0.4,
        boxShadow: isActive ? `0 0 8px ${angle.color}44` : 'none',
      }}
      title={angle.enabled ? `Switch to ${angle.label} (Key: ${index + 1})` : `${angle.label} (disabled)`}
    >
      {/* Gradient tint for active angle */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: isActive
          ? `linear-gradient(135deg, ${angle.color}22, ${angle.color}08)`
          : 'transparent',
      }} aria-hidden="true" />

      {/* Keyboard shortcut hint */}
      {angle.enabled && index < 9 && (
        <span style={{
          position: 'absolute',
          top: 4,
          left: 6,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: 'rgba(255,255,255,0.5)',
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 2,
          padding: '0 3px',
          lineHeight: '16px',
        }} aria-hidden="true">
          {index + 1}
        </span>
      )}

      {/* Camera label + color dot */}
      <div style={{
        position: 'absolute',
        top: 4,
        left: index < 9 ? 24 : 6,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? angle.color : 'var(--text-muted)' }} aria-hidden="true" />
        <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? angle.color : 'var(--text-muted)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
          {angle.label}
        </span>
      </div>

      {/* Active / PGM badge */}
      {isActive && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 6,
          fontSize: 8,
          fontWeight: 700,
          padding: '2px 5px',
          borderRadius: 2,
          background: isLiveSwitching ? 'var(--error)' : angle.color,
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {isLiveSwitching ? 'PGM' : 'LIVE'}
        </div>
      )}

      {/* Audio source badge */}
      {isAudioSource && !isActive && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 6,
          fontSize: 8,
          fontWeight: 700,
          padding: '2px 5px',
          borderRadius: 2,
          background: 'rgba(34, 197, 94, 0.8)',
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          AUD
        </div>
      )}

      {/* Timecode per camera */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        left: 6,
        fontSize: 8,
        fontFamily: 'var(--font-mono)',
        color: 'rgba(255,255,255,0.6)',
        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {formatTimecode(Math.max(0, angleTime))}
      </div>

      {/* Audio channel indicator */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        right: 6,
        fontSize: 8,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
      }}>
        CH{angle.audioChannel + 1}
      </div>

      {/* Center camera letter */}
      <span style={{ fontSize: 20, color: 'var(--text-muted)', opacity: 0.3, fontWeight: 700 }} aria-hidden="true">
        {angle.label.charAt(angle.label.length - 1)}
      </span>
    </div>
  );
}

// -- Camera Details -----------------------------------------------------------

function CameraDetails({
  angle,
  onToggleEnabled,
}: {
  angle: MultiCamAngle;
  onToggleEnabled: () => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Active Camera</div>
      <div style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-void)',
        border: `1px solid ${angle.color}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: angle.color, flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            {angle.label}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {angle.assetName}
          </span>
        </div>

        <div style={{ ...S.row, marginBottom: 4 }}>
          <span style={S.rowLabel}>Sync Offset</span>
          <span style={S.rowValue}>
            {angle.syncOffsetSeconds >= 0 ? '+' : ''}{angle.syncOffsetSeconds.toFixed(2)}s
          </span>
        </div>
        <div style={{ ...S.row, marginBottom: 4 }}>
          <span style={S.rowLabel}>Duration</span>
          <span style={S.rowValue}>
            {angle.durationSeconds ? formatTimecode(angle.durationSeconds) : '--'}
          </span>
        </div>
        <div style={{ ...S.row, marginBottom: 4 }}>
          <span style={S.rowLabel}>Source TC</span>
          <span style={S.rowValue}>{angle.timecodeStart ?? '--'}</span>
        </div>
        <div style={{ ...S.row, marginBottom: 4 }}>
          <span style={S.rowLabel}>Audio Channel</span>
          <span style={S.rowValue}>CH {angle.audioChannel + 1}</span>
        </div>
        <div style={S.row}>
          <span style={S.rowLabel}>Enabled</span>
          <div
            style={S.toggleSwitch(angle.enabled)}
            onClick={onToggleEnabled}
            role="switch"
            aria-checked={angle.enabled}
            aria-label={`Toggle ${angle.label} enabled`}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleEnabled(); } }}
          >
            <div style={S.toggleDot(angle.enabled)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Record/Program Toggle ----------------------------------------------------

function ViewToggle({ isProgram, onToggle }: { isProgram: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }} role="radiogroup" aria-label="View mode">
      <button
        onClick={() => isProgram && onToggle()}
        className="tl-btn"
        role="radio"
        aria-checked={!isProgram}
        style={{
          flex: 1,
          padding: '7px 8px',
          fontSize: 10,
          fontWeight: 600,
          background: !isProgram ? 'var(--bg-elevated)' : 'var(--bg-raised)',
          color: !isProgram ? 'var(--text-primary)' : 'var(--text-muted)',
          border: `1px solid ${!isProgram ? 'var(--border-default)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all 100ms',
        }}
      >
        Multi-View
      </button>
      <button
        onClick={() => !isProgram && onToggle()}
        className="tl-btn"
        role="radio"
        aria-checked={isProgram}
        style={{
          flex: 1,
          padding: '7px 8px',
          fontSize: 10,
          fontWeight: 600,
          background: isProgram ? 'var(--bg-elevated)' : 'var(--bg-raised)',
          color: isProgram ? 'var(--text-primary)' : 'var(--text-muted)',
          border: `1px solid ${isProgram ? 'var(--border-default)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          textAlign: 'center',
          transition: 'all 100ms',
        }}
      >
        Program
      </button>
    </div>
  );
}

// -- Sync Mode Selector -------------------------------------------------------

function SyncModeSelector({
  syncMethod,
  onChange,
  onResync,
}: {
  syncMethod: MultiCamSyncMethod;
  onChange: (m: MultiCamSyncMethod) => void;
  onResync: () => void;
}) {
  const methods: Array<{ value: MultiCamSyncMethod; label: string; desc: string }> = [
    { value: 'timecode', label: 'Timecode', desc: 'Sync by embedded LTC/VITC timecode' },
    { value: 'waveform', label: 'Audio Waveform', desc: 'Cross-correlate audio peaks for alignment' },
    { value: 'marker', label: 'In Points', desc: 'Align by marked in-point positions' },
    { value: 'manual_slate', label: 'Manual', desc: 'Manually drag to align clips' },
  ];

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Sync Method</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {methods.map((m) => (
          <div
            key={m.value}
            onClick={() => onChange(m.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(m.value); } }}
            role="radio"
            aria-checked={syncMethod === m.value}
            tabIndex={0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${syncMethod === m.value ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              background: syncMethod === m.value ? 'rgba(99,102,241,0.08)' : 'transparent',
              cursor: 'pointer',
              transition: 'all 100ms',
            }}
          >
            <div style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: `2px solid ${syncMethod === m.value ? 'var(--accent-primary)' : 'var(--border-default)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {syncMethod === m.value && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-primary)' }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{m.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="tl-btn"
        onClick={onResync}
        style={{
          ...S.btn('secondary'),
          width: '100%',
          marginTop: 8,
          textAlign: 'center',
        }}
        aria-label="Re-sync all angles"
      >
        Re-Sync All Angles
      </button>
    </div>
  );
}

// -- Audio Source Controls -----------------------------------------------------

function AudioControls({
  audioFollowsVideo,
  audioAngleIndex,
  angles,
  audioMixLevels,
  onToggleFollow,
  onSetAngle,
  onUpdateMixLevel,
  onToggleMute,
  onToggleSolo,
}: {
  audioFollowsVideo: boolean;
  audioAngleIndex: number;
  angles: MultiCamAngle[];
  audioMixLevels: AudioMixLevel[];
  onToggleFollow: () => void;
  onSetAngle: (idx: number) => void;
  onUpdateMixLevel: (idx: number, volume: number) => void;
  onToggleMute: (idx: number) => void;
  onToggleSolo: (idx: number) => void;
}) {
  const [showMixer, setShowMixer] = useState(false);

  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={S.sectionTitle}>Audio Source</div>
        <button
          className="tl-btn"
          onClick={() => setShowMixer(!showMixer)}
          style={S.btn('ghost')}
          aria-label={showMixer ? 'Hide audio mixer' : 'Show audio mixer'}
          aria-expanded={showMixer}
        >
          {showMixer ? 'Simple' : 'Mixer'}
        </button>
      </div>

      <div style={{ ...S.row, marginBottom: 6 }}>
        <span style={S.rowLabel}>Audio follows video</span>
        <div
          style={S.toggleSwitch(audioFollowsVideo)}
          onClick={onToggleFollow}
          role="switch"
          aria-checked={audioFollowsVideo}
          aria-label="Audio follows video toggle"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleFollow(); } }}
        >
          <div style={S.toggleDot(audioFollowsVideo)} />
        </div>
      </div>

      {!audioFollowsVideo && !showMixer && (
        <select
          value={audioAngleIndex}
          onChange={(e) => onSetAngle(Number(e.target.value))}
          style={S.select}
          aria-label="Audio source angle"
        >
          {angles.filter((a) => a.enabled).map((a) => (
            <option key={a.id} value={angles.indexOf(a)}>
              {a.label} ({a.assetName})
            </option>
          ))}
        </select>
      )}

      {showMixer && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {angles.filter((a) => a.enabled).map((a) => {
            const idx = angles.indexOf(a);
            const mix = audioMixLevels.find((m) => m.angleIndex === idx);
            const volume = mix?.volume ?? 80;
            const muted = mix?.muted ?? false;
            const solo = mix?.solo ?? false;

            return (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-void)',
                }}
              >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-primary)', minWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.label.split(' - ')[0]}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => onUpdateMixLevel(idx, Number(e.target.value))}
                  style={{ flex: 1, accentColor: a.color, height: 4, cursor: 'pointer' }}
                  aria-label={`Volume for ${a.label}`}
                />
                <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 22, textAlign: 'right' }}>
                  {volume}%
                </span>
                <button
                  onClick={() => onToggleMute(idx)}
                  style={{
                    ...S.btn('ghost'),
                    padding: '2px 4px',
                    fontSize: 8,
                    fontWeight: 700,
                    color: muted ? 'var(--error)' : 'var(--text-muted)',
                    background: muted ? 'rgba(239,68,68,0.1)' : 'transparent',
                  }}
                  aria-label={`${muted ? 'Unmute' : 'Mute'} ${a.label}`}
                  aria-pressed={muted}
                >
                  M
                </button>
                <button
                  onClick={() => onToggleSolo(idx)}
                  style={{
                    ...S.btn('ghost'),
                    padding: '2px 4px',
                    fontSize: 8,
                    fontWeight: 700,
                    color: solo ? '#f59e0b' : 'var(--text-muted)',
                    background: solo ? 'rgba(245,158,11,0.1)' : 'transparent',
                  }}
                  aria-label={`${solo ? 'Unsolo' : 'Solo'} ${a.label}`}
                  aria-pressed={solo}
                >
                  S
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- AI Switch Suggestions ----------------------------------------------------

function AISuggestions({
  suggestions,
  onApply,
}: {
  suggestions: AISwitchSuggestion[];
  onApply: (s: AISwitchSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
        No AI suggestions available. Start playback to generate.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} role="list" aria-label="AI switch suggestions">
      {suggestions.map((s, i) => (
        <div
          key={i}
          onClick={() => onApply(s)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApply(s); } }}
          role="listitem"
          tabIndex={0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            background: 'var(--bg-raised)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            transition: 'background 80ms',
          }}
          title="Click to apply this switch"
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--brand-bright)', flexShrink: 0, minWidth: 48 }}>
            {formatTimecode(s.timeSeconds)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{s.label}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.reason}
            </div>
          </div>
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            flexShrink: 0,
            background: s.confidence > 0.85 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
            color: s.confidence > 0.85 ? 'var(--success)' : 'var(--warning)',
          }}>
            {Math.round(s.confidence * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// -- Cut/Switch History with Editing ------------------------------------------

function CutHistory({
  cuts,
  angles,
  onEditCut,
  onDeleteCut,
  onJumpToCut,
}: {
  cuts: CutHistoryEntry[];
  angles: MultiCamAngle[];
  onEditCut: (cutId: string, newAngleIndex: number) => void;
  onDeleteCut: (cutId: string) => void;
  onJumpToCut: (time: number) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (cuts.length === 0) return null;

  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={S.sectionTitle}>Cut Points ({cuts.length})</div>
      </div>
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto' }}
        role="list"
        aria-label="Camera switch history"
      >
        {cuts.slice().reverse().map((cut) => (
          <div
            key={cut.id}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              background: editingId === cut.id ? 'var(--bg-elevated)' : 'var(--bg-void)',
              border: editingId === cut.id ? '1px solid var(--border-default)' : '1px solid transparent',
              fontSize: 10,
              transition: 'all 100ms',
            }}
          >
            {/* Color indicator */}
            <div style={{ width: 4, height: 20, borderRadius: 2, background: cut.color, flexShrink: 0 }} aria-hidden="true" />

            {/* Timecode - clickable to jump */}
            <button
              onClick={() => onJumpToCut(cut.time)}
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--brand-bright)',
                fontWeight: 600,
                fontSize: 9,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                minWidth: 52,
                textAlign: 'left',
              }}
              aria-label={`Jump to ${formatTimecode(cut.time)}`}
            >
              {formatTimecode(cut.time)}
            </button>

            {/* Angle label or edit dropdown */}
            {editingId === cut.id ? (
              <select
                value={cut.angleIndex}
                onChange={(e) => {
                  onEditCut(cut.id, Number(e.target.value));
                  setEditingId(null);
                }}
                onBlur={() => setEditingId(null)}
                autoFocus
                style={{ ...S.select, flex: 1, fontSize: 9, padding: '2px 4px' }}
                aria-label="Select replacement camera angle"
              >
                {angles.filter((a) => a.enabled).map((a, i) => (
                  <option key={a.id} value={angles.indexOf(a)}>
                    {a.label}
                  </option>
                ))}
              </select>
            ) : (
              <span
                style={{ color: 'var(--text-primary)', flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => setEditingId(cut.id)}
                title="Click to change camera angle"
              >
                {cut.label}
              </span>
            )}

            {/* Edit / Delete buttons */}
            <button
              onClick={() => setEditingId(editingId === cut.id ? null : cut.id)}
              style={{ ...S.btn('ghost'), padding: '2px 4px', fontSize: 9 }}
              aria-label={editingId === cut.id ? 'Cancel editing' : 'Edit cut point'}
            >
              {editingId === cut.id ? 'Cancel' : 'Edit'}
            </button>
            <button
              onClick={() => onDeleteCut(cut.id)}
              style={{ ...S.btn('ghost'), padding: '2px 4px', fontSize: 9, color: 'var(--error)' }}
              aria-label={`Delete cut at ${formatTimecode(cut.time)}`}
            >
              Del
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- Multicam Group Creation --------------------------------------------------

function GroupCreationPanel({
  onCreateGroup,
  onCancel,
}: {
  onCreateGroup: (name: string, syncMethod: MultiCamSyncMethod, selectedClipIds: string[]) => void;
  onCancel: () => void;
}) {
  const [groupName, setGroupName] = useState('New Multicam Group');
  const [syncMethod, setSyncMethod] = useState<MultiCamSyncMethod>('timecode');
  const [selectedClips, setSelectedClips] = useState<Set<string>>(new Set());

  const toggleClip = (clipId: string) => {
    setSelectedClips((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedClips(new Set(AVAILABLE_CLIPS.map((c) => c.id)));
  };

  const clearAll = () => {
    setSelectedClips(new Set());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={S.sectionTitle}>Create Multicam Group</div>

      {/* Group name */}
      <div>
        <label style={{ ...S.rowLabel, display: 'block', marginBottom: 4 }} htmlFor="mcg-name">Group Name</label>
        <input
          id="mcg-name"
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          style={S.input}
        />
      </div>

      {/* Sync method */}
      <div>
        <label style={{ ...S.rowLabel, display: 'block', marginBottom: 4 }} htmlFor="mcg-sync">Sync Method</label>
        <select
          id="mcg-sync"
          value={syncMethod}
          onChange={(e) => setSyncMethod(e.target.value as MultiCamSyncMethod)}
          style={S.select}
        >
          <option value="timecode">Timecode</option>
          <option value="waveform">Audio Waveform</option>
          <option value="marker">In Points</option>
          <option value="manual_slate">Manual Alignment</option>
        </select>
      </div>

      {/* Clip selection */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={S.rowLabel}>Select Clips ({selectedClips.size}/{AVAILABLE_CLIPS.length})</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={selectAll} style={S.btn('ghost')} aria-label="Select all clips">All</button>
            <button onClick={clearAll} style={S.btn('ghost')} aria-label="Clear clip selection">None</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 180, overflowY: 'auto' }}>
          {AVAILABLE_CLIPS.map((clip) => (
            <label
              key={clip.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm)',
                background: selectedClips.has(clip.id) ? 'rgba(99,102,241,0.08)' : 'var(--bg-void)',
                border: `1px solid ${selectedClips.has(clip.id) ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                cursor: 'pointer',
                transition: 'all 80ms',
              }}
            >
              <input
                type="checkbox"
                checked={selectedClips.has(clip.id)}
                onChange={() => toggleClip(clip.id)}
                style={S.checkbox}
                aria-label={`Select ${clip.name}`}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{clip.name}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                  <span>TC: {clip.timecodeStart}</span>
                  <span>Dur: {formatTimecode(clip.duration)}</span>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            if (selectedClips.size >= 2 && groupName.trim()) {
              onCreateGroup(groupName, syncMethod, Array.from(selectedClips));
            }
          }}
          style={{
            ...S.btn('primary'),
            flex: 1,
            textAlign: 'center',
            opacity: selectedClips.size >= 2 && groupName.trim() ? 1 : 0.5,
            cursor: selectedClips.size >= 2 && groupName.trim() ? 'pointer' : 'not-allowed',
          }}
          disabled={selectedClips.size < 2 || !groupName.trim()}
          aria-label="Create multicam group"
        >
          Create Group ({selectedClips.size} clips)
        </button>
        <button onClick={onCancel} style={{ ...S.btn('secondary'), textAlign: 'center' }}>
          Cancel
        </button>
      </div>

      {selectedClips.size < 2 && selectedClips.size > 0 && (
        <div style={{ fontSize: 9, color: 'var(--warning)', textAlign: 'center' }}>
          Select at least 2 clips to create a multicam group
        </div>
      )}
    </div>
  );
}

// -- Multicam Timeline View ---------------------------------------------------

function MultiCamTimelineView({
  cuts,
  angles,
  duration,
  playheadSeconds,
  onSeek,
}: {
  cuts: CutHistoryEntry[];
  angles: MultiCamAngle[];
  duration: number;
  playheadSeconds: number;
  onSeek: (time: number) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);

  // Build segments from cut points
  const segments = useMemo(() => {
    if (cuts.length === 0) return [];
    const sorted = [...cuts].sort((a, b) => a.time - b.time);
    const result: Array<{
      startTime: number;
      endTime: number;
      angleIndex: number;
      color: string;
      label: string;
    }> = [];

    for (let i = 0; i < sorted.length; i++) {
      const cut = sorted[i]!;
      const nextCut = sorted[i + 1];
      result.push({
        startTime: cut.time,
        endTime: nextCut ? nextCut.time : duration,
        angleIndex: cut.angleIndex,
        color: cut.color,
        label: cut.label,
      });
    }
    return result;
  }, [cuts, duration]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration <= 0) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = clamp(x / rect.width, 0, 1);
    onSeek(ratio * duration);
  }, [duration, onSeek]);

  if (cuts.length === 0) {
    return (
      <div style={S.section}>
        <div style={S.sectionTitle}>Timeline</div>
        <div style={{
          height: 40,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-void)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}>
          No camera switches recorded yet
        </div>
      </div>
    );
  }

  const playheadPercent = duration > 0 ? (playheadSeconds / duration) * 100 : 0;

  return (
    <div style={S.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={S.sectionTitle}>Timeline</div>
        <span style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {segments.length} segments
        </span>
      </div>

      {/* Angle legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {angles.filter((a) => a.enabled).map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} aria-hidden="true" />
            <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{a.label.split(' - ')[0]}</span>
          </div>
        ))}
      </div>

      {/* Timeline bar */}
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        role="slider"
        aria-label="Multicam timeline"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={playheadSeconds}
        aria-valuetext={formatTimecode(playheadSeconds)}
        tabIndex={0}
        style={{
          position: 'relative',
          height: 32,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-void)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
      >
        {/* Segments */}
        {segments.map((seg, i) => {
          const left = duration > 0 ? (seg.startTime / duration) * 100 : 0;
          const width = duration > 0 ? ((seg.endTime - seg.startTime) / duration) * 100 : 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: `${seg.color}88`,
                borderRight: i < segments.length - 1 ? '1px solid rgba(0,0,0,0.4)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
              title={`${seg.label}: ${formatTimecode(seg.startTime)} - ${formatTimecode(seg.endTime)}`}
            >
              {width > 8 && (
                <span style={{ fontSize: 7, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
                  {seg.label.split(' - ')[0]}
                </span>
              )}
            </div>
          );
        })}

        {/* Playhead */}
        <div style={{
          position: 'absolute',
          left: `${playheadPercent}%`,
          top: 0,
          bottom: 0,
          width: 2,
          background: '#fff',
          zIndex: 2,
          boxShadow: '0 0 4px rgba(0,0,0,0.5)',
          transform: 'translateX(-1px)',
        }} aria-hidden="true" />

        {/* Playhead marker */}
        <div style={{
          position: 'absolute',
          left: `${playheadPercent}%`,
          top: 0,
          width: 0,
          height: 0,
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '5px solid #fff',
          transform: 'translateX(-4px)',
          zIndex: 3,
        }} aria-hidden="true" />
      </div>

      {/* Timecode ruler */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {formatTimecode(0)}
        </span>
        <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {formatTimecode(duration / 2)}
        </span>
        <span style={{ fontSize: 7, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {formatTimecode(duration)}
        </span>
      </div>
    </div>
  );
}

// -- Main MultiCam Panel ------------------------------------------------------

export function MultiCamPanel() {
  const { playheadTime, setPlayhead } = useEditorStore();
  const [group, setGroup] = useState<MultiCamGroup>(DEMO_GROUP);
  const [gridLayout, setGridLayout] = useState<GridLayout>('2x2');
  const [isProgram, setIsProgram] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions] = useState<AISwitchSuggestion[]>(DEMO_AI_SUGGESTIONS);
  const [cuts, setCuts] = useState<CutHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<PanelTab>('monitor');
  const [audioMixLevels, setAudioMixLevels] = useState<AudioMixLevel[]>(() =>
    DEMO_ANGLES.map((_, i) => ({ angleIndex: i, volume: 80, muted: false, solo: false }))
  );

  // Sync editor playhead into the group
  useEffect(() => {
    setGroup((prev) => ({ ...prev, playheadSeconds: playheadTime }));
  }, [playheadTime]);

  // Keyboard shortcuts: 1-9 for angle switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= group.angles.length) {
        const idx = num - 1;
        if (group.angles[idx]!.enabled) {
          handleSwitchAngle(idx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [group.angles, playheadTime]);

  const handleSwitchAngle = useCallback((angleIndex: number) => {
    setGroup((prev) => {
      const angle = prev.angles[angleIndex];
      if (!angle || !angle.enabled) return prev;
      return {
        ...prev,
        activeAngleIndex: angleIndex,
        audioAngleIndex: prev.audioFollowsVideo ? angleIndex : prev.audioAngleIndex,
      };
    });
    setCuts((prev) => {
      const angle = group.angles[angleIndex];
      if (!angle) return prev;
      return [
        ...prev,
        {
          id: `cut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: playheadTime,
          label: angle.label,
          angleIndex,
          color: angle.color,
        },
      ];
    });
  }, [playheadTime, group.angles]);

  const handleToggleLiveSwitch = useCallback(() => {
    setGroup((prev) => ({
      ...prev,
      isLiveSwitching: !prev.isLiveSwitching,
      status: !prev.isLiveSwitching ? 'editing' : 'ready',
    }));
  }, []);

  const handleToggleAudioFollow = useCallback(() => {
    setGroup((prev) => ({ ...prev, audioFollowsVideo: !prev.audioFollowsVideo }));
  }, []);

  const handleSetAudioAngle = useCallback((idx: number) => {
    setGroup((prev) => ({ ...prev, audioAngleIndex: idx }));
  }, []);

  const handleApplySuggestion = useCallback((s: AISwitchSuggestion) => {
    setPlayhead(s.timeSeconds);
    handleSwitchAngle(s.angleIndex);
  }, [setPlayhead, handleSwitchAngle]);

  const handleToggleAngleEnabled = useCallback((angleId: string) => {
    setGroup((prev) => ({
      ...prev,
      angles: prev.angles.map((a) =>
        a.id === angleId ? { ...a, enabled: !a.enabled } : a,
      ),
    }));
  }, []);

  const handleChangeSyncMethod = useCallback((method: MultiCamSyncMethod) => {
    setGroup((prev) => ({ ...prev, syncMethod: method }));
  }, []);

  const handleResync = useCallback(() => {
    setGroup((prev) => ({ ...prev, status: 'syncing' }));
    // Simulate resync
    setTimeout(() => {
      setGroup((prev) => ({ ...prev, status: 'ready' }));
    }, 1500);
  }, []);

  const handleEditCut = useCallback((cutId: string, newAngleIndex: number) => {
    setCuts((prev) => prev.map((cut) => {
      if (cut.id !== cutId) return cut;
      const angle = group.angles[newAngleIndex];
      if (!angle) return cut;
      return {
        ...cut,
        angleIndex: newAngleIndex,
        label: angle.label,
        color: angle.color,
      };
    }));
  }, [group.angles]);

  const handleDeleteCut = useCallback((cutId: string) => {
    setCuts((prev) => prev.filter((cut) => cut.id !== cutId));
  }, []);

  const handleJumpToCut = useCallback((time: number) => {
    setPlayhead(time);
  }, [setPlayhead]);

  const handleCreateGroup = useCallback((name: string, syncMethod: MultiCamSyncMethod, clipIds: string[]) => {
    const newAngles: MultiCamAngle[] = clipIds.map((clipId, idx) => {
      const clip = AVAILABLE_CLIPS.find((c) => c.id === clipId);
      const colors = ['#4f63f5', '#25a865', '#e05b8e', '#e8943a', '#8b5cf6', '#22c55e', '#ef4444', '#6366f1', '#14b8a6'];
      const labels = ['CAM A - Wide', 'CAM B - Medium', 'CAM C - Close-up', 'CAM D - Alt Angle', 'Camera E', 'Camera F', 'Camera G', 'Camera H', 'Camera I'];
      return {
        id: `mca-new-${idx}`,
        label: labels[idx] ?? `Camera ${String.fromCharCode(65 + idx)}`,
        assetId: clipId,
        assetName: clip?.name ?? `Clip ${idx + 1}`,
        syncOffsetSeconds: 0,
        enabled: true,
        audioChannel: idx,
        color: colors[idx % colors.length]!,
        durationSeconds: clip?.duration ?? 120,
        timecodeStart: clip?.timecodeStart ?? '01:00:00:00',
      };
    });

    const newGroup: MultiCamGroup = {
      id: `mcg-${Date.now()}`,
      name,
      syncMethod,
      status: 'syncing',
      angles: newAngles,
      activeAngleIndex: 0,
      durationSeconds: Math.max(...newAngles.map((a) => a.durationSeconds ?? 0)),
      playheadSeconds: 0,
      isLiveSwitching: false,
      audioFollowsVideo: true,
      audioAngleIndex: 0,
      createdAt: new Date().toISOString(),
    };

    setGroup(newGroup);
    setCuts([]);
    setActiveTab('monitor');

    // Simulate sync
    setTimeout(() => {
      setGroup((prev) => ({ ...prev, status: 'ready' }));
    }, 2000);
  }, []);

  const handleUpdateMixLevel = useCallback((idx: number, volume: number) => {
    setAudioMixLevels((prev) => prev.map((m) =>
      m.angleIndex === idx ? { ...m, volume } : m
    ));
  }, []);

  const handleToggleMute = useCallback((idx: number) => {
    setAudioMixLevels((prev) => prev.map((m) =>
      m.angleIndex === idx ? { ...m, muted: !m.muted } : m
    ));
  }, []);

  const handleToggleSolo = useCallback((idx: number) => {
    setAudioMixLevels((prev) => prev.map((m) =>
      m.angleIndex === idx ? { ...m, solo: !m.solo } : m
    ));
  }, []);

  const handleTimelineSeek = useCallback((time: number) => {
    setPlayhead(time);
  }, [setPlayhead]);

  const gridCount = gridLayout === '2x2' ? 4 : gridLayout === '3x3' ? 9 : 16;
  const gridCols = gridLayout === '2x2' ? 2 : gridLayout === '3x3' ? 3 : 4;
  const visibleAngles = group.angles.slice(0, gridCount);
  const activeAngle = group.angles[group.activeAngleIndex];

  const tabs: Array<{ id: PanelTab; label: string }> = [
    { id: 'monitor', label: 'Monitor' },
    { id: 'create', label: 'Create' },
    { id: 'history', label: 'History' },
    { id: 'timeline', label: 'Timeline' },
  ];

  // ---- Error state ----
  if (error) {
    return (
      <div style={S.panel} role="region" aria-label="MultiCam Panel">
        <div className="panel-header" style={S.header}>
          <span style={S.title}>MultiCam</span>
        </div>
        <div className="panel-body" style={S.body}>
          <div
            role="alert"
            style={{
              padding: 12,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--error)',
              fontSize: 11,
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Sync Error</div>
            <div>{error}</div>
            <button
              className="tl-btn"
              style={{
                marginTop: 8,
                padding: '5px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
              }}
              onClick={() => setError(null)}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div style={S.panel} role="region" aria-label="MultiCam Panel">
        <div className="panel-header" style={S.header}>
          <span style={S.title}>MultiCam</span>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          flex: 1,
          color: 'var(--text-muted)',
          fontSize: 11,
        }} role="status" aria-label="Syncing cameras">
          <div style={{
            width: 24,
            height: 24,
            border: '2px solid var(--border-default)',
            borderTopColor: 'var(--brand)',
            borderRadius: '50%',
          }} aria-hidden="true" />
          Syncing camera angles...
        </div>
      </div>
    );
  }

  // ---- Empty state ----
  if (!group || group.angles.length === 0) {
    return (
      <div style={S.panel} role="region" aria-label="MultiCam Panel">
        <div className="panel-header" style={S.header}>
          <span style={S.title}>MultiCam</span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontStyle: 'italic',
          padding: 20,
          textAlign: 'center',
        }}>
          Select multiple clips and choose "Create Multi-Cam Group" to begin multi-camera editing.
        </div>
      </div>
    );
  }

  // ---- Normal state ----
  const syncMethodLabels: Record<MultiCamSyncMethod, string> = {
    timecode: 'TC Sync',
    waveform: 'Audio Sync',
    manual_slate: 'Slate Sync',
    marker: 'Marker Sync',
  };

  return (
    <div style={S.panel} role="region" aria-label="MultiCam Panel">
      {/* Header */}
      <div className="panel-header" style={S.header}>
        <span className="panel-title" style={S.title}>MultiCam</span>
        <SyncIndicator status={group.status} />
        <LayoutSelector layout={gridLayout} onChange={setGridLayout} />
      </div>

      {/* Tab bar */}
      <div style={S.tabBar} role="tablist" aria-label="MultiCam panel tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            style={S.tab(activeTab === t.id)}
            onClick={() => setActiveTab(t.id)}
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`mcpanel-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel-body" style={S.body} role="tabpanel" id={`mcpanel-${activeTab}`}>
        {/* ===================== MONITOR TAB ===================== */}
        {activeTab === 'monitor' && (
          <>
            {/* Sync info bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              background: 'var(--bg-raised)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              marginBottom: 12,
              fontSize: 10,
            }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{group.name}</span>
              <span style={{ color: 'var(--text-muted)' }} aria-hidden="true">|</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                {syncMethodLabels[group.syncMethod]}
              </span>
              <span style={{ color: 'var(--text-muted)' }} aria-hidden="true">|</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {group.angles.filter((a) => a.enabled).length}/{group.angles.length} angles
              </span>
            </div>

            {/* Timecode display */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 12,
            }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--brand-bright)',
                  lineHeight: 1,
                  letterSpacing: '1px',
                }}
                role="timer"
                aria-label={`Current timecode: ${formatTimecode(group.playheadSeconds)}`}
              >
                {formatTimecode(group.playheadSeconds)}
              </span>
            </div>

            {/* Record / Program toggle */}
            <ViewToggle isProgram={isProgram} onToggle={() => setIsProgram(!isProgram)} />

            {/* Sync Mode Selector */}
            <SyncModeSelector
              syncMethod={group.syncMethod}
              onChange={handleChangeSyncMethod}
              onResync={handleResync}
            />

            {/* Camera Grid */}
            <div style={S.section}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={S.sectionTitle}>Camera Grid</div>
                <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>
                  Active: {activeAngle?.label ?? 'None'}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gap: 4,
                }}
                role="group"
                aria-label="Camera angle grid"
              >
                {visibleAngles.map((angle, idx) => (
                  <CameraCell
                    key={angle.id}
                    angle={angle}
                    index={idx}
                    isActive={group.activeAngleIndex === idx}
                    isAudioSource={!group.audioFollowsVideo && group.audioAngleIndex === idx}
                    playheadSeconds={group.playheadSeconds}
                    isLiveSwitching={group.isLiveSwitching}
                    onClick={() => handleSwitchAngle(idx)}
                  />
                ))}
              </div>
            </div>

            {/* Live switch controls */}
            <div style={S.section}>
              <div style={S.sectionTitle}>Live Switch</div>
              <button
                className="tl-btn"
                onClick={handleToggleLiveSwitch}
                aria-label={group.isLiveSwitching ? 'Stop recording multicam switches' : 'Start recording multicam switches'}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  fontSize: 11,
                  fontWeight: 700,
                  background: group.isLiveSwitching ? 'var(--error)' : 'var(--brand)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'all 100ms',
                }}
              >
                {group.isLiveSwitching ? 'Stop Recording' : 'Start Recording'}
              </button>
              {group.isLiveSwitching && (
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--error)',
                    fontWeight: 600,
                    textAlign: 'center',
                    padding: '6px 0',
                  }}
                  role="status"
                >
                  RECORDING -- Press 1-{group.angles.filter((a) => a.enabled).length} to switch angles
                </div>
              )}
            </div>

            {/* Active camera details */}
            {activeAngle && (
              <CameraDetails
                angle={activeAngle}
                onToggleEnabled={() => handleToggleAngleEnabled(activeAngle.id)}
              />
            )}

            {/* Audio controls */}
            <AudioControls
              audioFollowsVideo={group.audioFollowsVideo}
              audioAngleIndex={group.audioAngleIndex}
              angles={group.angles}
              audioMixLevels={audioMixLevels}
              onToggleFollow={handleToggleAudioFollow}
              onSetAngle={handleSetAudioAngle}
              onUpdateMixLevel={handleUpdateMixLevel}
              onToggleMute={handleToggleMute}
              onToggleSolo={handleToggleSolo}
            />

            {/* AI Suggestions */}
            <div style={S.section}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={S.sectionTitle}>AI Switch Suggestions</span>
                <span style={{
                  fontSize: 8,
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: 3,
                  background: 'rgba(124,92,252,0.15)',
                  color: '#a78bfa',
                }}>
                  AI
                </span>
              </div>
              <AISuggestions suggestions={suggestions} onApply={handleApplySuggestion} />
            </div>

            {/* Compact multicam timeline */}
            <MultiCamTimelineView
              cuts={cuts}
              angles={group.angles}
              duration={group.durationSeconds}
              playheadSeconds={group.playheadSeconds}
              onSeek={handleTimelineSeek}
            />
          </>
        )}

        {/* ===================== CREATE TAB ===================== */}
        {activeTab === 'create' && (
          <GroupCreationPanel
            onCreateGroup={handleCreateGroup}
            onCancel={() => setActiveTab('monitor')}
          />
        )}

        {/* ===================== HISTORY TAB ===================== */}
        {activeTab === 'history' && (
          <>
            <CutHistory
              cuts={cuts}
              angles={group.angles}
              onEditCut={handleEditCut}
              onDeleteCut={handleDeleteCut}
              onJumpToCut={handleJumpToCut}
            />
            {cuts.length === 0 && (
              <div style={{
                padding: 20,
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 11,
                fontStyle: 'italic',
              }}>
                No camera switches recorded yet. Switch cameras during playback to build a history.
              </div>
            )}
            {cuts.length > 0 && (
              <div style={S.section}>
                <div style={S.sectionTitle}>Statistics</div>
                <div style={{ ...S.row, marginBottom: 4 }}>
                  <span style={S.rowLabel}>Total Cuts</span>
                  <span style={S.rowValue}>{cuts.length}</span>
                </div>
                <div style={{ ...S.row, marginBottom: 4 }}>
                  <span style={S.rowLabel}>Cameras Used</span>
                  <span style={S.rowValue}>{new Set(cuts.map((c) => c.angleIndex)).size}</span>
                </div>
                <div style={{ ...S.row, marginBottom: 4 }}>
                  <span style={S.rowLabel}>First Cut</span>
                  <span style={S.rowValue}>{formatTimecode(Math.min(...cuts.map((c) => c.time)))}</span>
                </div>
                <div style={S.row}>
                  <span style={S.rowLabel}>Last Cut</span>
                  <span style={S.rowValue}>{formatTimecode(Math.max(...cuts.map((c) => c.time)))}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ===================== TIMELINE TAB ===================== */}
        {activeTab === 'timeline' && (
          <>
            <MultiCamTimelineView
              cuts={cuts}
              angles={group.angles}
              duration={group.durationSeconds}
              playheadSeconds={group.playheadSeconds}
              onSeek={handleTimelineSeek}
            />

            {/* Per-angle breakdown */}
            <div style={S.section}>
              <div style={S.sectionTitle}>Angle Usage</div>
              {group.angles.filter((a) => a.enabled).map((angle, idx) => {
                const angleCuts = cuts.filter((c) => c.angleIndex === group.angles.indexOf(angle));
                const sorted = [...cuts].sort((a, b) => a.time - b.time);
                let totalDuration = 0;
                for (let i = 0; i < sorted.length; i++) {
                  if (sorted[i]!.angleIndex === group.angles.indexOf(angle)) {
                    const next = sorted[i + 1];
                    totalDuration += (next ? next.time : group.durationSeconds) - sorted[i]!.time;
                  }
                }
                const usagePercent = group.durationSeconds > 0 ? (totalDuration / group.durationSeconds) * 100 : 0;

                return (
                  <div key={angle.id} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: angle.color }} aria-hidden="true" />
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>{angle.label}</span>
                      </div>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {angleCuts.length} cuts ({usagePercent.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{
                      height: 4,
                      borderRadius: 2,
                      background: 'var(--bg-void)',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${usagePercent}%`,
                        background: angle.color,
                        borderRadius: 2,
                        transition: 'width 200ms',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
