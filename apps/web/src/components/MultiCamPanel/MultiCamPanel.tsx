// =============================================================================
//  THE AVID -- Multi-Camera Editing Panel
//  Grid monitoring, live angle switching, sync controls, AI suggestions,
//  timecode per camera, record/program toggle, and keyboard shortcut hints.
// =============================================================================

import React, { useState, useCallback, useEffect } from 'react';
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

// -- Local types --------------------------------------------------------------

type GridLayout = '2x2' | '3x3';

interface AISwitchSuggestion {
  timeSeconds: number;
  angleIndex: number;
  label: string;
  reason: string;
  confidence: number;
}

// -- Demo data ----------------------------------------------------------------

const DEMO_ANGLES: MultiCamAngle[] = [
  {
    id: 'mca-a', label: 'Camera A', assetId: 'a1', assetName: 'Wide Shot',
    syncOffsetSeconds: 0, enabled: true, audioChannel: 0, color: '#4f63f5',
    durationSeconds: 120, timecodeStart: '01:00:00:00',
  },
  {
    id: 'mca-b', label: 'Camera B', assetId: 'a2', assetName: 'Medium Close',
    syncOffsetSeconds: 0.08, enabled: true, audioChannel: 1, color: '#25a865',
    durationSeconds: 118, timecodeStart: '01:00:00:02',
  },
  {
    id: 'mca-c', label: 'Camera C', assetId: 'a3', assetName: 'Over Shoulder',
    syncOffsetSeconds: -0.04, enabled: true, audioChannel: 2, color: '#e05b8e',
    durationSeconds: 115, timecodeStart: '01:00:00:01',
  },
  {
    id: 'mca-d', label: 'Camera D', assetId: 'a4', assetName: 'B-Roll Drone',
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
  { timeSeconds: 8.2, angleIndex: 1, label: 'Camera B', reason: 'Speaker change detected', confidence: 0.92 },
  { timeSeconds: 18.5, angleIndex: 2, label: 'Camera C', reason: 'Reaction shot opportunity', confidence: 0.78 },
  { timeSeconds: 32.0, angleIndex: 0, label: 'Camera A', reason: 'Return to master for context', confidence: 0.85 },
  { timeSeconds: 45.3, angleIndex: 1, label: 'Camera B', reason: 'Emotional peak detected', confidence: 0.88 },
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: info.color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: info.color }}>{info.label}</span>
    </div>
  );
}

// -- Grid Layout Selector -----------------------------------------------------

function LayoutSelector({ layout, onChange }: { layout: GridLayout; onChange: (l: GridLayout) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['2x2', '3x3'] as GridLayout[]).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className="tl-btn"
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
  playheadSeconds,
  isLiveSwitching,
  onClick,
}: {
  angle: MultiCamAngle;
  index: number;
  isActive: boolean;
  playheadSeconds: number;
  isLiveSwitching: boolean;
  onClick: () => void;
}) {
  const angleTime = playheadSeconds + angle.syncOffsetSeconds;

  return (
    <div
      onClick={() => angle.enabled && onClick()}
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
      }} />

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
        }}>
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
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? angle.color : 'var(--text-muted)' }} />
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
      <span style={{ fontSize: 20, color: 'var(--text-muted)', opacity: 0.3, fontWeight: 700 }}>
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
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: angle.color, flexShrink: 0 }} />
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
        <div style={S.row}>
          <span style={S.rowLabel}>Audio Channel</span>
          <span style={S.rowValue}>CH {angle.audioChannel + 1}</span>
        </div>
      </div>
    </div>
  );
}

// -- Record/Program Toggle ----------------------------------------------------

