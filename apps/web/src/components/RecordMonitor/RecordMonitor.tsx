import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { useTitleStore } from '../../store/title.store';
import { TrimStatusOverlay } from '../Editor/TrimStatusOverlay';
import { DesktopAudioPreviewDiagnostics } from '../Diagnostics/DesktopAudioPreviewDiagnostics';
import { PlaybackFallbackDiagnostics } from '../Diagnostics/PlaybackFallbackDiagnostics';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import {
  buildPlaybackSnapshotRenderRevision,
  getCachedPlaybackSnapshotCanvas,
  renderPlaybackSnapshotFrame,
  renderPlaybackSnapshotFrameAsync,
} from '../../engine/playbackSnapshotFrame';
import {
  findActiveClip,
  inspectPlaybackVideoLayerAvailability,
  syncVideoPlayback,
  pauseVideoSource,
  tryLoadClipSource,
} from '../../engine/compositeRecordFrame';
import { matchFrameAtPlayhead } from '../../lib/editorMonitorActions';
import { videoSourceManager } from '../../engine/VideoSourceManager';
import {
  findTimelineMonitorMediaSource,
  previewMonitorAudioOutput,
  releaseMonitorAudioOutput,
  syncMonitorAudioOutput,
} from '../../lib/monitorPlayback';
import { usePointerScrub } from '../../hooks/usePointerScrub';
import { useDesktopParityMonitorPlayback } from '../../hooks/useDesktopParityMonitorPlayback';
import { useMonitorTransportState } from '../../hooks/useMonitorTransportState';
import {
  useTrimMonitorPreview,
  type TrimPreviewSide,
} from '../../lib/trimMonitorPreview';
import { enterTrimModeFromContext } from '../../lib/trimEntry';
import { trimEngine } from '../../engine/TrimEngine';

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

function updateCachedCanvasFrame(
  sourceCanvas: HTMLCanvasElement,
  cacheRef: React.MutableRefObject<HTMLCanvasElement | null>,
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const cachedFrame = cacheRef.current ?? document.createElement('canvas');
  cachedFrame.width = sourceCanvas.width;
  cachedFrame.height = sourceCanvas.height;
  const cachedCtx = cachedFrame.getContext('2d');
  if (!cachedCtx) {
    return;
  }

  cachedCtx.clearRect(0, 0, cachedFrame.width, cachedFrame.height);
  cachedCtx.drawImage(sourceCanvas, 0, 0, cachedFrame.width, cachedFrame.height);
  cacheRef.current = cachedFrame;
}

function drawCanvasFrame(
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
): boolean {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
}

function drawTrimPreviewPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  preview: TrimPreviewSide,
  fps: number,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.font = '700 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(preview.role === 'A' ? 'A-SIDE' : 'B-SIDE', width / 2, height / 2 - 18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.font = '500 13px monospace';
  ctx.fillText(timeToTimecode(preview.sourceTime, fps), width / 2, height / 2 + 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.font = '400 11px system-ui';
  ctx.fillText(`${preview.trackName} · ${preview.clipName}`, width / 2, height / 2 + 32);
}

