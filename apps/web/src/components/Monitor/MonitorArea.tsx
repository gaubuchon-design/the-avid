import React, { useRef, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60),
        s = Math.floor(sec % 60), f = Math.floor((sec % 1) * 24);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

export function MonitorArea() {
  const {
    isPlaying, togglePlay, playheadTime, setPlayhead, showSafeZones, duration,
    tracks, selectedClipIds, sourceAsset, inPoint, outPoint, isFullscreen,
  } = useEditorStore();
  const totalClips = tracks.reduce((n, t) => n + t.clips.length, 0);
  const scrubRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Scrub bar progress
  const progress = duration > 0 ? (playheadTime / duration) * 100 : 0;

  // In/Out point positions on scrub bar
  const inPos = inPoint !== null && duration > 0 ? (inPoint / duration) * 100 : null;
  const outPos = outPoint !== null && duration > 0 ? (outPoint / duration) * 100 : null;

  // Scrub bar click-to-seek
  const handleScrub = useCallback((e: React.MouseEvent) => {
    const bar = scrubRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPlayhead(pct * duration);
  }, [duration, setPlayhead]);

  // Scrub drag
  const handleScrubDrag = useCallback((e: React.MouseEvent) => {
    handleScrub(e);
    const bar = scrubRef.current;
    if (!bar) return;

    const onMove = (ev: MouseEvent) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      setPlayhead(pct * duration);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [duration, setPlayhead, handleScrub]);

  // Toggle fullscreen
  const handleFullscreen = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <div className="composer-monitor" ref={canvasRef}>
      {/* Video canvas */}
      <div className="composer-canvas">
        {sourceAsset ? (
          <div className="composer-content">
            <div className="composer-asset-icon">
              {sourceAsset.type === 'AUDIO' ? '♪' : '▶'}
            </div>
            <div className="composer-asset-name">{sourceAsset.name}</div>
          </div>
        ) : (
          <div className="composer-placeholder">
            <div className="composer-placeholder-icon">▶</div>
          </div>
        )}

        {showSafeZones && (
          <div className="safe-zone">
            <div className="safe-zone-action" />
            <div className="safe-zone-title" />
          </div>
        )}

        {/* Timecode overlay */}
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 3px rgba(0,0,0,0.8)',
        }}>
          {formatTC(playheadTime)}
        </div>

        {/* Resize/fullscreen controls — top right */}
        <div className="composer-controls-overlay">
          <button className="composer-ctrl-btn" title="Toggle Fullscreen" onClick={handleFullscreen}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Blue scrub/progress bar — clickable */}
      <div className="composer-scrubbar" ref={scrubRef} onMouseDown={handleScrubDrag}>
        {/* In/Out point markers */}
        {inPos !== null && (
          <div className="composer-scrubbar-mark in" style={{ left: `${inPos}%` }} title={`In: ${formatTC(inPoint!)}`} />
        )}
        {outPos !== null && (
          <div className="composer-scrubbar-mark out" style={{ left: `${outPos}%` }} title={`Out: ${formatTC(outPoint!)}`} />
        )}
        {/* In/Out highlighted range */}
        {inPos !== null && outPos !== null && (
          <div className="composer-scrubbar-range" style={{ left: `${inPos}%`, width: `${outPos - inPos}%` }} />
        )}
        <div className="composer-scrubbar-fill" style={{ width: `${progress}%` }} />
        <div className="composer-scrubbar-head" style={{ left: `${progress}%` }} />
      </div>

      {/* Simple transport — just play button like Figma */}
      <div className="composer-transport">
        <button
          className="composer-play-btn"
          onClick={togglePlay}
          title="Play/Pause (Space)"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>
      </div>

      {/* Status bar — Figma: "Selected: X  Duration: Y  Viewing: Z" */}
      <div className="composer-status-bar">
        <span>Selected: {selectedClipIds.length}</span>
        <span>Duration: {formatTC(duration)}</span>
        <span>Viewing: {totalClips > 0 ? '1.2:1' : '--'}</span>
      </div>
    </div>
  );
}
