import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { useTitleStore } from '../../store/title.store';
import {
  compositeRecordFrame,
  findActiveClip,
  getSourceTime,
  syncVideoPlayback,
  pauseVideoSource,
  tryLoadClipSource,
} from '../../engine/compositeRecordFrame';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeToTimecode(sec: number, fps = 24): string {
  const totalFrames = Math.round(sec * fps);
  const h = Math.floor(totalFrames / (fps * 3600));
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % Math.ceil(fps);
  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + ':' +
    String(f).padStart(2, '0')
  );
}

// ─── Avid-style SVG Icons ────────────────────────────────────────────────────

const AVID_RED = '#e53935';
const AVID_YELLOW = '#fdd835';

function IconStepBack() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="3" width="2" height="10" rx="0.5" />
      <polygon points="13 3 6 8 13 13" />
    </svg>
  );
}

function IconPlayReverse() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <polygon points="9 3 2 8 9 13" />
      <polygon points="15 3 8 8 15 13" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

function IconPlayForward() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <polygon points="3 3 11 8 3 13" />
    </svg>
  );
}

function IconStepForward() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <polygon points="3 3 10 8 3 13" />
      <rect x="12" y="3" width="2" height="10" rx="0.5" />
    </svg>
  );
}

function IconMarkIn({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 2H4v12h2v-1H5V3h1V2z" fill={color} />
    </svg>
  );
}

function IconMarkOut({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 2h2v12h-2v-1h1V3h-1V2z" fill={color} />
    </svg>
  );
}

function IconGoToIn({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="2" height="12" rx="0.5" fill={color} />
      <path d="M6 2H5v12h1v-1H5.5V3H6V2z" fill={color} opacity="0.7" />
      <polygon points="7 8 13 4 13 12" fill={color} />
    </svg>
  );
}

function IconGoToOut({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="12" y="2" width="2" height="12" rx="0.5" fill={color} />
      <path d="M10 2h1v12h-1v-1h.5V3H10V2z" fill={color} opacity="0.7" />
      <polygon points="9 8 3 4 3 12" fill={color} />
    </svg>
  );
}

function IconMatchFrame() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="6" height="12" rx="1" opacity="0.6" />
      <rect x="9" y="2" width="6" height="12" rx="1" />
      <line x1="4" y1="8" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconLift() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="8" width="8" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="4" y="2" width="8" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1" />
      <line x1="8" y1="8" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" />
      <polyline points="6 5 8 3 10 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconExtract() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="8" width="5" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="9" y="8" width="5" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
      <line x1="7.5" y1="8" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1" strokeDasharray="1 1" />
      <rect x="4" y="2" width="8" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1" />
      <line x1="8" y1="8" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" />
      <polyline points="6 5 8 3 10 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

// ─── Avid Transport Button Style ─────────────────────────────────────────────

const avidBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 22,
  padding: 0,
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 2,
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'background 0.1s, color 0.1s',
  flexShrink: 0,
};

