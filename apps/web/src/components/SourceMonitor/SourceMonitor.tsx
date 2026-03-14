import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { usePlayerStore, ScopeType } from '../../store/player.store';
import { useEditorStore } from '../../store/editor.store';
import { videoSourceManager } from '../../engine/VideoSourceManager';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimecode(seconds: number, fps = 24): string {
  const totalFrames = Math.round(seconds * fps);
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

const SCOPE_OPTIONS: { value: ScopeType; label: string }[] = [
  { value: 'waveform', label: 'Waveform' },
  { value: 'vectorscope', label: 'Vectorscope' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'parade', label: 'Parade' },
];

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

function IconSpliceIn() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polygon points="8 2 14 2 14 6" fill={AVID_YELLOW} />
      <rect x="5" y="6" width="6" height="8" rx="0.5" fill={AVID_YELLOW} />
      <line x1="8" y1="1" x2="8" y2="6" stroke={AVID_YELLOW} strokeWidth="1.5" />
    </svg>
  );
}

function IconOverwrite() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <polygon points="8 2 14 2 14 6" fill={AVID_RED} />
      <rect x="5" y="6" width="6" height="8" rx="0.5" fill={AVID_RED} />
      <line x1="8" y1="1" x2="8" y2="6" stroke={AVID_RED} strokeWidth="1.5" />
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

