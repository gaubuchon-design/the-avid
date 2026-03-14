// =============================================================================
//  THE AVID -- Cut Page (DaVinci Resolve Cut Page Parity)
//  Dual source/record monitors, edit mode buttons, transport controls,
//  quick export, sync bin, trim controls, and compact filmstrip timeline.
// =============================================================================

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { SourceMonitor } from '../components/SourceMonitor/SourceMonitor';
import { RecordMonitor } from '../components/RecordMonitor/RecordMonitor';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { BinPanel } from '../components/Bins/BinPanel';
import { useEditorStore } from '../store/editor.store';
import { Timecode } from '../lib/timecode';

// =============================================================================
//  Types
// =============================================================================

type CutEditMode = 'insert' | 'overwrite' | 'replace' | 'placeOnTop' | 'appendAtEnd';
type TrimMode = 'off' | 'ripple' | 'roll';

// =============================================================================
//  Styles
// =============================================================================

const toolbarBtnStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: 9,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  transition: 'all 120ms ease',
  whiteSpace: 'nowrap',
};

const toolbarSeparator: React.CSSProperties = {
  width: 1,
  height: 18,
  background: 'var(--border-default)',
  margin: '0 4px',
  flexShrink: 0,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  padding: '0 2px',
  flexShrink: 0,
};

const tcDisplayStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-primary)',
  background: 'var(--bg-void)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  padding: '2px 8px',
  letterSpacing: '0.04em',
  userSelect: 'none',
  minWidth: 88,
  textAlign: 'center' as const,
};

const durationBadgeStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: 'var(--brand-bright)',
  background: 'rgba(91, 110, 244, 0.12)',
  border: '1px solid rgba(91, 110, 244, 0.25)',
  borderRadius: 3,
  padding: '1px 6px',
  fontFamily: 'var(--font-mono, monospace)',
  letterSpacing: '0.02em',
};

// =============================================================================
//  CutPage Skeleton (Loading State)
// =============================================================================