const avidBtnHoverProps = {
  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
    e.currentTarget.style.color = 'var(--text-primary)';
  },
  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
    e.currentTarget.style.color = '';
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function RecordMonitor() {
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const editorIsPlaying = useEditorStore((s) => s.isPlaying);
  const editorTogglePlay = useEditorStore((s) => s.togglePlay);
  const duration = useEditorStore((s) => s.duration);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const setInPoint = useEditorStore((s) => s.setInPoint);
  const setOutPoint = useEditorStore((s) => s.setOutPoint);
  const liftSelection = useEditorStore((s) => s.liftSelection);
  const extractSelection = useEditorStore((s) => s.extractSelection);

  const { setActiveMonitor } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const lastClipIdRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 270 });

  // Responsive canvas sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: cw, height: ch } = entry.contentRect;
        if (cw <= 0 || ch <= 0) continue;
        const ar = 16 / 9;
        let w: number, h: number;
        if (cw / ch > ar) {
          h = Math.floor(ch);
          w = Math.floor(h * ar);
        } else {
          w = Math.floor(cw);
          h = Math.floor(w / ar);
        }
        setCanvasSize({ w: Math.max(w, 160), h: Math.max(h, 90) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Continuous RAF render loop ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(render); return; }

      const { w, h } = canvasSize;
      canvas.width = w;
      canvas.height = h;

      const state = useEditorStore.getState();
      const titleState = useTitleStore.getState();

      const activeClip = findActiveClip(state.tracks, state.playheadTime);

      if (activeClip?.assetId !== lastClipIdRef.current) {
        if (lastClipIdRef.current) {
          pauseVideoSource(lastClipIdRef.current);
        }
        lastClipIdRef.current = activeClip?.assetId ?? null;
      }

      if (activeClip) {
        syncVideoPlayback(activeClip, state.isPlaying, state.playheadTime, state.sequenceSettings.fps);
      }

      if (activeClip?.assetId) {
        tryLoadClipSource(activeClip.assetId, state.bins as any);
      }

      compositeRecordFrame({
        ctx,
        canvasW: w,
        canvasH: h,
        playheadTime: state.playheadTime,
        tracks: state.tracks,
        fps: state.sequenceSettings.fps,
        aspectRatio: 16 / 9,
        showSafeZones: state.showSafeZones,
        isPlaying: state.isPlaying,
        titleClips: state.titleClips,
        subtitleTracks: state.subtitleTracks,
        currentTitle: titleState.currentTitle,
        isTitleEditing: titleState.isEditing,
      });

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize]);

  // Auto-inspect clip at playhead
  useEffect(() => {
    const state = useEditorStore.getState();
    if (state.selectedClipIds.length === 0) {
      const clip = findActiveClip(state.tracks, playheadTime);
      if (clip) {
        state.setInspectedClip(clip.id);
      }
    }
  }, [playheadTime]);

  // Transport handlers
  const handlePlayPause = useCallback(() => {
    editorTogglePlay();
  }, [editorTogglePlay]);

  const handleStop = useCallback(() => {
    if (editorIsPlaying) editorTogglePlay();
  }, [editorIsPlaying, editorTogglePlay]);

  const handleGoToStart = useCallback(() => {
    useEditorStore.getState().setPlayhead(0);
  }, []);

  const handleGoToEnd = useCallback(() => {
    useEditorStore.getState().setPlayhead(duration);
  }, [duration]);

  const handlePrevFrame = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 1 / fps));
  }, [fps]);

  const handleNextFrame = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 1 / fps);
  }, [fps]);

  const handleRewind = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 2));
  }, []);

  const handleFastForward = useCallback(() => {
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 2);
  }, []);

  const handleMarkIn = useCallback(() => {
    setInPoint(playheadTime);
  }, [playheadTime, setInPoint]);

  const handleMarkOut = useCallback(() => {
    setOutPoint(playheadTime);
  }, [playheadTime, setOutPoint]);

  const handleGoToIn = useCallback(() => {
    if (inPoint !== null) useEditorStore.getState().setPlayhead(inPoint);
  }, [inPoint]);

  const handleGoToOut = useCallback(() => {
    if (outPoint !== null) useEditorStore.getState().setPlayhead(outPoint);
  }, [outPoint]);

  const handleLift = useCallback(() => {
    liftSelection();
  }, [liftSelection]);

  const handleExtract = useCallback(() => {
    extractSelection();
  }, [extractSelection]);

  const handleMatchFrame = useCallback(() => {
    const state = useEditorStore.getState();
    const clip = findActiveClip(state.tracks, state.playheadTime);
    if (clip?.assetId) {
      const sourceTime = getSourceTime(clip, state.playheadTime);
      const bin = state.bins.find((b) => b.assets.some((a) => a.id === clip.assetId));
      const asset = bin?.assets.find((a) => a.id === clip.assetId);
      if (asset) {
        state.setSourceAsset(asset);
        state.setSourcePlayhead(sourceTime);
        state.setInspectedClip(clip.id);
        usePlayerStore.getState().setActiveMonitor('source');
      }
    }
  }, []);

  const handleFocus = useCallback(() => {
    setActiveMonitor('record');
  }, [setActiveMonitor]);

  const tc = timeToTimecode(playheadTime, fps);
  const isActive = usePlayerStore((s) => s.activeMonitor === 'record');

  return (
    <div className={`monitor${isActive ? ' monitor-active' : ''}`} onClick={handleFocus} role="region" aria-label="Record Monitor">
      {/* Header */}
      <div className="monitor-header">
        <span className="monitor-label record" aria-hidden="true">RECORD</span>
        <span className="monitor-tc">{tc}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {/* Pop Out button */}
          <button
            className="transport-btn"
            onClick={() => {
              const store = useEditorStore.getState();
              if (store.poppedOutMonitor === 'record') {
                store.setPoppedOutMonitor(null);
              } else {
                store.setPoppedOutMonitor('record');
                window.open(
                  window.location.href + '?monitor=record',
                  'record-monitor',
                  'width=960,height=540,menubar=no,toolbar=no,location=no,status=no'
                );
              }
            }}
            title="Pop Out Record Monitor"
            aria-label="Pop out record monitor"
            style={{ fontSize: 10 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
            </svg>
          </button>
          {/* Fullscreen button */}
          <button
            className={`transport-btn${useEditorStore.getState().fullscreenMonitor === 'record' ? ' active' : ''}`}
            onClick={() => {
              const store = useEditorStore.getState();
              store.toggleFullscreenMonitor('record');
              const canvas = canvasRef.current;
              if (canvas && !document.fullscreenElement) {
                canvas.requestFullscreen?.().catch(() => {});
              } else if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
              }
            }}
            title="Fullscreen (Shift+F)"
            aria-label="Toggle fullscreen record monitor"
            style={{ fontSize: 10 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Fullscreen indicator */}
      {useEditorStore.getState().fullscreenMonitor === 'record' && (
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 10,
          background: 'var(--brand)', color: '#fff', fontSize: 9, fontWeight: 700,
          padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5,
        }}>FULLSCREEN</div>
      )}

      {/* Canvas area */}
      <div className="monitor-canvas" ref={containerRef} style={{ flex: 1, minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>

      {/* Footer / Avid-style Transport Bar */}
      <div className="monitor-footer" style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px 4px', flexWrap: 'nowrap' }}>
        {/* Timecode Display */}
        <div
          className="avid-tc-display"
          style={{
            fontFamily: 'var(--font-mono, "SF Mono", "Consolas", monospace)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary)',
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 2,
            padding: '2px 6px',
            minWidth: 80,
            textAlign: 'center',
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}
          role="status"
          aria-live="polite"
          aria-label="Record timecode"
        >
          {tc}
        </div>

        {/* Transport Controls Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 4 }} role="group" aria-label="Record transport controls">
          {/* Step Backward */}
          <button
            style={avidBtnStyle}
            onClick={handlePrevFrame}
            title="Step Back (Left Arrow)"
            aria-label="Step back one frame"
            {...avidBtnHoverProps}
          >
            <IconStepBack />
          </button>

          {/* Play Reverse (J) */}
          <button
            style={avidBtnStyle}
            onClick={handleRewind}
            title="Play Reverse (J)"
            aria-label="Play in reverse"
            {...avidBtnHoverProps}
          >
            <IconPlayReverse />
          </button>

          {/* Stop/Pause (K) */}
          <button
            style={{
              ...avidBtnStyle,
              ...(editorIsPlaying ? { background: 'rgba(255,255,255,0.15)' } : {}),
            }}
            onClick={handleStop}
            title="Stop (K)"
            aria-label="Stop playback"
            {...avidBtnHoverProps}
          >
            <IconStop />
          </button>

          {/* Play Forward (L) */}
          <button
            style={{
              ...avidBtnStyle,
              ...(editorIsPlaying ? { background: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)' } : {}),
            }}
            onClick={handlePlayPause}
            title="Play Forward (L)"
            aria-label="Play forward"
            {...avidBtnHoverProps}
          >
            <IconPlayForward />
          </button>

          {/* Step Forward */}
          <button
            style={avidBtnStyle}
            onClick={handleNextFrame}
            title="Step Forward (Right Arrow)"
            aria-label="Step forward one frame"
            {...avidBtnHoverProps}
          >
            <IconStepForward />
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 3px', flexShrink: 0 }} role="separator" />

        {/* Mark IN (Red bracket) */}
        <button
          style={{
            ...avidBtnStyle,
            color: inPoint !== null ? AVID_RED : 'var(--text-secondary)',
          }}
          onClick={handleMarkIn}
          title="Mark In (I)"
          aria-label="Mark In point"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,57,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconMarkIn color={inPoint !== null ? AVID_RED : 'currentColor'} />
        </button>

        {/* Mark OUT (Red bracket) */}
        <button
          style={{
            ...avidBtnStyle,
            color: outPoint !== null ? AVID_RED : 'var(--text-secondary)',
          }}
          onClick={handleMarkOut}
          title="Mark Out (O)"
          aria-label="Mark Out point"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,57,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconMarkOut color={outPoint !== null ? AVID_RED : 'currentColor'} />
        </button>

        {/* Go to IN (Yellow) */}
        <button
          style={{
            ...avidBtnStyle,
            color: AVID_YELLOW,
            opacity: inPoint !== null ? 1 : 0.4,
          }}
          onClick={handleGoToIn}
          title="Go to In (Shift+I)"
          aria-label="Go to In point"
          disabled={inPoint === null}
          onMouseEnter={(e) => { if (inPoint !== null) e.currentTarget.style.background = 'rgba(253,216,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconGoToIn color={AVID_YELLOW} />
        </button>

        {/* Go to OUT (Yellow) */}
        <button
          style={{
            ...avidBtnStyle,
            color: AVID_YELLOW,
            opacity: outPoint !== null ? 1 : 0.4,
          }}
          onClick={handleGoToOut}
          title="Go to Out (Shift+O)"
          aria-label="Go to Out point"
          disabled={outPoint === null}
          onMouseEnter={(e) => { if (outPoint !== null) e.currentTarget.style.background = 'rgba(253,216,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconGoToOut color={AVID_YELLOW} />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 3px', flexShrink: 0 }} role="separator" />

        {/* Lift (Z) */}
        <button
          style={avidBtnStyle}
          onClick={handleLift}
          title="Lift (Z)"
          aria-label="Lift selection"
          {...avidBtnHoverProps}
        >
          <IconLift />
        </button>

        {/* Extract (X) */}
        <button
          style={avidBtnStyle}
          onClick={handleExtract}
          title="Extract (X)"
          aria-label="Extract selection"
          {...avidBtnHoverProps}
        >
          <IconExtract />
        </button>

        {/* Match Frame */}
        <button
          style={avidBtnStyle}
          onClick={handleMatchFrame}
          title="Match Frame (F)"
          aria-label="Match Frame"
          {...avidBtnHoverProps}
        >
          <IconMatchFrame />
        </button>

        <div style={{ flex: 1 }} />

        {/* Duration display */}
        <div
          style={{
            fontFamily: 'var(--font-mono, "SF Mono", "Consolas", monospace)',
            fontSize: 10,
            color: 'var(--text-muted)',
            letterSpacing: '0.3px',
          }}
        >
          DUR {timeToTimecode(duration, fps)}
        </div>
      </div>
    </div>
  );
}
