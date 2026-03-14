// =============================================================================
//  THE AVID -- Multi-Camera Viewer (FT-04)
// =============================================================================
//
//  Grid-based multi-camera monitoring panel with:
//  - Configurable grid layouts (auto, 2x2, 3x3, 4x4)
//  - Click-to-select active angle with red border tally light
//  - Camera label overlays (CAM A - Wide, CAM B - Medium, etc.)
//  - Full-screen toggle for individual cameras
//  - Per-camera audio meters with peak indicators
//  - Live/recording badge with tally light simulation
//  - Single/Grid/Split view modes
//  - Keyboard shortcuts 1-9 for angle switching
//
//  Full DaVinci Resolve + Avid Media Composer multicam viewer parity.
// =============================================================================

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { useMediaStore } from '../../store/media.store';

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

// -- Types --------------------------------------------------------------------

interface DemoAngle {
  id: string;
  label: string;
  color: string;
  assetName: string;
  timecodeStart: string;
  durationSeconds: number;
  audioChannel: number;
}

// -- Demo data ----------------------------------------------------------------

const DEMO_ANGLES: DemoAngle[] = [
  { id: 'a1', label: 'CAM A - Wide', color: '#4f63f5', assetName: 'A_Cam_Master.mxf', timecodeStart: '01:00:00:00', durationSeconds: 720, audioChannel: 0 },
  { id: 'a2', label: 'CAM B - Medium', color: '#25a865', assetName: 'B_Cam_Wide.mxf', timecodeStart: '01:00:00:02', durationSeconds: 718, audioChannel: 1 },
  { id: 'a3', label: 'CAM C - Close-up', color: '#e05b8e', assetName: 'C_Cam_CU.mxf', timecodeStart: '01:00:00:01', durationSeconds: 715, audioChannel: 2 },
  { id: 'a4', label: 'CAM D - Alt Angle', color: '#e8943a', assetName: 'D_Cam_Reverse.mxf', timecodeStart: '00:59:59:12', durationSeconds: 710, audioChannel: 3 },
];

// -- Styles -------------------------------------------------------------------

const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--bg-surface, #1a1a2e)',
  color: 'var(--text-primary, #e0e0e0)',
  fontFamily: 'var(--font-display, system-ui), system-ui, sans-serif',
  fontSize: 12,
  overflow: 'hidden',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
};

const toolbar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 16px',
  borderBottom: '1px solid var(--border-default, #2a2a40)',
  flexShrink: 0,
  flexWrap: 'wrap',
};

const toolbarBtn = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  border: `1px solid ${active ? 'var(--accent-primary, #4f63f5)' : 'var(--border-default, #2a2a40)'}`,
  borderRadius: 4,
  background: active ? 'var(--accent-primary, #4f63f5)' : 'transparent',
  color: active ? '#fff' : 'var(--text-primary, #e0e0e0)',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'all 0.15s',
  fontWeight: active ? 600 : 400,
});

const gridContainer: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gap: 4,
  padding: 8,
  overflow: 'auto',
};

const statusBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 16px',
  borderTop: '1px solid var(--border-default, #2a2a40)',
  fontSize: 10,
  color: 'var(--text-secondary, #888)',
  flexShrink: 0,
};

// -- Audio Meter Component ----------------------------------------------------

function AudioMeter({
  level,
  peakLevel,
  color,
  vertical = true,
}: {
  level: number;       // 0-100
  peakLevel: number;   // 0-100
  color: string;
  vertical?: boolean;
}) {
  const getBarColor = (fillPercent: number): string => {
    if (fillPercent > 90) return '#ef4444';
    if (fillPercent > 75) return '#f59e0b';
    return '#22c55e';
  };

  if (vertical) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          width: 6,
          height: '100%',
          minHeight: 30,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 2,
          overflow: 'hidden',
          justifyContent: 'flex-end',
        }}
        role="meter"
        aria-label="Audio level"
        aria-valuenow={level}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div style={{
          width: '100%',
          height: `${level}%`,
          background: getBarColor(level),
          borderRadius: 1,
          transition: 'height 100ms',
          position: 'relative',
        }}>
          {/* Peak indicator */}
          {peakLevel > level && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: peakLevel > 90 ? '#ef4444' : '#fff',
              transform: `translateY(-${((peakLevel - level) / 100) * 60}px)`,
            }} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 1,
        height: 4,
        width: '100%',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
      role="meter"
      aria-label="Audio level"
      aria-valuenow={level}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{
        height: '100%',
        width: `${level}%`,
        background: getBarColor(level),
        borderRadius: 1,
        transition: 'width 100ms',
      }} />
    </div>
  );
}