export function SourceMonitor() {
  const {
    isPlaying,
    speed,
    currentFrame,
    showSafeZones,
    activeScope,
    sourceClipId,
    play,
    pause,
    stop,
    seekFrame,
    toggleSafeZones,
    setActiveScope,
    setActiveMonitor,
  } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 270 });
  const [videoReady, setVideoReady] = useState(false);
  const rafRef = useRef<number>();
  const syncRafRef = useRef<number>();

  // Get the source asset from editor store (master's approach with sourceAsset + sourcePlayhead)
  // Also support looking up by sourceClipId through bins (our hardened approach)
  const sourceAsset = useEditorStore((s) => {
    if (!sourceClipId) return s.sourceAsset;
    // Search bins for the asset
    const findInBins = (bins: typeof s.bins): typeof s.sourceAsset => {
      for (const bin of bins) {
        const found = bin.assets.find((a) => a.id === sourceClipId);
        if (found) return found;
        const childResult = findInBins(bin.children);
        if (childResult) return childResult;
      }
      return null;
    };
    return findInBins(s.bins) ?? s.sourceAsset;
  });
  const sourcePlayhead = useEditorStore((s) => s.sourcePlayhead);
  const setSourcePlayhead = useEditorStore((s) => s.setSourcePlayhead);
  const sourceInPoint = useEditorStore((s) => s.sourceInPoint);
  const sourceOutPoint = useEditorStore((s) => s.sourceOutPoint);
  const setSourceInPoint = useEditorStore((s) => s.setSourceInPoint);
  const setSourceOutPoint = useEditorStore((s) => s.setSourceOutPoint);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);

  // Edit operations from store
  const insertEdit = useEditorStore((s) => s.insertEdit);
  const overwriteEdit = useEditorStore((s) => s.overwriteEdit);

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

  // Load/update video element when source asset changes
  useEffect(() => {
    setVideoReady(false);

    if (!sourceAsset) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
      videoRef.current = null;
      return;
    }

    // Get the video source from VideoSourceManager (already loaded by setSourceAsset)
    const source = videoSourceManager.getSource(sourceAsset.id);
    if (source?.ready) {
      videoRef.current = source.element;
      setVideoReady(true);
      return;
    }

    // If not loaded yet, wait for it via subscription
    const unsub = videoSourceManager.subscribe(() => {
      const s = videoSourceManager.getSource(sourceAsset.id);
      if (s?.ready) {
        videoRef.current = s.element;
        setVideoReady(true);
      }
    });

    return unsub;
  }, [sourceAsset?.id]);

  // Render loop — draw video frame or placeholder
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = canvasSize;
      canvas.width = w;
      canvas.height = h;

      const video = videoRef.current;
      if (video && videoReady && video.readyState >= 2) {
        // Draw video frame
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        const videoAR = video.videoWidth / video.videoHeight;
        const canvasAR = w / h;
        let drawW = w, drawH = h, drawX = 0, drawY = 0;
        if (videoAR > canvasAR) {
          drawH = Math.floor(w / videoAR);
          drawY = Math.floor((h - drawH) / 2);
        } else if (videoAR < canvasAR) {
          drawW = Math.floor(h * videoAR);
          drawX = Math.floor((w - drawW) / 2);
        }
        ctx.drawImage(video, drawX, drawY, drawW, drawH);

        // Draw in/out markers
        drawMarkers(ctx, w, h);
      } else {
        drawPlaceholder(ctx, w, h);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize, videoReady, sourceInPoint, sourceOutPoint, sourcePlayhead]);

  // Sync video seek with source playhead (when not playing)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    if (!isPlaying && isFinite(sourcePlayhead) && Math.abs(video.currentTime - sourcePlayhead) > 0.05) {
      video.currentTime = Math.max(0, sourcePlayhead);
    }
  }, [sourcePlayhead, isPlaying, videoReady]);

  // Play/pause — properly cancel previous RAF sync loop before creating new one.
  // Also applies playback rate from playerStore.speed for JKL shuttle support.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;

    // Always cancel any existing sync loop first
    if (syncRafRef.current) {
      cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = undefined;
    }

    if (isPlaying) {
      // Apply playback rate — clamp to browser-supported range.
      // Negative speeds aren't natively supported by HTMLVideoElement,
      // so we handle reverse by manual frame stepping.
      const absSpeed = Math.abs(speed);
      const isReverse = speed < 0;

      if (isReverse) {
        // Reverse playback: manually step backward each frame
        video.pause();
        const stepBack = () => {
          if (!videoRef.current) { syncRafRef.current = undefined; return; }
          const step = absSpeed / fps;
          const newTime = Math.max(0, videoRef.current.currentTime - step);
          videoRef.current.currentTime = newTime;
          setSourcePlayhead(newTime);
          if (newTime <= 0) {
            usePlayerStore.getState().pause();
            syncRafRef.current = undefined;
            return;
          }
          syncRafRef.current = requestAnimationFrame(stepBack);
        };
        syncRafRef.current = requestAnimationFrame(stepBack);
      } else {
        // Forward playback: use native video.play() with playbackRate
        video.playbackRate = Math.max(0.0625, Math.min(16, absSpeed));
        video.play().catch(() => {});
        const sync = () => {
          if (!videoRef.current || videoRef.current.paused) {
            syncRafRef.current = undefined;
            return;
          }
          setSourcePlayhead(videoRef.current.currentTime);
          syncRafRef.current = requestAnimationFrame(sync);
        };
        syncRafRef.current = requestAnimationFrame(sync);
      }
    } else {
      video.pause();
    }

    return () => {
      if (syncRafRef.current) {
        cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = undefined;
      }
    };
  }, [isPlaying, speed, videoReady, fps, setSourcePlayhead]);

  function drawMarkers(c: CanvasRenderingContext2D, cw: number, ch: number) {
    if (sourceInPoint !== null) {
      c.fillStyle = AVID_RED;
      c.font = '600 10px monospace';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText('IN: ' + formatTimecode(sourceInPoint, fps), 10, ch - 10);
    }
    if (sourceOutPoint !== null) {
      c.fillStyle = AVID_RED;
      c.font = '600 10px monospace';
      c.textAlign = 'right';
      c.textBaseline = 'alphabetic';
      c.fillText('OUT: ' + formatTimecode(sourceOutPoint, fps), cw - 10, ch - 10);
    }
  }

  function drawPlaceholder(c: CanvasRenderingContext2D, cw: number, ch: number) {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, cw, ch);
    c.fillStyle = 'rgba(255, 255, 255, 0.12)';
    c.font = '700 28px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SOURCE', cw / 2, ch / 2 - 14);
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.font = '500 13px monospace';
    c.fillText(formatTimecode(sourcePlayhead, fps), cw / 2, ch / 2 + 16);
    if (sourceAsset) {
      c.fillStyle = 'rgba(255, 255, 255, 0.4)';
      c.font = '400 11px system-ui';
      c.fillText(sourceAsset.name, cw / 2, ch / 2 + 36);
    }
    drawMarkers(c, cw, ch);
  }

  // Transport handlers
  const handlePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleGoToIn = useCallback(() => {
    if (sourceInPoint !== null) setSourcePlayhead(sourceInPoint);
  }, [sourceInPoint, setSourcePlayhead]);

  const handleGoToOut = useCallback(() => {
    if (sourceOutPoint !== null) setSourcePlayhead(sourceOutPoint);
  }, [sourceOutPoint, setSourcePlayhead]);

  const handlePrevFrame = useCallback(() => {
    setSourcePlayhead(Math.max(0, sourcePlayhead - 1 / fps));
  }, [sourcePlayhead, fps, setSourcePlayhead]);

  const handleNextFrame = useCallback(() => {
    const maxDur = sourceAsset?.duration ?? 999;
    setSourcePlayhead(Math.min(maxDur, sourcePlayhead + 1 / fps));
  }, [sourcePlayhead, fps, sourceAsset?.duration, setSourcePlayhead]);

  const handleRewind = useCallback(() => {
    setSourcePlayhead(Math.max(0, sourcePlayhead - 1));
  }, [sourcePlayhead, setSourcePlayhead]);

  const handleFastForward = useCallback(() => {
    const maxDur = sourceAsset?.duration ?? 999;
    setSourcePlayhead(Math.min(maxDur, sourcePlayhead + 1));
  }, [sourcePlayhead, sourceAsset?.duration, setSourcePlayhead]);

  const handleMarkIn = useCallback(() => {
    setSourceInPoint(sourcePlayhead);
  }, [sourcePlayhead, setSourceInPoint]);

  const handleMarkOut = useCallback(() => {
    setSourceOutPoint(sourcePlayhead);
  }, [sourcePlayhead, setSourceOutPoint]);

  const handleMatchFrame = useCallback(() => {
    // Match frame from source to record - find where this source clip is used in the timeline
    const state = useEditorStore.getState();
    if (sourceAsset) {
      for (const track of state.tracks) {
        const clip = track.clips.find((c) => c.assetId === sourceAsset.id);
        if (clip) {
          const clipDuration = clip.endTime - clip.startTime;
          const offset = sourcePlayhead - clip.trimStart;
          if (offset >= 0 && offset <= clipDuration) {
            state.setPlayhead(clip.startTime + offset);
            usePlayerStore.getState().setActiveMonitor('record');
            break;
          }
        }
      }
    }
  }, [sourceAsset, sourcePlayhead]);

  const handleSpliceIn = useCallback(() => {
    insertEdit();
  }, [insertEdit]);

  const handleOverwrite = useCallback(() => {
    overwriteEdit();
  }, [overwriteEdit]);

  const handleScopeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      setActiveScope(val === '' ? null : (val as ScopeType));
    },
    [setActiveScope]
  );

  const handleFocus = useCallback(() => {
    setActiveMonitor('source');
  }, [setActiveMonitor]);

  // Keyboard shortcuts are now handled centrally by useGlobalKeyboard() in EditorPage.
  // I/O marks are routed there based on activeMonitor, along with JKL shuttle.

  // Scrub bar interaction
  const scrubRef = useRef<HTMLDivElement>(null);
  const handleScrub = useCallback((e: React.MouseEvent) => {
    const bar = scrubRef.current;
    if (!bar || !sourceAsset?.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setSourcePlayhead(pct * sourceAsset.duration);
  }, [sourceAsset?.duration, setSourcePlayhead]);

  const handleScrubDrag = useCallback((e: React.MouseEvent) => {
    handleScrub(e);
    const bar = scrubRef.current;
    if (!bar || !sourceAsset?.duration) return;
    const dur = sourceAsset.duration;
    const onMove = (ev: MouseEvent) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      setSourcePlayhead(pct * dur);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sourceAsset?.duration, setSourcePlayhead, handleScrub]);

  const tc = formatTimecode(sourcePlayhead, fps);
  const dur = sourceAsset?.duration ?? 0;
  const progress = dur > 0 ? (sourcePlayhead / dur) * 100 : 0;
  const inPct = sourceInPoint !== null && dur > 0 ? (sourceInPoint / dur) * 100 : null;
  const outPct = sourceOutPoint !== null && dur > 0 ? (sourceOutPoint / dur) * 100 : null;

  const isActive = usePlayerStore((s) => s.activeMonitor === 'source');

  return (
    <div className={`monitor${isActive ? ' monitor-active' : ''}`} onClick={handleFocus} role="region" aria-label="Source Monitor">
      {/* Header */}
      <div className="monitor-header">
        <span className="monitor-label source" aria-hidden="true">SOURCE</span>
        {sourceAsset && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sourceAsset.name}
          </span>
        )}
        <span className="monitor-tc">{tc}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {/* Pop Out button */}
          <button
            className="transport-btn"
            onClick={() => {
              const store = useEditorStore.getState();
              if (store.poppedOutMonitor === 'source') {
                store.setPoppedOutMonitor(null);
              } else {
                store.setPoppedOutMonitor('source');
                window.open(
                  window.location.href + '?monitor=source',
                  'source-monitor',
                  'width=960,height=540,menubar=no,toolbar=no,location=no,status=no'
                );
              }
            }}
            title="Pop Out Source Monitor"
            aria-label="Pop out source monitor"
            style={{ fontSize: 10 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
            </svg>
          </button>
          {/* Fullscreen button */}
          <button
            className={`transport-btn${useEditorStore.getState().fullscreenMonitor === 'source' ? ' active' : ''}`}
            onClick={() => {
              const store = useEditorStore.getState();
              store.toggleFullscreenMonitor('source');
              const canvas = canvasRef.current;
              if (canvas && !document.fullscreenElement) {
                canvas.requestFullscreen?.().catch(() => {});
              } else if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
              }
            }}
            title="Fullscreen (Shift+F)"
            aria-label="Toggle fullscreen source monitor"
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
      {useEditorStore.getState().fullscreenMonitor === 'source' && (
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
        {showSafeZones && (
          <div className="safe-zone">
            <div className="safe-zone-action" />
            <div className="safe-zone-title" />
          </div>
        )}
      </div>

      {/* Scrub bar */}
      {sourceAsset && dur > 0 && (
        <div
          className="composer-scrubbar"
          ref={scrubRef}
          onMouseDown={handleScrubDrag}
          style={{ height: 6, margin: '0 4px', cursor: 'pointer' }}
        >
          {inPct !== null && <div className="composer-scrubbar-mark in" style={{ left: `${inPct}%` }} />}
          {outPct !== null && <div className="composer-scrubbar-mark out" style={{ left: `${outPct}%` }} />}
          {inPct !== null && outPct !== null && (
            <div className="composer-scrubbar-range" style={{ left: `${inPct}%`, width: `${outPct - inPct}%` }} />
          )}
          <div className="composer-scrubbar-fill" style={{ width: `${progress}%` }} />
          <div className="composer-scrubbar-head" style={{ left: `${progress}%` }} />
        </div>
      )}

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
          aria-label="Source timecode"
        >
          {tc}
        </div>

        {/* Transport Controls Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 4 }} role="group" aria-label="Source transport controls">
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
              ...(isPlaying ? { background: 'rgba(255,255,255,0.15)' } : {}),
            }}
            onClick={isPlaying ? handleStop : handlePlayPause}
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
              ...(isPlaying && speed > 0 ? { background: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)' } : {}),
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
            color: sourceInPoint !== null ? AVID_RED : 'var(--text-secondary)',
          }}
          onClick={handleMarkIn}
          title="Mark In (I)"
          aria-label="Mark In point"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,57,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconMarkIn color={sourceInPoint !== null ? AVID_RED : 'currentColor'} />
        </button>

        {/* Mark OUT (Red bracket) */}
        <button
          style={{
            ...avidBtnStyle,
            color: sourceOutPoint !== null ? AVID_RED : 'var(--text-secondary)',
          }}
          onClick={handleMarkOut}
          title="Mark Out (O)"
          aria-label="Mark Out point"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,57,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconMarkOut color={sourceOutPoint !== null ? AVID_RED : 'currentColor'} />
        </button>

        {/* Go to IN (Yellow) */}
        <button
          style={{
            ...avidBtnStyle,
            color: AVID_YELLOW,
            opacity: sourceInPoint !== null ? 1 : 0.4,
          }}
          onClick={handleGoToIn}
          title="Go to In (Shift+I)"
          aria-label="Go to In point"
          disabled={sourceInPoint === null}
          onMouseEnter={(e) => { if (sourceInPoint !== null) e.currentTarget.style.background = 'rgba(253,216,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconGoToIn color={AVID_YELLOW} />
        </button>

        {/* Go to OUT (Yellow) */}
        <button
          style={{
            ...avidBtnStyle,
            color: AVID_YELLOW,
            opacity: sourceOutPoint !== null ? 1 : 0.4,
          }}
          onClick={handleGoToOut}
          title="Go to Out (Shift+O)"
          aria-label="Go to Out point"
          disabled={sourceOutPoint === null}
          onMouseEnter={(e) => { if (sourceOutPoint !== null) e.currentTarget.style.background = 'rgba(253,216,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconGoToOut color={AVID_YELLOW} />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 3px', flexShrink: 0 }} role="separator" />

        {/* Match Frame */}
        <button
          style={avidBtnStyle}
          onClick={handleMatchFrame}
          title="Match Frame"
          aria-label="Match Frame"
          {...avidBtnHoverProps}
        >
          <IconMatchFrame />
        </button>

        {/* Splice-In (V) - Yellow */}
        <button
          style={{
            ...avidBtnStyle,
            color: AVID_YELLOW,
          }}
          onClick={handleSpliceIn}
          title="Splice-In (V)"
          aria-label="Splice In edit"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(253,216,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconSpliceIn />
        </button>

        {/* Overwrite (B) - Red */}
        <button
          style={{
            ...avidBtnStyle,
            color: AVID_RED,
          }}
          onClick={handleOverwrite}
          title="Overwrite (B)"
          aria-label="Overwrite edit"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(229,57,53,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <IconOverwrite />
        </button>

        <div style={{ flex: 1 }} />

        {/* Safe zones toggle */}
        <button
          style={{
            ...avidBtnStyle,
            fontSize: 9,
            ...(showSafeZones ? { background: 'rgba(255,255,255,0.15)', color: 'var(--text-primary)' } : {}),
          }}
          onClick={toggleSafeZones}
          title="Toggle Safe Zones"
          aria-label="Toggle safe zones"
          {...avidBtnHoverProps}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
            <rect x="1" y="1" width="14" height="14" rx="1" />
            <rect x="3" y="3" width="10" height="10" rx="0.5" strokeDasharray="2 1" />
          </svg>
        </button>

        {/* Scope selector */}
        <select
          value={activeScope ?? ''}
          onChange={handleScopeChange}
          title="Video Scope"
          style={{
            background: 'var(--bg-void)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 2,
            fontSize: 10,
            padding: '2px 4px',
            outline: 'none',
          }}
        >
          <option value="">No Scope</option>
          {SCOPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