function renderTrimPreviewFrame(
  canvas: HTMLCanvasElement,
  preview: TrimPreviewSide,
  bins: ReturnType<typeof useEditorStore.getState>['bins'],
  fps: number,
  cacheRef: React.MutableRefObject<HTMLCanvasElement | null>,
): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  if (!preview.assetId || !preview.playable) {
    drawTrimPreviewPlaceholder(ctx, canvas.width, canvas.height, preview, fps);
    updateCachedCanvasFrame(canvas, cacheRef);
    return true;
  }

  tryLoadClipSource(preview.assetId, bins as any);
  const source = videoSourceManager.getSource(preview.assetId);
  const video = source?.element;
  if (!video || !source.ready || video.readyState < 2) {
    return false;
  }

  const frameTolerance = fps > 0 ? 0.5 / fps : 0.02;
  if (!video.paused) {
    video.pause();
  }

  if (!video.seeking && Math.abs(video.currentTime - preview.sourceTime) > frameTolerance) {
    video.currentTime = Math.max(0, preview.sourceTime);
  }

  if (video.seeking || video.readyState < 2) {
    return false;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const videoAR = video.videoWidth / video.videoHeight;
  const canvasAR = canvas.width / canvas.height;
  let drawWidth = canvas.width;
  let drawHeight = canvas.height;
  let drawX = 0;
  let drawY = 0;

  if (videoAR > canvasAR) {
    drawHeight = Math.floor(canvas.width / videoAR);
    drawY = Math.floor((canvas.height - drawHeight) / 2);
  } else if (videoAR < canvasAR) {
    drawWidth = Math.floor(canvas.height * videoAR);
    drawX = Math.floor((canvas.width - drawWidth) / 2);
  }

  ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
  updateCachedCanvasFrame(canvas, cacheRef);
  return true;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RecordMonitor() {
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const editorIsPlaying = useEditorStore((s) => s.isPlaying);
  const editorTogglePlay = useEditorStore((s) => s.togglePlay);
  const duration = useEditorStore((s) => s.duration);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const setInToPlayhead = useEditorStore((s) => s.setInToPlayhead);
  const setOutToPlayhead = useEditorStore((s) => s.setOutToPlayhead);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const tracks = useEditorStore((s) => s.tracks);
  const bins = useEditorStore((s) => s.bins);
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const enabledTrackIds = useEditorStore((s) => s.enabledTrackIds);
  const videoMonitorTrackId = useEditorStore((s) => s.videoMonitorTrackId);
  const projectFrameRate = useEditorStore((s) => s.projectSettings.frameRate);

  const { setActiveMonitor } = usePlayerStore();
  const audioScrubEnabled = useEditorStore((s) => s.audioScrubEnabled);
  const monitorTransport = useMonitorTransportState(playheadTime, editorIsPlaying);
  const trimPreview = useTrimMonitorPreview({
    tracks,
    bins,
    selectedTrackId,
    enabledTrackIds,
    videoMonitorTrackId,
    sequenceSettings: { fps },
    projectSettings: { frameRate: projectFrameRate },
  });
  const trimPreviewSide = useMemo(() => {
    return trimPreview.recordMonitor ?? trimPreview.bSide ?? trimPreview.aSide;
  }, [trimPreview.aSide, trimPreview.bSide, trimPreview.recordMonitor]);
  const trimPreviewActive = Boolean(trimPreview.active && trimPreviewSide);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const activeAssetIdsRef = useRef<Set<string>>(new Set());
  const cachedFrameRef = useRef<HTMLCanvasElement | null>(null);
  const inFlightFrameRevisionRef = useRef<string | null>(null);
  const requestedFrameRevisionRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 270 });
  const [sourceRevision, setSourceRevision] = useState(0);
  const desktopParityPlaybackActive = useDesktopParityMonitorPlayback({
    consumer: 'record-monitor',
    canvasRef,
    canvasSize,
    disabled: trimPreviewActive,
  });

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

  useEffect(() => {
    return videoSourceManager.subscribe(() => {
      setSourceRevision((revision) => revision + 1);
    });
  }, []);

  // ── Continuous RAF render loop ──────────────────────────────────────────────
  // Uses the shared compositing pipeline for full compositing:
  // intrinsic transforms + effects + titles + subtitles + safe zones.
  useEffect(() => {
    if (desktopParityPlaybackActive) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const { w, h } = canvasSize;
      const renderWidth = Math.max(1, Math.round(w * monitorTransport.renderScale));
      const renderHeight = Math.max(1, Math.round(h * monitorTransport.renderScale));
      if (canvas.width !== renderWidth) {
        canvas.width = renderWidth;
      }
      if (canvas.height !== renderHeight) {
        canvas.height = renderHeight;
      }

      if (trimPreviewSide) {
        for (const previousAssetId of activeAssetIdsRef.current) {
          pauseVideoSource(previousAssetId);
        }
        activeAssetIdsRef.current.clear();

        const renderedTrimPreview = renderTrimPreviewFrame(
          canvas,
          trimPreviewSide,
          bins,
          fps,
          cachedFrameRef,
        );

        if (!renderedTrimPreview && cachedFrameRef.current) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, renderWidth, renderHeight);
            ctx.drawImage(cachedFrameRef.current, 0, 0, renderWidth, renderHeight);
          }
        } else if (!renderedTrimPreview) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            drawTrimPreviewPlaceholder(ctx, renderWidth, renderHeight, trimPreviewSide, fps);
          }
        }

        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Read latest state (non-reactive inside RAF)
      const state = useEditorStore.getState();
      const playerState = usePlayerStore.getState();
      const titleState = useTitleStore.getState();
      const snapshot = buildPlaybackSnapshot({
        tracks: state.tracks,
        subtitleTracks: state.subtitleTracks,
        titleClips: state.titleClips,
        playheadTime: state.playheadTime,
        duration: state.duration,
        isPlaying: state.isPlaying,
        showSafeZones: state.showSafeZones,
        activeMonitor: 'record',
        activeScope: playerState.activeScope,
        sequenceSettings: state.sequenceSettings,
        projectSettings: state.projectSettings,
      }, 'record-monitor');

      const nextAssetIds = new Set<string>();
      for (const layer of snapshot.videoLayers) {
        if (!layer.assetId) {
          continue;
        }
        nextAssetIds.add(layer.assetId);
        if (!activeAssetIdsRef.current.has(layer.assetId)) {
          tryLoadClipSource(layer.assetId, state.bins as any);
        }
        syncVideoPlayback(layer.clip, state.isPlaying, state.playheadTime, state.sequenceSettings.fps);
      }

      for (const previousAssetId of activeAssetIdsRef.current) {
        if (!nextAssetIds.has(previousAssetId)) {
          pauseVideoSource(previousAssetId);
        }
      }
      activeAssetIdsRef.current = nextAssetIds;

      const layerAvailability = inspectPlaybackVideoLayerAvailability(snapshot);
      const canHoldPreviousFrame = layerAvailability.totalVideoLayers > 0
        && layerAvailability.pendingVideoLayers > 0
        && cachedFrameRef.current;

      const fullQualityFrameRevision = buildPlaybackSnapshotRenderRevision({
        snapshot,
        width: renderWidth,
        height: renderHeight,
        currentTitle: titleState.currentTitle,
        isTitleEditing: titleState.isEditing,
        colorProcessing: 'post',
        useCache: true,
      });
      requestedFrameRevisionRef.current = fullQualityFrameRevision;

      const cachedFullQualityFrame = getCachedPlaybackSnapshotCanvas(fullQualityFrameRevision);
      if (cachedFullQualityFrame && (!canHoldPreviousFrame || layerAvailability.pendingVideoLayers === 0)) {
        drawCanvasFrame(canvas, cachedFullQualityFrame);
        updateCachedCanvasFrame(canvas, cachedFrameRef);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      if (canHoldPreviousFrame) {
        const ctx = canvas.getContext('2d');
        if (ctx && cachedFrameRef.current) {
          ctx.clearRect(0, 0, renderWidth, renderHeight);
          ctx.drawImage(cachedFrameRef.current, 0, 0, renderWidth, renderHeight);
        }
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      renderPlaybackSnapshotFrame({
        snapshot,
        width: renderWidth,
        height: renderHeight,
        canvas,
        currentTitle: titleState.currentTitle,
        isTitleEditing: titleState.isEditing,
        colorProcessing: monitorTransport.colorProcessing,
        useCache: monitorTransport.useCache,
      });

      if (layerAvailability.totalVideoLayers > 0 && layerAvailability.pendingVideoLayers === 0) {
        updateCachedCanvasFrame(canvas, cachedFrameRef);
      }

      if (!inFlightFrameRevisionRef.current) {
        inFlightFrameRevisionRef.current = fullQualityFrameRevision;
        void renderPlaybackSnapshotFrameAsync({
          snapshot,
          width: renderWidth,
          height: renderHeight,
          currentTitle: titleState.currentTitle,
          isTitleEditing: titleState.isEditing,
          colorProcessing: 'post',
          useCache: true,
        }).then((result) => {
          if (inFlightFrameRevisionRef.current === result.frameRevision) {
            inFlightFrameRevisionRef.current = null;
          }

          if (
            !result.canvas
            || requestedFrameRevisionRef.current !== result.frameRevision
            || layerAvailability.pendingVideoLayers > 0
          ) {
            return;
          }

          const visibleCanvas = canvasRef.current;
          if (!visibleCanvas) {
            return;
          }

          if (drawCanvasFrame(visibleCanvas, result.canvas)) {
            updateCachedCanvasFrame(visibleCanvas, cachedFrameRef);
          }
        }).catch(() => {
          if (inFlightFrameRevisionRef.current === fullQualityFrameRevision) {
            inFlightFrameRevisionRef.current = null;
          }
        });
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const assetId of activeAssetIdsRef.current) {
        pauseVideoSource(assetId);
      }
      activeAssetIdsRef.current.clear();
    };
  }, [
    bins,
    canvasSize,
    desktopParityPlaybackActive,
    fps,
    monitorTransport.colorProcessing,
    monitorTransport.renderScale,
    monitorTransport.useCache,
    trimPreviewSide,
  ]);

  // Auto-inspect clip at playhead (Premiere Pro behavior — Inspector shows
  // properties for the clip currently visible in the record monitor)
  useEffect(() => {
    const state = useEditorStore.getState();
    if (state.selectedClipIds.length === 0) {
      const clip = findActiveClip(state.tracks, playheadTime);
      if (clip) {
        state.setInspectedClip(clip.id);
      }
    }
  }, [playheadTime]);

  useEffect(() => {
    if (trimPreviewActive) {
      releaseMonitorAudioOutput('record-monitor');
      return;
    }

    const candidate = findTimelineMonitorMediaSource(tracks, playheadTime);
    if (!candidate) {
      releaseMonitorAudioOutput('record-monitor');
      return;
    }

    tryLoadClipSource(candidate.assetId, bins as any);
    const source = videoSourceManager.getSource(candidate.assetId);
    if (!source?.ready) {
      return;
    }

    syncMonitorAudioOutput(
      'record-monitor',
      source.element,
      candidate.sourceTime,
      editorIsPlaying,
      fps,
    );
  }, [bins, editorIsPlaying, fps, playheadTime, sourceRevision, tracks, trimPreviewActive]);

  useEffect(() => {
    return () => {
      releaseMonitorAudioOutput('record-monitor');
    };
  }, []);

  // Transport handlers
  const nudgeTrim = useCallback((frames: number): boolean => {
    if (!trimPreviewActive) {
      return false;
    }

    trimEngine.trimByFrames(frames, fps);
    return true;
  }, [fps, trimPreviewActive]);

  const handlePlayPause = useCallback(() => {
    editorTogglePlay();
  }, [editorTogglePlay]);

  const handleGoToStart = useCallback(() => {
    useEditorStore.getState().setPlayhead(0);
  }, []);

  const handleGoToEnd = useCallback(() => {
    useEditorStore.getState().setPlayhead(duration);
  }, [duration]);

  const handlePrevFrame = useCallback(() => {
    if (nudgeTrim(-1)) {
      return;
    }
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 1 / fps));
  }, [fps, nudgeTrim]);

  const handleNextFrame = useCallback(() => {
    if (nudgeTrim(1)) {
      return;
    }
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 1 / fps);
  }, [fps, nudgeTrim]);

  const handleRewind = useCallback(() => {
    if (nudgeTrim(-10)) {
      return;
    }
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(Math.max(0, current - 2));
  }, [nudgeTrim]);

  const handleFastForward = useCallback(() => {
    if (nudgeTrim(10)) {
      return;
    }
    const current = useEditorStore.getState().playheadTime;
    useEditorStore.getState().setPlayhead(current + 2);
  }, [nudgeTrim]);

  const handleMatchFrame = useCallback(() => {
    matchFrameAtPlayhead();
  }, []);

  const handleMarkIn = useCallback(() => {
    setInToPlayhead();
  }, [setInToPlayhead]);

  const handleMarkOut = useCallback(() => {
    setOutToPlayhead();
  }, [setOutToPlayhead]);

  const handleEnterTrim = useCallback(() => {
    const state = useEditorStore.getState();
    const target = enterTrimModeFromContext(state);
    if (!target) {
      return;
    }

    useEditorStore.getState().setActiveTool('trim');
    useEditorStore.getState().selectTrack(target.anchorTrackId);
    useEditorStore.getState().clearTrimEditPoints();
  }, []);

  const handleFocus = useCallback(() => {
    setActiveMonitor('record');
  }, [setActiveMonitor]);

  const handleSelectTrimASide = useCallback(() => {
    if (trimPreviewActive) {
      trimEngine.selectASide();
    }
  }, [trimPreviewActive]);

  const handleSelectTrimBSide = useCallback(() => {
    setActiveMonitor('record');
    if (trimPreviewActive) {
      trimEngine.selectBSide();
    }
  }, [setActiveMonitor, trimPreviewActive]);

  const handleSelectTrimBothSides = useCallback(() => {
    if (trimPreviewActive) {
      trimEngine.selectBothSides();
    }
  }, [trimPreviewActive]);

  const progress = duration > 0 ? (playheadTime / duration) * 100 : 0;
  const inPos = inPoint !== null && duration > 0 ? (inPoint / duration) * 100 : null;
  const outPos = outPoint !== null && duration > 0 ? (outPoint / duration) * 100 : null;
  const scrubToTime = useCallback((clientX: number, previewAudio: boolean) => {
    const bar = scrubRef.current;
    if (!bar || duration <= 0 || trimPreviewActive) {
      return;
    }

    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = pct * duration;
    setActiveMonitor('record');
    useEditorStore.getState().setPlayhead(nextTime);

    if (!previewAudio || editorIsPlaying) {
      return;
    }

    const state = useEditorStore.getState();
    const candidate = findTimelineMonitorMediaSource(state.tracks, nextTime);
    if (!candidate) {
      releaseMonitorAudioOutput('record-monitor');
      return;
    }

    tryLoadClipSource(candidate.assetId, state.bins as any);
    const source = videoSourceManager.getSource(candidate.assetId);
    if (!source?.ready) {
      return;
    }

    previewMonitorAudioOutput('record-monitor', source.element, candidate.sourceTime);
  }, [duration, editorIsPlaying, setActiveMonitor, trimPreviewActive]);

  const scrubBindings = usePointerScrub({
    disabled: trimPreviewActive || duration <= 0,
    onScrub: ({ clientX, phase }) => {
      scrubToTime(clientX, audioScrubEnabled && phase === 'end');
    },
  });

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    setActiveMonitor('record');
    if (!trimPreviewActive) {
      return;
    }

    if ((event.target as HTMLElement).closest('.trim-status-overlay')) {
      return;
    }

    trimEngine.selectBSide();
  }, [setActiveMonitor, trimPreviewActive]);

  const tc = timeToTimecode(trimPreviewActive && trimPreviewSide ? trimPreviewSide.sourceTime : playheadTime, fps);
  const isActive = usePlayerStore((s) => s.activeMonitor === 'record');
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);
  const recordLabel = trimPreviewActive ? trimPreviewSide!.monitorLabel : 'RECORD';
  const recordMeta = trimPreviewActive && trimPreviewSide
    ? `${trimPreviewSide.trackName} · ${trimPreviewSide.clipName}`
    : null;

  return (
    <div className={`monitor${isActive ? ' monitor-active' : ''}`} onClick={handleFocus} role="region" aria-label="Record Monitor">
      {/* Header */}
      <div className="monitor-header">
        <button
          type="button"
          className={`monitor-label monitor-label-button record${trimPreviewActive ? ' trim-side trim-side-b' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            handleSelectTrimBSide();
          }}
          aria-label={trimPreviewActive ? 'Select B-side trim monitor' : 'Record monitor'}
        >
          {recordLabel}
        </button>
        {recordMeta && (
          <span className="monitor-meta" title={recordMeta}>
            {recordMeta}
          </span>
        )}
        {trimActive && (
          <span className="monitor-trim-summary">
            {trimMode.toUpperCase()} {trimSelectionLabel} {trimCounterFrames > 0 ? '+' : ''}{trimCounterFrames}f
          </span>
        )}
        <DesktopAudioPreviewDiagnostics consumer="record-monitor" />
        <PlaybackFallbackDiagnostics consumer="record-monitor" />
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
        <TrimStatusOverlay />
      </div>

      {!trimPreviewActive && (
        <div
          className="composer-scrubbar"
          ref={scrubRef}
          {...scrubBindings}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Record playback position"
          tabIndex={0}
        >
          {inPos !== null && (
            <div className="composer-scrubbar-mark in" style={{ left: `${inPos}%` }} title={`In: ${timeToTimecode(inPoint!, fps)}`} />
          )}
          {outPos !== null && (
            <div className="composer-scrubbar-mark out" style={{ left: `${outPos}%` }} title={`Out: ${timeToTimecode(outPoint!, fps)}`} />
          )}
          {inPos !== null && outPos !== null && (
            <div className="composer-scrubbar-range" style={{ left: `${inPos}%`, width: `${outPos - inPos}%` }} />
          )}
          <div className="composer-scrubbar-fill" style={{ width: `${progress}%` }} />
          <div className="composer-scrubbar-head" style={{ left: `${progress}%` }} />
        </div>
      )}

      {/* Footer / Transport */}
      <div className="monitor-footer">
        <div className="monitor-footer-group" role="group" aria-label="Record edit controls">
          <button
            className="transport-btn monitor-toolbar-btn"
            onClick={handleMatchFrame}
            title="Match Frame (F)"
            disabled={trimPreviewActive}
          >
            MATCH
          </button>
          <button
            className={`transport-btn monitor-toolbar-btn is-mark${inPoint !== null ? ' active' : ''}`}
            onClick={handleMarkIn}
            title="Mark In (I)"
            disabled={trimPreviewActive}
          >
            IN
          </button>
          <button
            className={`transport-btn monitor-toolbar-btn is-mark${outPoint !== null ? ' active' : ''}`}
            onClick={handleMarkOut}
            title="Mark Out (O)"
            disabled={trimPreviewActive}
          >
            OUT
          </button>
          <button
            className={`transport-btn monitor-toolbar-btn${trimPreviewActive ? ' active' : ''}`}
            onClick={trimPreviewActive ? () => trimEngine.exitTrimMode() : handleEnterTrim}
            title={trimPreviewActive ? 'Exit Trim Mode' : 'Enter Trim Mode'}
          >
            {trimPreviewActive ? 'EXIT' : 'TRIM'}
          </button>
        </div>

        <div className="monitor-footer-group transport-controls" role="group" aria-label="Record transport controls">
          <button className="transport-btn monitor-toolbar-btn" onClick={handleGoToStart} title="Go to Start (Home)" aria-label="Go to start" disabled={trimPreviewActive}>
            |&laquo;
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleRewind} title={trimPreviewActive ? 'Trim Left 10 Frames' : 'Rewind (J)'}>
            &laquo;
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handlePrevFrame} title={trimPreviewActive ? 'Trim Left 1 Frame' : 'Prev Frame (Left)'}>
            &lsaquo;
          </button>
          <button
            className="transport-btn play-btn monitor-toolbar-btn"
            onClick={handlePlayPause}
            title="Play/Pause (Space)"
            disabled={trimPreviewActive}
          >
            {editorIsPlaying ? '\u23F8' : '\u25B6'}
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleNextFrame} title={trimPreviewActive ? 'Trim Right 1 Frame' : 'Next Frame (Right)'}>
            &rsaquo;
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleFastForward} title={trimPreviewActive ? 'Trim Right 10 Frames' : 'Fast Forward (L)'}>
            &raquo;
          </button>
          <button className="transport-btn monitor-toolbar-btn" onClick={handleGoToEnd} title="Go to End (End)" disabled={trimPreviewActive}>
            &raquo;|
          </button>
        </div>

        <div className="monitor-footer-spacer" />

        {trimPreviewActive ? (
          <div className="monitor-footer-group monitor-footer-group-trim" role="group" aria-label="Record trim selection">
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
            {trimPreviewSide && (
              <span className="monitor-toolbar-pill" aria-live="polite">
                {trimPreviewSide.monitorContext}
              </span>
            )}
          </div>
        ) : null}

        <div className="monitor-footer-group">
          <div className="timecode-display monitor-footer-timecode" role="status" aria-live="polite" aria-label="Current timecode">
            {tc}
          </div>
        </div>
      </div>
    </div>
  );
}