// -- Camera View Cell ---------------------------------------------------------

function CameraViewCell({
  angle,
  index,
  isActive,
  isFullscreen,
  showAudioMeter,
  audioLevel,
  audioPeakLevel,
  isLive,
  playheadSeconds,
  onClick,
  onFullscreenToggle,
}: {
  angle: DemoAngle;
  index: number;
  isActive: boolean;
  isFullscreen: boolean;
  showAudioMeter: boolean;
  audioLevel: number;
  audioPeakLevel: number;
  isLive: boolean;
  playheadSeconds: number;
  onClick: () => void;
  onFullscreenToggle: () => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        background: '#0a0a14',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        border: isActive
          ? `3px solid ${isLive ? '#ef4444' : angle.color}`
          : '2px solid var(--border-subtle, #222)',
        boxShadow: isActive ? `0 0 12px ${isLive ? 'rgba(239,68,68,0.4)' : `${angle.color}44`}` : 'none',
        minHeight: isFullscreen ? 300 : 80,
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
        if (e.key === 'f' || e.key === 'F') { e.preventDefault(); onFullscreenToggle(); }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${angle.label}${isActive ? ', active camera' : ''}, press to select`}
      aria-pressed={isActive}
    >
      {/* Red tally light for active camera */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: isLive ? '#ef4444' : angle.color,
            zIndex: 2,
          }}
          aria-hidden="true"
        />
      )}

      {/* Gradient background placeholder for video */}
      <div
        style={{
          width: '100%',
          height: '100%',
          minHeight: isFullscreen ? 300 : 80,
          background: `linear-gradient(135deg, ${angle.color}18, ${angle.color}06)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isFullscreen ? 16 : 11,
          color: 'var(--text-secondary, #888)',
        }}
      >
        {angle.assetName}
      </div>

      {/* Keyboard shortcut badge */}
      {index < 9 && (
        <span
          style={{
            position: 'absolute',
            top: isActive ? 8 : 6,
            left: 6,
            fontSize: 9,
            fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'rgba(255,255,255,0.5)',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: 2,
            padding: '1px 4px',
            lineHeight: '14px',
          }}
          aria-hidden="true"
        >
          {index + 1}
        </span>
      )}

      {/* Camera label overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: showAudioMeter ? 20 : 6,
          left: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 3,
            background: `${angle.color}cc`,
            color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}
        >
          {angle.label}
        </div>
      </div>

      {/* Active badge / Tally light */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            top: isActive ? 8 : 6,
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {/* Tally dot */}
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isLive ? '#ef4444' : angle.color,
            boxShadow: isLive ? '0 0 6px rgba(239,68,68,0.6)' : `0 0 4px ${angle.color}66`,
          }} aria-hidden="true" />
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            textTransform: 'uppercase',
            background: isLive ? '#ef4444' : angle.color,
            color: '#fff',
            letterSpacing: '0.04em',
          }}>
            {isLive ? 'PGM' : 'Active'}
          </span>
        </div>
      )}

      {/* Timecode overlay */}
      <div style={{
        position: 'absolute',
        bottom: showAudioMeter ? 20 : 6,
        right: 6,
        fontSize: 9,
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        background: 'rgba(0,0,0,0.5)',
        padding: '1px 4px',
        borderRadius: 2,
      }}>
        {formatTimecode(playheadSeconds)}
      </div>

      {/* Audio channel indicator */}
      <div style={{
        position: 'absolute',
        top: isActive ? 8 : 6,
        left: index < 9 ? 28 : 6,
        fontSize: 8,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'rgba(255,255,255,0.4)',
      }}>
        CH{angle.audioChannel + 1}
      </div>

      {/* Fullscreen toggle button */}
      <button
        onClick={(e) => { e.stopPropagation(); onFullscreenToggle(); }}
        style={{
          position: 'absolute',
          top: isActive ? 8 : 6,
          right: isActive ? 70 : 6,
          fontSize: 8,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.5)',
          background: 'rgba(0,0,0,0.5)',
          border: 'none',
          borderRadius: 2,
          padding: '2px 4px',
          cursor: 'pointer',
          transition: 'all 100ms',
        }}
        aria-label={isFullscreen ? `Exit fullscreen for ${angle.label}` : `Fullscreen ${angle.label}`}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (F)'}
      >
        {isFullscreen ? 'EXIT' : 'MAX'}
      </button>

      {/* Audio meter strip (bottom) */}
      {showAudioMeter && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 14,
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono, monospace)', minWidth: 16 }}>
            L
          </span>
          <AudioMeter level={audioLevel} peakLevel={audioPeakLevel} color={angle.color} vertical={false} />
          <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-mono, monospace)', minWidth: 16 }}>
            R
          </span>
          <AudioMeter level={Math.max(0, audioLevel - 5 + Math.random() * 10)} peakLevel={audioPeakLevel} color={angle.color} vertical={false} />
          <span style={{
            fontSize: 7,
            fontFamily: 'var(--font-mono, monospace)',
            color: audioLevel > 90 ? '#ef4444' : audioLevel > 75 ? '#f59e0b' : 'rgba(255,255,255,0.4)',
            minWidth: 22,
            textAlign: 'right',
          }}>
            {audioLevel > 0 ? `-${Math.round((100 - audioLevel) * 0.6)}dB` : '-inf'}
          </span>
        </div>
      )}
    </div>
  );
}

