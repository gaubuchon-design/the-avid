import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import { usePlayerStore, ScopeType } from '../../store/player.store';
import { useEditorStore } from '../../store/editor.store';
import {
  attachMonitorAudioOutput,
  previewMonitorAudioOutput,
  releaseMonitorAudioOutput,
} from '../../lib/monitorPlayback';

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

    if (!sourceAsset || !(sourceAsset.fileHandle || sourceAsset.playbackUrl)) {
      releaseMonitorAudioOutput('source-monitor');
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
      videoRef.current = null;
      return;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = true;

    const ownedUrl = sourceAsset.fileHandle
      ? URL.createObjectURL(sourceAsset.fileHandle)
      : undefined;
    video.src = ownedUrl ?? sourceAsset.playbackUrl!;

    const handleLoadedMetadata = () => {
      videoRef.current = video;
      attachMonitorAudioOutput('source-monitor', video);
      const currentSourcePlayhead = useEditorStore.getState().sourcePlayhead;
      if (Number.isFinite(currentSourcePlayhead) && currentSourcePlayhead > 0) {
        video.currentTime = currentSourcePlayhead;
      }
      setVideoReady(true);
    };

    const handleError = () => {
      setVideoReady(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.load();

    return () => {
      releaseMonitorAudioOutput('source-monitor');
      video.pause();
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
      video.src = '';
      if (ownedUrl) {
        URL.revokeObjectURL(ownedUrl);
      }
      if (videoRef.current === video) {
        videoRef.current = null;
      }
    };
  }, [sourceAsset?.id, sourceAsset?.fileHandle, sourceAsset?.playbackUrl]);

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

  useEffect(() => {
    return () => {
      releaseMonitorAudioOutput('source-monitor');
    };
  }, []);

  function drawMarkers(c: CanvasRenderingContext2D, cw: number, ch: number) {
    if (sourceInPoint !== null) {
      c.fillStyle = 'rgba(59, 130, 246, 0.8)';
      c.font = '600 10px monospace';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText('IN: ' + formatTimecode(sourceInPoint, fps), 10, ch - 10);
    }
    if (sourceOutPoint !== null) {
      c.fillStyle = 'rgba(59, 130, 246, 0.8)';
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
  const dragListenersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null);
  const scrubToTime = useCallback((clientX: number, previewAudio: boolean) => {
    const bar = scrubRef.current;
    if (!bar || !sourceAsset?.duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = pct * sourceAsset.duration;
    setSourcePlayhead(nextTime);

    if (!previewAudio || isPlaying || !videoRef.current) {
      return;
    }

    previewMonitorAudioOutput('source-monitor', videoRef.current, nextTime);
  }, [isPlaying, setSourcePlayhead, sourceAsset?.duration]);
  const handleScrub = useCallback((e: React.MouseEvent) => {
    scrubToTime(e.clientX, true);
  }, [scrubToTime]);

  const handleScrubDrag = useCallback((e: React.MouseEvent) => {
    handleScrub(e);
    const bar = scrubRef.current;
    if (!bar || !sourceAsset?.duration) return;
    const onMove = (ev: MouseEvent) => {
      scrubToTime(ev.clientX, true);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragListenersRef.current = null;
    };
    dragListenersRef.current = { onMove, onUp };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [handleScrub, scrubToTime, sourceAsset?.duration]);

  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        window.removeEventListener('mousemove', dragListenersRef.current.onMove);
        window.removeEventListener('mouseup', dragListenersRef.current.onUp);
        dragListenersRef.current = null;
      }
    };
  }, []);

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
      </div>

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

      {/* Footer / Transport */}
      <div className="monitor-footer">
        {/* Mark In */}
        <button
          className="transport-btn"
          onClick={handleMarkIn}
          title="Mark In (I)"
          style={{ fontSize: 10, fontWeight: 600, color: sourceInPoint !== null ? 'var(--info)' : undefined }}
        >
          I
        </button>

        {/* Transport controls */}
        <div className="transport-controls" role="group" aria-label="Source transport controls">
          <button className="transport-btn" onClick={handleGoToIn} title="Go to In (Shift+I)" aria-label="Go to In point">
            |&laquo;
          </button>
          <button className="transport-btn" onClick={handleRewind} title="Rewind (J)">
            &laquo;
          </button>
          <button className="transport-btn" onClick={handlePrevFrame} title="Prev Frame (Left)">
            &lsaquo;
          </button>
          <button
            className="transport-btn play-btn"
            onClick={handlePlayPause}
            title="Play/Pause (Space)"
          >
            {isPlaying ? '\u23F8' : '\u25B6'}
          </button>
          <button className="transport-btn" onClick={handleNextFrame} title="Next Frame">&rsaquo;</button>
          <button className="transport-btn" onClick={handleFastForward} title="Fast Forward (L)">&raquo;</button>
          <button className="transport-btn" onClick={handleGoToOut} title="Go to Out">&raquo;|</button>
        </div>

        {/* Mark Out */}
        <button
          className="transport-btn"
          onClick={handleMarkOut}
          title="Mark Out (O)"
          style={{ fontSize: 10, fontWeight: 600, color: sourceOutPoint !== null ? 'var(--info)' : undefined }}
        >
          O
        </button>

        <div style={{ flex: 1 }} />

        {/* Safe zones toggle */}
        <button
          className={`transport-btn${showSafeZones ? ' active' : ''}`}
          onClick={toggleSafeZones}
          title="Toggle Safe Zones"
          style={{ fontSize: 9 }}
        >
          [&nbsp;]
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
            borderRadius: 'var(--radius-sm)',
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
