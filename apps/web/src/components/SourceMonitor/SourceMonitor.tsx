import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayerStore, ScopeType } from '../../store/player.store';
import { useEditorStore } from '../../store/editor.store';
import { useUserSettingsStore } from '../../store/userSettings.store';
import {
  attachMonitorAudioOutput,
  previewMonitorAudioOutput,
  releaseMonitorAudioOutput,
  reviewMonitorAudioOutput,
} from '../../lib/monitorPlayback';
import { usePointerScrub } from '../../hooks/usePointerScrub';
import { useTrimMonitorPreview } from '../../lib/trimMonitorPreview';
import { trimEngine } from '../../engine/TrimEngine';
import { resolveTrimAudioPreviewRoute } from '../../lib/trimAudioPreview';

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

function formatTrimFrames(value: number): string {
  if (value === 0) {
    return '0f';
  }

  return `${value > 0 ? '+' : ''}${value}f`;
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
    showSafeZones,
    activeScope,
    sourceClipId,
    play,
    pause,
    toggleSafeZones,
    setActiveScope,
    setActiveMonitor,
    activeMonitor,
  } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 270 });
  const [videoReady, setVideoReady] = useState(false);
  const rafRef = useRef<number>();
  const syncRafRef = useRef<number>();
  const cachedFrameRef = useRef<HTMLCanvasElement | null>(null);
  const renderStateRef = useRef({
    assetName: '',
    fps: 24,
    sourceInPoint: null as number | null,
    sourceOutPoint: null as number | null,
    sourcePlayhead: 0,
  });

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
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimASideFrames = useEditorStore((s) => s.trimASideFrames);
  const trimLoopPlaybackActive = useEditorStore((s) => s.trimLoopPlaybackActive);
  const trimLoopPlaybackDirection = useEditorStore((s) => s.trimLoopPlaybackDirection);
  const trimLoopPlaybackRate = useEditorStore((s) => s.trimLoopPlaybackRate);
  const showTrimCountersInMonitorHeaders = useUserSettingsStore((s) => s.settings.showTrimCountersInMonitorHeaders);
  const trimLoopOffsetFrames = useEditorStore((s) => s.trimLoopOffsetFrames);
  const toggleTrimLoopPlayback = useEditorStore((s) => s.toggleTrimLoopPlayback);
  const tracks = useEditorStore((s) => s.tracks);
  const bins = useEditorStore((s) => s.bins);
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const enabledTrackIds = useEditorStore((s) => s.enabledTrackIds);
  const videoMonitorTrackId = useEditorStore((s) => s.videoMonitorTrackId);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);
  const projectFrameRate = useEditorStore((s) => s.projectSettings.frameRate);
  const audioScrubEnabled = useEditorStore((s) => s.audioScrubEnabled);
  const trimPreview = useTrimMonitorPreview({
    tracks,
    bins,
    selectedTrackId,
    enabledTrackIds,
    videoMonitorTrackId,
    sequenceSettings: { fps },
    projectSettings: { frameRate: projectFrameRate },
    trimLoopPlaybackActive,
    trimLoopOffsetFrames,
  });
  const trimPreviewSide = useMemo(() => {
    return trimPreview.sourceMonitor ?? trimPreview.aSide ?? trimPreview.bSide;
  }, [trimPreview.aSide, trimPreview.bSide, trimPreview.sourceMonitor]);
  const trimAudioRoute = useMemo(() => (
    resolveTrimAudioPreviewRoute(trimPreview, activeMonitor)
  ), [activeMonitor, trimPreview]);
  const trimPreviewActive = Boolean(trimPreview.active && trimPreviewSide);
  const trimSessionActive = trimActive || trimPreview.active;
  const activeTrimMode = trimPreview.active ? trimEngine.getCurrentMode().toLowerCase() : trimMode;
  const displayedAsset = trimPreviewActive
    ? trimPreviewSide!.asset ?? null
    : sourceAsset;
  const displayedPlayhead = trimPreviewActive
    ? trimPreviewSide!.sourceTime
    : sourcePlayhead;
  const displayedInPoint = trimPreviewActive ? null : sourceInPoint;
  const displayedOutPoint = trimPreviewActive ? null : sourceOutPoint;
  const displayedDuration = trimPreviewActive
    ? (displayedAsset?.duration ?? 0)
    : (sourceAsset?.duration ?? 0);
  const effectiveIsPlaying = trimSessionActive ? false : isPlaying;
  const sourceTrimSideActive = trimSessionActive
    && (trimSelectionLabel === 'A' || trimSelectionLabel === 'AB' || trimSelectionLabel === 'ASYM');
  const trimSupportsSideSelection = activeTrimMode !== 'slip' && activeTrimMode !== 'slide';
  const trimLoopStatusLabel = trimLoopPlaybackActive
    ? `${trimLoopPlaybackDirection < 0 ? 'REV' : 'FWD'} ${trimLoopPlaybackRate}x`
    : null;

  useEffect(() => {
    renderStateRef.current = {
      assetName: trimPreviewActive && trimPreviewSide
        ? `${trimPreviewSide.trackName} · ${trimPreviewSide.clipName}`
        : displayedAsset?.name ?? '',
      fps,
      sourceInPoint: displayedInPoint,
      sourceOutPoint: displayedOutPoint,
      sourcePlayhead: displayedPlayhead,
    };
  }, [
    displayedAsset?.name,
    displayedInPoint,
    displayedOutPoint,
    displayedPlayhead,
    fps,
    trimPreviewActive,
    trimPreviewSide,
  ]);

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
    cachedFrameRef.current = null;

    if (!displayedAsset || !(displayedAsset.fileHandle || displayedAsset.playbackUrl)) {
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

    const ownedUrl = displayedAsset.fileHandle
      ? URL.createObjectURL(displayedAsset.fileHandle)
      : undefined;
    video.src = ownedUrl ?? displayedAsset.playbackUrl!;

    const handleLoadedMetadata = () => {
      videoRef.current = video;
      attachMonitorAudioOutput('source-monitor', video);
      if (Number.isFinite(displayedPlayhead) && displayedPlayhead > 0) {
        video.currentTime = displayedPlayhead;
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
  }, [displayedAsset?.fileHandle, displayedAsset?.id, displayedAsset?.playbackUrl, displayedPlayhead]);

  // Render loop — draw video frame or placeholder
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { w, h } = canvasSize;
      if (canvas.width !== w) {
        canvas.width = w;
      }
      if (canvas.height !== h) {
        canvas.height = h;
      }

      const video = videoRef.current;
      const renderState = renderStateRef.current;
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
        const cachedFrame = cachedFrameRef.current ?? document.createElement('canvas');
        cachedFrame.width = w;
        cachedFrame.height = h;
        const cachedCtx = cachedFrame.getContext('2d');
        if (cachedCtx) {
          cachedCtx.fillStyle = '#000';
          cachedCtx.fillRect(0, 0, w, h);
          cachedCtx.drawImage(video, drawX, drawY, drawW, drawH);
          cachedFrameRef.current = cachedFrame;
        }

        // Draw in/out markers
        drawMarkers(
          ctx,
          w,
          h,
          renderState.sourceInPoint,
          renderState.sourceOutPoint,
          renderState.fps,
        );
      } else if (cachedFrameRef.current) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(cachedFrameRef.current, 0, 0, w, h);
        drawMarkers(
          ctx,
          w,
          h,
          renderState.sourceInPoint,
          renderState.sourceOutPoint,
          renderState.fps,
        );
      } else {
        drawPlaceholder(ctx, w, h, renderState.assetName, renderState.sourcePlayhead, renderState.sourceInPoint, renderState.sourceOutPoint, renderState.fps);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize, videoReady]);

  // Sync video seek with source playhead (when not playing)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    const frameTolerance = fps > 0 ? 0.5 / fps : 0.02;
    if (!effectiveIsPlaying && isFinite(displayedPlayhead) && Math.abs(video.currentTime - displayedPlayhead) > frameTolerance) {
      video.currentTime = Math.max(0, displayedPlayhead);
    }
  }, [displayedPlayhead, effectiveIsPlaying, fps, videoReady]);

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

    if (effectiveIsPlaying) {
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
  }, [effectiveIsPlaying, speed, videoReady, fps, setSourcePlayhead]);

  useEffect(() => {
    return () => {
      releaseMonitorAudioOutput('source-monitor');
    };
  }, []);

  useEffect(() => {
    if (!trimSessionActive) {
      return;
    }

    const video = videoRef.current;
    const audioPreview = trimAudioRoute.channel === 'source'
      ? trimAudioRoute.side
      : null;

    if (!video || !audioPreview?.playable) {
      releaseMonitorAudioOutput('source-monitor');
      return;
    }

    reviewMonitorAudioOutput(
      'source-monitor',
      video,
      audioPreview.sourceTime,
      {
        active: trimLoopPlaybackActive,
        direction: trimLoopPlaybackDirection,
        rate: trimLoopPlaybackRate,
        fps,
      },
    );
  }, [
    fps,
    trimAudioRoute,
    trimLoopPlaybackActive,
    trimLoopPlaybackDirection,
    trimLoopPlaybackRate,
    trimSessionActive,
    videoReady,
  ]);

  function drawMarkers(
    c: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    activeInPoint: number | null,
    activeOutPoint: number | null,
    activeFps: number,
  ) {
    if (activeInPoint !== null) {
      c.fillStyle = 'rgba(59, 130, 246, 0.8)';
      c.font = '600 10px monospace';
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillText('IN: ' + formatTimecode(activeInPoint, activeFps), 10, ch - 10);
    }
    if (activeOutPoint !== null) {
      c.fillStyle = 'rgba(59, 130, 246, 0.8)';
      c.font = '600 10px monospace';
      c.textAlign = 'right';
      c.textBaseline = 'alphabetic';
      c.fillText('OUT: ' + formatTimecode(activeOutPoint, activeFps), cw - 10, ch - 10);
    }
  }

  function drawPlaceholder(
    c: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    assetName: string,
    activePlayhead: number,
    activeInPoint: number | null,
    activeOutPoint: number | null,
    activeFps: number,
  ) {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, cw, ch);
    c.fillStyle = 'rgba(255, 255, 255, 0.12)';
    c.font = '700 28px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SOURCE', cw / 2, ch / 2 - 14);
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.font = '500 13px monospace';
    c.fillText(formatTimecode(activePlayhead, activeFps), cw / 2, ch / 2 + 16);
    if (assetName) {
      c.fillStyle = 'rgba(255, 255, 255, 0.4)';
      c.font = '400 11px system-ui';
      c.fillText(assetName, cw / 2, ch / 2 + 36);
    }
    drawMarkers(c, cw, ch, activeInPoint, activeOutPoint, activeFps);
  }

  // Transport handlers
  const nudgeTrim = useCallback((frames: number): boolean => {
    if (!trimSessionActive) {
      return false;
    }

    trimEngine.trimByFrames(frames, fps);
    return true;
  }, [fps, trimSessionActive]);

  const handlePlayPause = useCallback(() => {
    if (trimSessionActive) {
      toggleTrimLoopPlayback();
      return;
    }

    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play, toggleTrimLoopPlayback, trimSessionActive]);

  const handleGoToIn = useCallback(() => {
    if (sourceInPoint !== null) setSourcePlayhead(sourceInPoint);
  }, [sourceInPoint, setSourcePlayhead]);

  const handleGoToOut = useCallback(() => {
    if (sourceOutPoint !== null) setSourcePlayhead(sourceOutPoint);
  }, [sourceOutPoint, setSourcePlayhead]);

  const handlePrevFrame = useCallback(() => {
    if (nudgeTrim(-1)) {
      return;
    }
    setSourcePlayhead(Math.max(0, sourcePlayhead - 1 / fps));
  }, [nudgeTrim, sourcePlayhead, fps, setSourcePlayhead]);

  const handleNextFrame = useCallback(() => {
    if (nudgeTrim(1)) {
      return;
    }
    const maxDur = sourceAsset?.duration ?? 999;
    setSourcePlayhead(Math.min(maxDur, sourcePlayhead + 1 / fps));
  }, [nudgeTrim, sourcePlayhead, fps, sourceAsset?.duration, setSourcePlayhead]);

  const handleRewind = useCallback(() => {
    if (nudgeTrim(-10)) {
      return;
    }
    setSourcePlayhead(Math.max(0, sourcePlayhead - 1));
  }, [nudgeTrim, sourcePlayhead, setSourcePlayhead]);

  const handleFastForward = useCallback(() => {
    if (nudgeTrim(10)) {
      return;
    }
    const maxDur = sourceAsset?.duration ?? 999;
    setSourcePlayhead(Math.min(maxDur, sourcePlayhead + 1));
  }, [nudgeTrim, sourcePlayhead, sourceAsset?.duration, setSourcePlayhead]);

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

  const handleSelectTrimASide = useCallback(() => {
    setActiveMonitor('source');
    if (trimSessionActive && trimSupportsSideSelection) {
      trimEngine.selectASide();
    }
  }, [setActiveMonitor, trimSessionActive, trimSupportsSideSelection]);

  const handleSelectTrimBSide = useCallback(() => {
    if (trimSessionActive && trimSupportsSideSelection) {
      trimEngine.selectBSide();
    }
  }, [trimSessionActive, trimSupportsSideSelection]);

  const handleSelectTrimBothSides = useCallback(() => {
    if (trimSessionActive && trimSupportsSideSelection) {
      trimEngine.selectBothSides();
    }
  }, [trimSessionActive, trimSupportsSideSelection]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setActiveMonitor('source');
    if (!trimSessionActive) {
      return;
    }

    if ((event.target as HTMLElement).closest('.trim-status-overlay')) {
      return;
    }

    if (trimSupportsSideSelection) {
      trimEngine.selectASide();
    }
  }, [setActiveMonitor, trimSessionActive, trimSupportsSideSelection]);

  // Keyboard shortcuts are now handled centrally by useGlobalKeyboard() in EditorPage.
  // I/O marks are routed there based on activeMonitor, along with JKL shuttle.

  // Scrub bar interaction
  const scrubRef = useRef<HTMLDivElement>(null);
  const scrubToTime = useCallback((clientX: number, previewAudio: boolean) => {
    const bar = scrubRef.current;
    if (!bar || !displayedDuration || trimSessionActive) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = pct * displayedDuration;
    setActiveMonitor('source');
    setSourcePlayhead(nextTime);

    const video = videoRef.current;
    const frameTolerance = fps > 0 ? 0.5 / fps : 0.02;
    if (!isPlaying && video && Math.abs(video.currentTime - nextTime) > frameTolerance) {
      video.currentTime = nextTime;
    }

    if (!previewAudio || isPlaying || !video) {
      return;
    }

    previewMonitorAudioOutput('source-monitor', video, nextTime);
  }, [displayedDuration, fps, isPlaying, setActiveMonitor, setSourcePlayhead, trimSessionActive]);

  const scrubBindings = usePointerScrub({
    disabled: trimSessionActive || !displayedDuration,
    onScrub: ({ clientX, phase }) => {
      scrubToTime(clientX, audioScrubEnabled && phase === 'end');
    },
  });

  const tc = formatTimecode(displayedPlayhead, fps);
  const dur = displayedDuration;
  const progress = dur > 0 ? (displayedPlayhead / dur) * 100 : 0;
  const inPct = displayedInPoint !== null && dur > 0 ? (displayedInPoint / dur) * 100 : null;
  const outPct = displayedOutPoint !== null && dur > 0 ? (displayedOutPoint / dur) * 100 : null;

  const isActive = activeMonitor === 'source';
  const sourceLabel = trimPreviewActive ? trimPreviewSide!.monitorLabel : 'SOURCE';
  const sourceMeta = trimPreviewActive && trimPreviewSide
    ? `${trimPreviewSide.trackName} · ${trimPreviewSide.clipName}`
    : displayedAsset?.name ?? null;

  return (
    <div className={`monitor${isActive ? ' monitor-active' : ''}`} onClick={handleFocus} role="region" aria-label="Source Monitor">
      {/* Header */}
      <div className="monitor-header">
        <button
          type="button"
          className={`monitor-label monitor-label-button source${trimSessionActive ? ' trim-side trim-side-a' : ''}${sourceTrimSideActive ? ' trim-side-live' : ''}${trimSessionActive && !trimSupportsSideSelection ? ' monitor-label-static' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            handleSelectTrimASide();
          }}
          aria-label={trimSessionActive && trimSupportsSideSelection ? 'Select A-side trim monitor' : 'Source monitor'}
        >
          {sourceLabel}
        </button>
        {sourceMeta && (
          <span className="monitor-meta" title={sourceMeta}>
            {sourceMeta}
          </span>
        )}
        {trimSessionActive && showTrimCountersInMonitorHeaders && (
          <>
            <span className={`monitor-trim-indicator${sourceTrimSideActive ? ' active' : ''}`}>
              A {formatTrimFrames(trimASideFrames)}
            </span>
            {trimLoopPlaybackActive && (
              <span className="monitor-trim-indicator monitor-trim-indicator-loop">
                {trimLoopStatusLabel}
              </span>
            )}
          </>
        )}
      </div>

      {/* Canvas area */}
      <div className="monitor-canvas" ref={containerRef} style={{ flex: 1, minHeight: 0 }} onClick={handleCanvasClick}>
        <canvas
          ref={canvasRef}
          width={canvasSize.w}
          height={canvasSize.h}
          style={{
            width: canvasSize.w,
            height: canvasSize.h,
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'block',
            margin: 'auto',
          }}
        />
        {showSafeZones && (
          <div className="safe-zone">
            <div className="safe-zone-action" />
            <div className="safe-zone-title" />
          </div>
        )}
      </div>

      {/* Scrub bar */}
      {!trimSessionActive && displayedAsset && dur > 0 && (
        <div
          className="composer-scrubbar"
          ref={scrubRef}
          {...scrubBindings}
          aria-label="Source playback position"
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
        <div className="monitor-footer-group" role="group" aria-label="Source mark controls">
          <button
            className={`transport-btn monitor-toolbar-btn is-mark${sourceInPoint !== null ? ' active' : ''}`}
            onClick={handleMarkIn}
            title="Mark In (I)"
            disabled={trimSessionActive}
          >
            IN
          </button>
          <button
            className={`transport-btn monitor-toolbar-btn is-mark${sourceOutPoint !== null ? ' active' : ''}`}
            onClick={handleMarkOut}
            title="Mark Out (O)"
            disabled={trimSessionActive}
          >
            OUT
          </button>
        </div>

        <div className="monitor-footer-group transport-controls" role="group" aria-label="Source transport controls">
          <button className="transport-btn monitor-toolbar-btn" onClick={handleGoToIn} title="Go to In (Shift+I)" aria-label="Go to In point" disabled={trimSessionActive}>
            |&laquo;
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleRewind} title={trimPreviewActive ? 'Trim Left 10 Frames' : 'Rewind (J)'}>
            &laquo;
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handlePrevFrame} title={trimPreviewActive ? 'Trim Left 1 Frame' : 'Prev Frame (Left)'}>
            &lsaquo;
          </button>
          <button
            className={`transport-btn play-btn monitor-toolbar-btn${trimLoopPlaybackActive ? ' active' : ''}`}
            onClick={handlePlayPause}
            title={trimSessionActive
              ? (trimLoopPlaybackActive ? `Stop transition play loop (${trimLoopStatusLabel})` : 'Play transition loop')
              : 'Play/Pause (Space)'}
          >
            {trimSessionActive ? (trimLoopPlaybackActive ? '\u23F9' : '\u25B6') : (isPlaying ? '\u23F8' : '\u25B6')}
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleNextFrame} title={trimPreviewActive ? 'Trim Right 1 Frame' : 'Next Frame'}>&rsaquo;</button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleFastForward} title={trimPreviewActive ? 'Trim Right 10 Frames' : 'Fast Forward (L)'}>&raquo;</button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleGoToOut} title="Go to Out" aria-label="Go to Out point" disabled={trimSessionActive}>&raquo;|</button>
        </div>

        <div className="monitor-footer-spacer" />

        {trimSessionActive ? (
          <div className="monitor-footer-group monitor-footer-group-trim" role="group" aria-label="Source trim selection">
            {trimSupportsSideSelection && (
              <>
                <button
                  type="button"
                  className={`transport-btn monitor-toolbar-btn trim-side-btn${trimSelectionLabel === 'A' ? ' active' : ''}`}
                  onClick={handleSelectTrimASide}
                  aria-label="Select A-side trim"
                >
                  A
                </button>
                <button
                  type="button"
                  className={`transport-btn monitor-toolbar-btn trim-side-btn${trimSelectionLabel === 'AB' ? ' active' : ''}`}
                  onClick={handleSelectTrimBothSides}
                  aria-label="Select both trim sides"
                >
                  AB
                </button>
                <button
                  type="button"
                  className={`transport-btn monitor-toolbar-btn trim-side-btn${trimSelectionLabel === 'B' ? ' active' : ''}`}
                  onClick={handleSelectTrimBSide}
                  aria-label="Select B-side trim"
                >
                  B
                </button>
              </>
            )}
            {trimPreviewSide && (
              <span className="monitor-toolbar-pill" aria-live="polite">
                {trimPreviewSide.monitorContext}{trimLoopStatusLabel ? ` · ${trimLoopStatusLabel}` : ''}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="monitor-footer-group">
              <button
                className={`transport-btn monitor-toolbar-btn${showSafeZones ? ' active' : ''}`}
                onClick={toggleSafeZones}
                title="Toggle Safe Zones"
                style={{ fontSize: 9 }}
              >
                SAFE
              </button>
            </div>

            <div className="monitor-footer-group">
              <select
                value={activeScope ?? ''}
                onChange={handleScopeChange}
                title="Video Scope"
                disabled={trimPreviewActive}
                className="monitor-scope-select"
              >
                <option value="">No Scope</option>
                {SCOPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="monitor-footer-group">
          <div className="timecode-display monitor-footer-timecode" role="status" aria-live="polite" aria-label="Current timecode">
            {tc}
          </div>
        </div>
      </div>
    </div>
  );
}