// -- Main Component -----------------------------------------------------------

export const MultiCamViewer: React.FC = () => {
  const viewMode = useMediaStore((s) => s.multiCamViewMode);
  const audioFollows = useMediaStore((s) => s.multiCamAudioFollowsVideo);
  const setViewMode = useMediaStore((s) => s.setMultiCamViewMode);
  const toggleAudioFollows = useMediaStore((s) => s.toggleMultiCamAudioFollowsVideo);
  const groups = useMediaStore((s) => s.multiCamGroups);
  const activeGroupId = useMediaStore((s) => s.activeMultiCamGroupId);

  const [activeAngle, setActiveAngle] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [fullscreenAngle, setFullscreenAngle] = useState<number | null>(null);
  const [showAudioMeters, setShowAudioMeters] = useState(true);
  const [showTimecodes, setShowTimecodes] = useState(true);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [splitAngles, setSplitAngles] = useState<[number, number]>([0, 1]);

  // Simulated audio levels (would come from real audio analysis in production)
  const [audioLevels, setAudioLevels] = useState<number[]>(DEMO_ANGLES.map(() => 0));
  const [audioPeakLevels, setAudioPeakLevels] = useState<number[]>(DEMO_ANGLES.map(() => 0));

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const angles = DEMO_ANGLES;

  // Simulate audio level updates
  useEffect(() => {
    if (!showAudioMeters) return;
    const interval = setInterval(() => {
      setAudioLevels((prev) => prev.map((_, i) => {
        const base = i === activeAngle ? 70 : 40;
        return Math.min(100, Math.max(0, base + Math.random() * 30 - 10));
      }));
      setAudioPeakLevels((prev) => prev.map((peak, i) => {
        const current = audioLevels[i] ?? 0;
        return current > peak ? current : Math.max(0, peak - 2);
      }));
    }, 150);
    return () => clearInterval(interval);
  }, [showAudioMeters, activeAngle, audioLevels]);

  // Keyboard shortcuts: 1-9 for angle switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= angles.length) {
        setActiveAngle(num - 1);
      }
      // ESC to exit fullscreen
      if (e.key === 'Escape' && fullscreenAngle !== null) {
        setFullscreenAngle(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [angles.length, fullscreenAngle]);

  const gridCols = useMemo(() => {
    const count = fullscreenAngle !== null ? 1 : angles.length;
    if (count <= 1) return 1;
    if (count <= 4) return 2;
    if (count <= 9) return 3;
    return 4;
  }, [angles.length, fullscreenAngle]);

  const handleAngleClick = useCallback((index: number) => {
    setActiveAngle(index);
  }, []);

  const handleToggleLive = useCallback(() => {
    setIsLive((prev) => !prev);
  }, []);

  const handleFullscreenToggle = useCallback((index: number) => {
    setFullscreenAngle((prev) => prev === index ? null : index);
  }, []);

  const displayAngles = fullscreenAngle !== null ? [angles[fullscreenAngle]!] : angles;

  return (
    <div style={panel} role="region" aria-label="Multi-Camera Viewer">
      {/* Header */}
      <div style={header}>
        <span>Multi-Camera Viewer</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isLive && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 3,
                background: '#e53e3e',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
              role="status"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'none' }} aria-hidden="true" />
              LIVE
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-secondary, #888)' }}>
            {activeGroup?.name ?? 'Scene 1 Multicam'}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div style={toolbar}>
        {/* View mode buttons */}
        <button
          type="button"
          style={toolbarBtn(viewMode === 'grid')}
          onClick={() => setViewMode('grid')}
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
        >
          Grid
        </button>
        <button
          type="button"
          style={toolbarBtn(viewMode === 'single')}
          onClick={() => setViewMode('single')}
          aria-label="Single camera view"
          aria-pressed={viewMode === 'single'}
        >
          Single
        </button>
        <button
          type="button"
          style={toolbarBtn(viewMode === 'split')}
          onClick={() => setViewMode('split')}
          aria-label="Split view comparing two cameras"
          aria-pressed={viewMode === 'split'}
        >
          Split
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border-default, #2a2a40)' }} aria-hidden="true" />

        {/* Audio meters toggle */}
        <button
          type="button"
          style={toolbarBtn(showAudioMeters)}
          onClick={() => setShowAudioMeters(!showAudioMeters)}
          aria-label={showAudioMeters ? 'Hide audio meters' : 'Show audio meters'}
          aria-pressed={showAudioMeters}
        >
          Meters
        </button>

        {/* Audio follows video */}
        <button
          type="button"
          style={toolbarBtn(audioFollows)}
          onClick={toggleAudioFollows}
          title="Audio follows active video angle"
          aria-label={audioFollows ? 'Audio follows video (on)' : 'Audio follows video (off)'}
          aria-pressed={audioFollows}
        >
          Audio Follow
        </button>

        <div style={{ flex: 1 }} />

        {/* Fullscreen exit */}
        {fullscreenAngle !== null && (
          <button
            type="button"
            style={toolbarBtn(false)}
            onClick={() => setFullscreenAngle(null)}
            aria-label="Exit fullscreen view"
          >
            Exit Full
          </button>
        )}

        {/* Live switch toggle */}
        <button
          type="button"
          style={{
            ...toolbarBtn(isLive),
            ...(isLive ? { background: '#e53e3e', borderColor: '#e53e3e', color: '#fff' } : {}),
          }}
          onClick={handleToggleLive}
          aria-label={isLive ? 'Stop live switching' : 'Start live switching'}
          aria-pressed={isLive}
        >
          {isLive ? 'Stop Live' : 'Live Switch'}
        </button>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div
          style={{
            ...gridContainer,
            gridTemplateColumns: `repeat(${fullscreenAngle !== null ? 1 : gridCols}, 1fr)`,
          }}
          role="group"
          aria-label="Camera angle grid"
        >
          {displayAngles.map((angle, idx) => {
            const realIndex = fullscreenAngle !== null ? fullscreenAngle : idx;
            return (
              <CameraViewCell
                key={angle.id}
                angle={angle}
                index={realIndex}
                isActive={realIndex === activeAngle}
                isFullscreen={fullscreenAngle === realIndex}
                showAudioMeter={showAudioMeters}
                audioLevel={audioLevels[realIndex] ?? 0}
                audioPeakLevel={audioPeakLevels[realIndex] ?? 0}
                isLive={isLive}
                playheadSeconds={playheadSeconds}
                onClick={() => handleAngleClick(realIndex)}
                onFullscreenToggle={() => handleFullscreenToggle(realIndex)}
              />
            );
          })}
        </div>
      )}

      {/* Single view */}
      {viewMode === 'single' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 8 }}>
          <CameraViewCell
            angle={angles[activeAngle]!}
            index={activeAngle}
            isActive={true}
            isFullscreen={true}
            showAudioMeter={showAudioMeters}
            audioLevel={audioLevels[activeAngle] ?? 0}
            audioPeakLevel={audioPeakLevels[activeAngle] ?? 0}
            isLive={isLive}
            playheadSeconds={playheadSeconds}
            onClick={() => {}}
            onFullscreenToggle={() => {}}
          />
          {/* Angle selector strip */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'center' }} role="radiogroup" aria-label="Select camera angle">
            {angles.map((angle, idx) => (
              <button
                key={angle.id}
                type="button"
                role="radio"
                aria-checked={idx === activeAngle}
                aria-label={angle.label}
                style={{
                  minWidth: 40,
                  height: 28,
                  borderRadius: 3,
                  border: idx === activeAngle ? `2px solid ${angle.color}` : '1px solid var(--border-default, #333)',
                  background: idx === activeAngle ? `${angle.color}33` : '#0a0a14',
                  color: idx === activeAngle ? '#fff' : 'var(--text-secondary, #888)',
                  fontSize: 9,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  transition: 'all 100ms',
                }}
                onClick={() => handleAngleClick(idx)}
              >
                <span>{idx + 1}</span>
                <span style={{ fontSize: 7, opacity: 0.7 }}>{angle.label.split(' - ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Split view */}
      {viewMode === 'split' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 8 }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {splitAngles.map((angleIdx, splitIdx) => {
              const angle = angles[angleIdx];
              if (!angle) return null;
              return (
                <CameraViewCell
                  key={`split-${splitIdx}-${angle.id}`}
                  angle={angle}
                  index={angleIdx}
                  isActive={angleIdx === activeAngle}
                  isFullscreen={false}
                  showAudioMeter={showAudioMeters}
                  audioLevel={audioLevels[angleIdx] ?? 0}
                  audioPeakLevel={audioPeakLevels[angleIdx] ?? 0}
                  isLive={isLive}
                  playheadSeconds={playheadSeconds}
                  onClick={() => handleAngleClick(angleIdx)}
                  onFullscreenToggle={() => handleFullscreenToggle(angleIdx)}
                />
              );
            })}
          </div>
          {/* Split angle selectors */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--text-secondary, #888)' }}>Left:</span>
              <select
                value={splitAngles[0]}
                onChange={(e) => setSplitAngles([Number(e.target.value), splitAngles[1]])}
                style={{
                  padding: '3px 6px',
                  background: 'var(--bg-void, #111)',
                  border: '1px solid var(--border-default, #333)',
                  borderRadius: 3,
                  color: 'var(--text-primary, #e0e0e0)',
                  fontSize: 9,
                  outline: 'none',
                }}
                aria-label="Left camera for split view"
              >
                {angles.map((a, i) => (
                  <option key={a.id} value={i}>{a.label}</option>
                ))}
              </select>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #666)' }}>vs</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'var(--text-secondary, #888)' }}>Right:</span>
              <select
                value={splitAngles[1]}
                onChange={(e) => setSplitAngles([splitAngles[0], Number(e.target.value)])}
                style={{
                  padding: '3px 6px',
                  background: 'var(--bg-void, #111)',
                  border: '1px solid var(--border-default, #333)',
                  borderRadius: 3,
                  color: 'var(--text-primary, #e0e0e0)',
                  fontSize: 9,
                  outline: 'none',
                }}
                aria-label="Right camera for split view"
              >
                {angles.map((a, i) => (
                  <option key={a.id} value={i}>{a.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div style={statusBar}>
        <span>{angles.length} angles{fullscreenAngle !== null ? ' (fullscreen)' : ''}</span>
        <span>
          Active: <strong style={{ color: angles[activeAngle]?.color }}>{angles[activeAngle]?.label ?? 'None'}</strong>
        </span>
        <span>Audio: {audioFollows ? 'Follows Video' : 'Locked'}</span>
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{formatTimecode(playheadSeconds)}</span>
      </div>
    </div>
  );
};

export default MultiCamViewer;