function CutPageSkeleton() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} aria-hidden="true">
      {/* Toolbar skeleton */}
      <div style={{ height: 32, flexShrink: 0, background: 'var(--bg-raised)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ height: 14, background: 'var(--bg-elevated)', borderRadius: 3, width: `${40 + Math.random() * 40}px` }} />
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
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

// =============================================================================
//  Quick Export Dialog (Inline compact panel)
// =============================================================================

function QuickExportDialog({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<'h264' | 'h265' | 'prores' | 'dnxhd'>('h264');
  const [resolution, setResolution] = useState<'source' | '1080p' | '4k'>('source');
  const [exporting, setExporting] = useState(false);
  const projectName = useEditorStore((s) => s.projectName);
  const duration = useEditorStore((s) => s.duration);

  const handleExport = useCallback(() => {
    setExporting(true);
    // Simulate export start -- in production this would dispatch to RenderFarmEngine
    setTimeout(() => {
      setExporting(false);
      onClose();
    }, 1500);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-label="Quick Export"
    >
      <div style={{
        width: 360, background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-raised)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
            Quick Export
          </span>
          <button
            onClick={onClose}
            aria-label="Close quick export"
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-tertiary)',
              fontSize: 14, cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}
          >
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Project info */}
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            {projectName || 'Untitled Project'} &mdash; {duration > 0 ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}` : '0:00'}
          </div>

          {/* Format */}
          <div>
            <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
              Format
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['h264', 'h265', 'prores', 'dnxhd'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  style={{
                    ...toolbarBtnStyle,
                    background: format === f ? 'var(--brand)' : 'var(--bg-raised)',
                    color: format === f ? '#fff' : 'var(--text-secondary)',
                    borderColor: format === f ? 'var(--brand)' : 'var(--border-default)',
                    fontSize: 9,
                  }}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
              Resolution
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value as typeof resolution)}
              style={{
                width: '100%', padding: '4px 8px', fontSize: 10,
                background: 'var(--bg-raised)', color: 'var(--text-primary)',
                border: '1px solid var(--border-default)', borderRadius: 3,
                outline: 'none',
              }}
            >
              <option value="source">Source Resolution</option>
              <option value="1080p">1920 x 1080 (HD)</option>
              <option value="4k">3840 x 2160 (4K UHD)</option>
            </select>
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: '8px 16px', fontSize: 11, fontWeight: 700,
              background: exporting ? 'var(--bg-elevated)' : 'var(--brand)',
              color: exporting ? 'var(--text-tertiary)' : '#fff',
              border: 'none', borderRadius: 4, cursor: exporting ? 'default' : 'pointer',
              transition: 'all 150ms',
            }}
          >
            {exporting ? 'Starting Export...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
//  Source Viewer Toolbar (Mark In/Out, Clear Marks, Go to In/Out)
// =============================================================================

function SourceViewerToolbar() {
  const sourceInPoint = useEditorStore((s) => s.sourceInPoint);
  const sourceOutPoint = useEditorStore((s) => s.sourceOutPoint);
  const sourcePlayhead = useEditorStore((s) => s.sourcePlayhead);
  const setSourceInPoint = useEditorStore((s) => s.setSourceInPoint);
  const setSourceOutPoint = useEditorStore((s) => s.setSourceOutPoint);
  const clearSourceInOut = useEditorStore((s) => s.clearSourceInOut);
  const setSourcePlayhead = useEditorStore((s) => s.setSourcePlayhead);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);

  const tc = useMemo(
    () => new Timecode({ fps, dropFrame: false }),
    [fps],
  );

  const handleMarkIn = useCallback(() => {
    setSourceInPoint(sourcePlayhead);
  }, [sourcePlayhead, setSourceInPoint]);

  const handleMarkOut = useCallback(() => {
    setSourceOutPoint(sourcePlayhead);
  }, [sourcePlayhead, setSourceOutPoint]);

  const handleGoToIn = useCallback(() => {
    if (sourceInPoint !== null) setSourcePlayhead(sourceInPoint);
  }, [sourceInPoint, setSourcePlayhead]);

  const handleGoToOut = useCallback(() => {
    if (sourceOutPoint !== null) setSourcePlayhead(sourceOutPoint);
  }, [sourceOutPoint, setSourcePlayhead]);

  // Marked duration display
  const markedDuration = useMemo(() => {
    if (sourceInPoint !== null && sourceOutPoint !== null && sourceOutPoint > sourceInPoint) {
      return tc.secondsToTC(sourceOutPoint - sourceInPoint);
    }
    return null;
  }, [sourceInPoint, sourceOutPoint, tc]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      padding: '2px 6px',
      background: 'var(--bg-raised)',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <span style={sectionLabelStyle}>Source</span>
      <div style={toolbarSeparator} />

      {/* Mark In */}
      <button
        onClick={handleMarkIn}
        title="Mark In (I)"
        aria-label="Mark In point"
        style={{
          ...toolbarBtnStyle,
          background: sourceInPoint !== null ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
          color: sourceInPoint !== null ? '#60a5fa' : 'var(--text-secondary)',
          borderColor: sourceInPoint !== null ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-default)',
        }}
      >
        Mark In
      </button>

      {/* Mark Out */}
      <button
        onClick={handleMarkOut}
        title="Mark Out (O)"
        aria-label="Mark Out point"
        style={{
          ...toolbarBtnStyle,
          background: sourceOutPoint !== null ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
          color: sourceOutPoint !== null ? '#60a5fa' : 'var(--text-secondary)',
          borderColor: sourceOutPoint !== null ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-default)',
        }}
      >
        Mark Out
      </button>

      {/* Clear Marks */}
      <button
        onClick={clearSourceInOut}
        title="Clear In/Out marks (G)"
        aria-label="Clear In and Out marks"
        style={{
          ...toolbarBtnStyle,
          background: 'var(--bg-surface)',
          color: 'var(--text-tertiary)',
        }}
      >
        Clear
      </button>

      <div style={toolbarSeparator} />

      {/* Go to In */}
      <button
        onClick={handleGoToIn}
        title="Go to In point (Shift+I)"
        aria-label="Go to In point"
        disabled={sourceInPoint === null}
        style={{
          ...toolbarBtnStyle,
          background: 'var(--bg-surface)',
          color: sourceInPoint !== null ? 'var(--text-secondary)' : 'var(--text-muted)',
          opacity: sourceInPoint !== null ? 1 : 0.4,
        }}
      >
        Go In
      </button>

      {/* Go to Out */}
      <button
        onClick={handleGoToOut}
        title="Go to Out point (Shift+O)"
        aria-label="Go to Out point"
        disabled={sourceOutPoint === null}
        style={{
          ...toolbarBtnStyle,
          background: 'var(--bg-surface)',
          color: sourceOutPoint !== null ? 'var(--text-secondary)' : 'var(--text-muted)',
          opacity: sourceOutPoint !== null ? 1 : 0.4,
        }}
      >
        Go Out
      </button>

      {/* Duration badge */}
      {markedDuration && (
        <>
          <div style={toolbarSeparator} />
          <span style={durationBadgeStyle} title="Marked duration">
            DUR {markedDuration}
          </span>
        </>
      )}
    </div>
  );
}

// =============================================================================
//  Edit Mode Buttons (Insert, Overwrite, Replace, Place on Top, Append)
// =============================================================================

const EDIT_MODES: { key: CutEditMode; label: string; shortcut: string; color: string; hoverBg: string }[] = [
  { key: 'insert', label: 'Insert', shortcut: 'F9', color: '#facc15', hoverBg: 'rgba(250, 204, 21, 0.15)' },
  { key: 'overwrite', label: 'Overwrite', shortcut: 'F10', color: '#ef4444', hoverBg: 'rgba(239, 68, 68, 0.15)' },
  { key: 'replace', label: 'Replace', shortcut: 'F11', color: 'var(--text-secondary)', hoverBg: 'var(--bg-elevated)' },
  { key: 'placeOnTop', label: 'Place on Top', shortcut: 'F12', color: 'var(--text-secondary)', hoverBg: 'var(--bg-elevated)' },
  { key: 'appendAtEnd', label: 'Append at End', shortcut: 'Shift+F12', color: 'var(--brand-bright)', hoverBg: 'rgba(91, 110, 244, 0.15)' },
];

function EditModeButtons({
  activeMode,
  onModeSelect,
}: {
  activeMode: CutEditMode;
  onModeSelect: (mode: CutEditMode) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} role="group" aria-label="Edit mode buttons">
      <span style={sectionLabelStyle}>Edit</span>
      <div style={toolbarSeparator} />
      {EDIT_MODES.map((mode) => {
        const isActive = activeMode === mode.key;
        return (
          <button
            key={mode.key}
            onClick={() => onModeSelect(mode.key)}
            title={`${mode.label} (${mode.shortcut})`}
            aria-pressed={isActive}
            style={{
              ...toolbarBtnStyle,
              background: isActive ? mode.hoverBg : 'var(--bg-surface)',
              color: isActive ? mode.color : 'var(--text-tertiary)',
              borderColor: isActive ? mode.color : 'var(--border-default)',
              borderWidth: isActive ? 1 : 1,
              fontWeight: isActive ? 700 : 600,
            }}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
//  Trim Mode Controls (Ripple, Roll)
// =============================================================================

function TrimControls({
  trimMode,
  onTrimModeChange,
}: {
  trimMode: TrimMode;
  onTrimModeChange: (mode: TrimMode) => void;
}) {
  const trimModes: { key: TrimMode; label: string; title: string }[] = [
    { key: 'off', label: 'Select', title: 'Selection mode (A)' },
    { key: 'ripple', label: 'Ripple', title: 'Ripple trim mode (B)' },
    { key: 'roll', label: 'Roll', title: 'Roll trim mode (N)' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} role="group" aria-label="Trim mode controls">
      <span style={sectionLabelStyle}>Trim</span>
      <div style={toolbarSeparator} />
      {trimModes.map((tm) => {
        const isActive = trimMode === tm.key;
        return (
          <button
            key={tm.key}
            onClick={() => onTrimModeChange(tm.key)}
            title={tm.title}
            aria-pressed={isActive}
            style={{
              ...toolbarBtnStyle,
              background: isActive ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
              borderColor: isActive ? 'var(--brand)' : 'var(--border-default)',
            }}
          >
            {tm.label}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
//  Transport Controls (JKL, Play/Pause, Step, Go to Start/End)
// =============================================================================

function TransportBar() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const duration = useEditorStore((s) => s.duration);
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const goToStart = useEditorStore((s) => s.goToStart);
  const goToEnd = useEditorStore((s) => s.goToEnd);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const setInToPlayhead = useEditorStore((s) => s.setInToPlayhead);
  const setOutToPlayhead = useEditorStore((s) => s.setOutToPlayhead);
  const clearInOut = useEditorStore((s) => s.clearInOut);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);

  const [shuttleSpeed, setShuttleSpeed] = useState(0); // -3 to 3 for J/K/L

  const tc = useMemo(
    () => new Timecode({ fps, dropFrame: false }),
    [fps],
  );

  const currentTC = useMemo(
    () => tc.secondsToTC(playheadTime),
    [tc, playheadTime],
  );

  const durationTC = useMemo(
    () => tc.secondsToTC(duration),
    [tc, duration],
  );

  // Record marked duration
  const recordMarkedDuration = useMemo(() => {
    if (inPoint !== null && outPoint !== null && outPoint > inPoint) {
      return tc.secondsToTC(outPoint - inPoint);
    }
    return null;
  }, [inPoint, outPoint, tc]);

  const stepForward = useCallback(() => {
    const safeDuration = Number.isFinite(duration) ? duration : 0;
    const safeTime = Number.isFinite(playheadTime) ? playheadTime : 0;
    setPlayhead(Math.min(safeTime + 1 / fps, safeDuration));
  }, [playheadTime, duration, fps, setPlayhead]);

  const stepBackward = useCallback(() => {
    const safeTime = Number.isFinite(playheadTime) ? playheadTime : 0;
    setPlayhead(Math.max(safeTime - 1 / fps, 0));
  }, [playheadTime, fps, setPlayhead]);

  // JKL shuttle control
  const handleJ = useCallback(() => {
    setShuttleSpeed((prev) => Math.max(-3, prev - 1));
  }, []);

  const handleK = useCallback(() => {
    setShuttleSpeed(0);
    if (isPlaying) togglePlay();
  }, [isPlaying, togglePlay]);

  const handleL = useCallback(() => {
    setShuttleSpeed((prev) => Math.min(3, prev + 1));
    if (!isPlaying) togglePlay();
  }, [isPlaying, togglePlay]);

  const transportBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 5px',
    borderRadius: 3,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 24,
    height: 24,
    transition: 'color 100ms, background 100ms',
  };

  const jklBtnStyle = (active: boolean): React.CSSProperties => ({
    ...transportBtnStyle,
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'var(--font-mono, monospace)',
    color: active ? 'var(--brand-bright)' : 'var(--text-tertiary)',
    background: active ? 'rgba(91, 110, 244, 0.12)' : 'transparent',
    border: active ? '1px solid rgba(91, 110, 244, 0.3)' : '1px solid transparent',
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 10px',
      background: 'var(--bg-raised)',
      borderTop: '1px solid var(--border-default)',
    }}>
      {/* Record monitor mark controls */}
      <button
        onClick={setInToPlayhead}
        title="Mark In (I)"
        style={{
          ...transportBtnStyle,
          fontSize: 10, fontWeight: 700,
          color: inPoint !== null ? '#60a5fa' : 'var(--text-tertiary)',
        }}
      >
        I
      </button>
      <button
        onClick={setOutToPlayhead}
        title="Mark Out (O)"
        style={{
          ...transportBtnStyle,
          fontSize: 10, fontWeight: 700,
          color: outPoint !== null ? '#60a5fa' : 'var(--text-tertiary)',
        }}
      >
        O
      </button>
      <button
        onClick={clearInOut}
        title="Clear In/Out (G)"
        style={{
          ...transportBtnStyle,
          fontSize: 8, fontWeight: 600, color: 'var(--text-muted)',
        }}
      >
        CLR
      </button>

      <div style={toolbarSeparator} />

      {/* JKL shuttle controls */}
      <span style={{ ...sectionLabelStyle, marginRight: 2 }}>JKL</span>
      <button onClick={handleJ} title="Shuttle Reverse (J)" style={jklBtnStyle(shuttleSpeed < 0)}>
        J
      </button>
      <button onClick={handleK} title="Stop / Pause (K)" style={jklBtnStyle(shuttleSpeed === 0 && !isPlaying)}>
        K
      </button>
      <button onClick={handleL} title="Shuttle Forward (L)" style={jklBtnStyle(shuttleSpeed > 0)}>
        L
      </button>

      {shuttleSpeed !== 0 && (
        <span style={{ fontSize: 8, color: 'var(--warning-text)', fontWeight: 600, marginLeft: 2 }}>
          {shuttleSpeed > 0 ? '+' : ''}{shuttleSpeed}x
        </span>
      )}

      <div style={toolbarSeparator} />

      {/* Standard transport */}
      <button onClick={goToStart} title="Go to Start (Home)" style={transportBtnStyle} aria-label="Go to start">
        |&#x25C0;
      </button>
      <button onClick={stepBackward} title="Step Backward (Left arrow)" style={transportBtnStyle} aria-label="Step backward one frame">
        &#x25C0;
      </button>
      <button
        onClick={togglePlay}
        title="Play/Pause (Space)"
        style={{
          ...transportBtnStyle,
          fontSize: 16,
          color: isPlaying ? 'var(--brand-bright)' : 'var(--text-primary)',
          background: isPlaying ? 'rgba(91, 110, 244, 0.1)' : 'transparent',
          borderRadius: '50%',
          width: 28, height: 28, minWidth: 28,
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>
      <button onClick={stepForward} title="Step Forward (Right arrow)" style={transportBtnStyle} aria-label="Step forward one frame">
        &#x25B6;
      </button>
      <button onClick={goToEnd} title="Go to End (End)" style={transportBtnStyle} aria-label="Go to end">
        &#x25B6;|
      </button>

      <div style={toolbarSeparator} />

      {/* Timecode display */}
      <div style={tcDisplayStyle} role="status" aria-live="polite" aria-label="Current timecode">
        {currentTC}
      </div>

      <span style={{ fontSize: 8, color: 'var(--text-muted)', padding: '0 2px' }}>/</span>

      <div style={{ ...tcDisplayStyle, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', minWidth: 'auto', padding: '2px 4px' }}>
        {durationTC}
      </div>

      {/* Record marked duration */}
      {recordMarkedDuration && (
        <>
          <div style={toolbarSeparator} />
          <span style={durationBadgeStyle} title="Timeline marked duration">
            SEL {recordMarkedDuration}
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Shuttle speed indicator */}
      {shuttleSpeed !== 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '1px 6px',
          background: 'rgba(240, 165, 0, 0.1)',
          border: '1px solid rgba(240, 165, 0, 0.25)',
          borderRadius: 3,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--warning-text)' }}>
            SHUTTLE {shuttleSpeed > 0 ? 'FWD' : 'REV'} {Math.abs(shuttleSpeed)}x
          </span>
        </div>
      )}
    </div>
  );
}

// =============================================================================
//  Compact Timeline Strip (filmstrip view with track lanes)
// =============================================================================

function CompactTimeline() {
  const tracks = useEditorStore((s) => s.tracks);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const duration = useEditorStore((s) => s.duration);
  const zoom = useEditorStore((s) => s.zoom);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const effectiveDuration = Math.max(duration, 10);
  const pxPerSecond = containerWidth / effectiveDuration;
  const playheadPx = playheadTime * pxPerSecond;

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(effectiveDuration, x / pxPerSecond));
    setPlayhead(time);
  }, [effectiveDuration, pxPerSecond, setPlayhead]);

  const trackColors: Record<string, string> = {
    VIDEO: '#5b6ef4',
    AUDIO: '#22c896',
    EFFECT: '#f0a500',
    SUBTITLE: '#c084fc',
    GRAPHIC: '#fb7185',
  };

  const trackHeight = 20;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        cursor: 'crosshair',
      }}
      onClick={handleTimelineClick}
      role="region"
      aria-label="Compact filmstrip timeline"
    >
      {/* Track lanes */}
      {tracks.map((track, idx) => {
        const bgColor = trackColors[track.type] || '#5b6ef4';
        return (
          <div
            key={track.id}
            style={{
              position: 'absolute',
              top: idx * (trackHeight + 1),
              left: 0, right: 0,
              height: trackHeight,
              background: 'var(--bg-void)',
              borderBottom: '1px solid var(--border-default)',
            }}
          >
            {/* Track label */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: 30, background: 'var(--bg-raised)',
              borderRight: '1px solid var(--border-default)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 700, color: bgColor,
              zIndex: 2, userSelect: 'none',
            }}>
              {track.name}
            </div>

            {/* Clips */}
            {track.clips.map((clip) => {
              const clipLeft = clip.startTime * pxPerSecond + 30;
              const clipWidth = Math.max(2, (clip.endTime - clip.startTime) * pxPerSecond);
              return (
                <div
                  key={clip.id}
                  style={{
                    position: 'absolute',
                    left: clipLeft,
                    top: 1,
                    width: clipWidth,
                    height: trackHeight - 2,
                    background: clip.color || bgColor,
                    opacity: track.muted ? 0.3 : 0.75,
                    borderRadius: 2,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 3,
                  }}
                  title={clip.name}
                >
                  {clipWidth > 40 && (
                    <span style={{
                      fontSize: 7, fontWeight: 600,
                      color: 'rgba(255,255,255,0.9)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', maxWidth: clipWidth - 6,
                    }}>
                      {clip.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Playhead */}
      <div style={{
        position: 'absolute',
        left: playheadPx + 30,
        top: 0, bottom: 0,
        width: 1,
        background: 'var(--error)',
        zIndex: 10,
        pointerEvents: 'none',
      }}>
        {/* Playhead triangle */}
        <div style={{
          position: 'absolute',
          top: -1,
          left: -4,
          width: 0, height: 0,
          borderLeft: '4px solid transparent',
          borderRight: '4px solid transparent',
          borderTop: '5px solid var(--error)',
        }} />
      </div>

      {/* Empty state */}
      {tracks.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: 10,
        }}>
          No tracks in timeline
        </div>
      )}
    </div>
  );
}

// =============================================================================
//  Main Cut Page Component
// =============================================================================

export function CutPage() {
  const [isReady, setIsReady] = useState(false);
  const [cutEditMode, setCutEditMode] = useState<CutEditMode>('overwrite');
  const [cutTrimMode, setCutTrimMode] = useState<TrimMode>('off');
  const [syncBinActive, setSyncBinActive] = useState(false);
  const [showQuickExport, setShowQuickExport] = useState(false);

  // Store actions for edit operations
  const insertEdit = useEditorStore((s) => s.insertEdit);
  const overwriteEdit = useEditorStore((s) => s.overwriteEdit);
  const setTrimMode = useEditorStore((s) => s.setTrimMode);

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Sync trim mode to store
  useEffect(() => {
    if (cutTrimMode === 'ripple') {
      setTrimMode('ripple');
    } else if (cutTrimMode === 'roll') {
      setTrimMode('roll');
    } else {
      setTrimMode('off');
    }
  }, [cutTrimMode, setTrimMode]);

  // Handle edit mode action dispatch
  const handleEditModeAction = useCallback((mode: CutEditMode) => {
    setCutEditMode(mode);
    // Dispatch the appropriate edit action to the store
    switch (mode) {
      case 'insert':
        insertEdit();
        break;
      case 'overwrite':
        overwriteEdit();
        break;
      case 'replace':
        // Replace uses overwrite semantics on the current track
        overwriteEdit();
        break;
      case 'placeOnTop':
        // Place on top performs an insert on the next available track
        insertEdit();
        break;
      case 'appendAtEnd':
        // Append navigates to end then inserts
        useEditorStore.getState().goToEnd();
        insertEdit();
        break;
    }
  }, [insertEdit, overwriteEdit]);

  // Keyboard shortcuts for Cut page
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // F9-F12 for edit modes
      if (e.key === 'F9') { e.preventDefault(); handleEditModeAction('insert'); }
      if (e.key === 'F10') { e.preventDefault(); handleEditModeAction('overwrite'); }
      if (e.key === 'F11') { e.preventDefault(); handleEditModeAction('replace'); }
      if (e.key === 'F12' && !e.shiftKey) { e.preventDefault(); handleEditModeAction('placeOnTop'); }
      if (e.key === 'F12' && e.shiftKey) { e.preventDefault(); handleEditModeAction('appendAtEnd'); }

      // Trim modes
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) { setCutTrimMode('off'); }
      if (e.key === 'b' && !e.metaKey && !e.ctrlKey) { setCutTrimMode('ripple'); }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { setCutTrimMode('roll'); }

      // Quick export
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setShowQuickExport((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleEditModeAction]);

  if (!isReady) {
    return <CutPageSkeleton />;
  }

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      role="region"
      aria-label="Cut Page - DaVinci Resolve-style fast editing"
    >
      {/* ─── Top Toolbar: Edit Modes, Trim Controls, Quick Export, Sync Bin ─── */}
      <div style={{
        height: 32, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 8px',
        background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border-default)',
        overflow: 'hidden',
      }}>
        {/* Edit Mode Buttons */}
        <EditModeButtons activeMode={cutEditMode} onModeSelect={setCutEditMode} />

        <div style={toolbarSeparator} />

        {/* Trim Controls */}
        <TrimControls trimMode={cutTrimMode} onTrimModeChange={setCutTrimMode} />

        <div style={toolbarSeparator} />

        {/* Sync Bin toggle */}
        <button
          onClick={() => setSyncBinActive((prev) => !prev)}
          title="Sync Bin - Show clips synced to timeline position"
          aria-pressed={syncBinActive}
          style={{
            ...toolbarBtnStyle,
            background: syncBinActive ? 'rgba(34, 200, 150, 0.15)' : 'var(--bg-surface)',
            color: syncBinActive ? '#22c896' : 'var(--text-tertiary)',
            borderColor: syncBinActive ? 'rgba(34, 200, 150, 0.3)' : 'var(--border-default)',
          }}
        >
          Sync Bin
        </button>

        {/* Smart Insert indicator */}
        <button
          title="Smart Insert - Drop clips anywhere to intelligently insert"
          style={{
            ...toolbarBtnStyle,
            background: 'var(--bg-surface)',
            color: 'var(--text-tertiary)',
          }}
        >
          Smart Insert
        </button>

        <div style={{ flex: 1 }} />

        {/* Quick Export */}
        <button
          onClick={() => setShowQuickExport(true)}
          title="Quick Export (Cmd+Shift+E)"
          style={{
            ...toolbarBtnStyle,
            background: 'var(--brand)',
            color: '#fff',
            borderColor: 'var(--brand)',
            fontWeight: 700,
            padding: '3px 12px',
          }}
        >
          Quick Export
        </button>
      </div>

      {/* ─── Main Content: Bin + Source Monitor + Record Monitor ──────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Compact bin strip / Sync Bin */}
        <div style={{
          width: syncBinActive ? 240 : 200, flexShrink: 0,
          borderRight: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'width 200ms ease',
        }}>
          {/* Bin header with Sync Bin indicator */}
          {syncBinActive && (
            <div style={{
              padding: '4px 8px',
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#22c896',
              borderBottom: '1px solid var(--border-default)',
              background: 'rgba(34, 200, 150, 0.06)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22c896',
                display: 'inline-block',
              }} />
              Sync Bin Active
            </div>
          )}
          <BinPanel />
        </div>

        {/* Source Monitor with toolbar overlay */}
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--border-subtle)' }}
          role="region"
          aria-label="Source monitor"
        >
          <SourceViewerToolbar />
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

      {/* ─── Transport Controls Bar ──────────────────────────────────────── */}
      <TransportBar />

      {/* ─── Bottom: Compact Filmstrip Timeline ─────────────────────────── */}
      <div
        style={{
          height: 140, flexShrink: 0,
          borderTop: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        role="region"
        aria-label="Cut page filmstrip timeline"
      >
        {/* Timeline header */}
        <div style={{
          height: 20, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 8px', gap: 6,
          background: 'var(--bg-raised)',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}>
            Timeline
          </span>
          <div style={{ flex: 1 }} />
          <span style={{
            fontSize: 8, color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            Cut Page View
          </span>
        </div>

        {/* Timeline content - use the full TimelinePanel */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TimelinePanel />
        </div>
      </div>

      {/* ─── Quick Export Dialog ──────────────────────────────────────────── */}
      {showQuickExport && (
        <QuickExportDialog onClose={() => setShowQuickExport(false)} />
      )}
    </div>
  );
}