function ViewToggle({ isProgram, onToggle }: { isProgram: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
      <button
        onClick={() => isProgram && onToggle()}
        className="tl-btn"
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

// -- Audio Source Controls -----------------------------------------------------

function AudioControls({
  audioFollowsVideo,
  audioAngleIndex,
  angles,
  onToggleFollow,
  onSetAngle,
}: {
  audioFollowsVideo: boolean;
  audioAngleIndex: number;
  angles: MultiCamAngle[];
  onToggleFollow: () => void;
  onSetAngle: (idx: number) => void;
}) {
  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Audio Source</div>
      <div style={{ ...S.row, marginBottom: 6 }}>
        <span style={S.rowLabel}>Audio follows video</span>
        <div style={S.toggleSwitch(audioFollowsVideo)} onClick={onToggleFollow}>
          <div style={S.toggleDot(audioFollowsVideo)} />
        </div>
      </div>
      {!audioFollowsVideo && (
        <select
          value={audioAngleIndex}
          onChange={(e) => onSetAngle(Number(e.target.value))}
          style={{
            width: '100%',
            padding: '5px 8px',
            background: 'var(--bg-void)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 10,
            outline: 'none',
          }}
        >
          {angles.filter((a) => a.enabled).map((a, i) => (
            <option key={a.id} value={angles.indexOf(a)}>
              {a.label} ({a.assetName})
            </option>
          ))}
        </select>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {suggestions.map((s, i) => (
        <div
          key={i}
          onClick={() => onApply(s)}
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

// -- Cut History --------------------------------------------------------------

function CutHistory({ cuts }: { cuts: Array<{ time: number; label: string }> }) {
  if (cuts.length === 0) return null;

  return (
    <div style={S.section}>
      <div style={S.sectionTitle}>Cut Points ({cuts.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 120, overflowY: 'auto' }}>
        {cuts.slice(-10).reverse().map((cut, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-void)',
              fontSize: 10,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand-bright)', fontWeight: 600 }}>
              {formatTimecode(cut.time)}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>{cut.label}</span>
          </div>
        ))}
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
  const [cuts, setCuts] = useState<Array<{ time: number; label: string }>>([]);

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
        if (group.angles[idx].enabled) {
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
    setCuts((prev) => [
      ...prev,
      { time: playheadTime, label: group.angles[angleIndex]?.label ?? '' },
    ]);
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

  const gridCount = gridLayout === '2x2' ? 4 : 9;
  const visibleAngles = group.angles.slice(0, gridCount);
  const activeAngle = group.angles[group.activeAngleIndex];

  // ---- Error state ----
  if (error) {
    return (
      <div style={S.panel}>
        <div className="panel-header" style={S.header}>
          <span style={S.title}>MultiCam</span>
        </div>
        <div className="panel-body" style={S.body}>
          <div style={{
            padding: 12,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--error)',
            fontSize: 11,
            textAlign: 'center',
          }}>
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
      <div style={S.panel}>
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
        }}>
          <div style={{
            width: 24,
            height: 24,
            border: '2px solid var(--border-default)',
            borderTopColor: 'var(--brand)',
            borderRadius: '50%',
          }} />
          Syncing camera angles...
        </div>
      </div>
    );
  }

  // ---- Empty state ----
  if (!group || group.angles.length === 0) {
    return (
      <div style={S.panel}>
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
    <div style={S.panel}>
      {/* Header */}
      <div className="panel-header" style={S.header}>
        <span className="panel-title" style={S.title}>MultiCam</span>
        <SyncIndicator status={group.status} />
        <LayoutSelector layout={gridLayout} onChange={setGridLayout} />
      </div>

      <div className="panel-body" style={S.body}>
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
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {syncMethodLabels[group.syncMethod]}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
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
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--brand-bright)',
            lineHeight: 1,
            letterSpacing: '1px',
          }}>
            {formatTimecode(group.playheadSeconds)}
          </span>
        </div>

        {/* Record / Program toggle */}
        <ViewToggle isProgram={isProgram} onToggle={() => setIsProgram(!isProgram)} />

        {/* Camera Grid */}
        <div style={S.section}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridLayout === '2x2' ? 2 : 3}, 1fr)`,
            gap: 4,
          }}>
            {visibleAngles.map((angle, idx) => (
              <CameraCell
                key={angle.id}
                angle={angle}
                index={idx}
                isActive={group.activeAngleIndex === idx}
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
            <div style={{
              fontSize: 10,
              color: 'var(--error)',
              fontWeight: 600,
              textAlign: 'center',
              padding: '6px 0',
            }}>
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
          onToggleFollow={handleToggleAudioFollow}
          onSetAngle={handleSetAudioAngle}
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

        {/* Cut history */}
        <CutHistory cuts={cuts} />
      </div>
    </div>
  );
}
