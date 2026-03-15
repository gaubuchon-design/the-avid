import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { useTitleStore } from '../../store/title.store';
import { Timecode } from '../../lib/timecode';
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

/**
 * MonitorArea — Full-record mode composited monitor.
 *
 * Uses the shared compositing pipeline for full compositing:
 * intrinsic transforms + effects + titles + subtitles + safe zones.
 * Identical output to RecordMonitor (dual mode).
 */

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
  const ctx = targetCanvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) {
    return false;
  }

  ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
  return true;
}

export function MonitorArea() {
  const {
    isPlaying, togglePlay, playheadTime, setPlayhead, duration,
    tracks, selectedClipIds, inPoint, outPoint,
    projectSettings,
  } = useEditorStore();
  const bins = useEditorStore((s) => s.bins);
  const sequenceFps = useEditorStore((s) => s.sequenceSettings.fps);
  const audioScrubEnabled = useEditorStore((s) => s.audioScrubEnabled);
  const setActiveMonitor = usePlayerStore((s) => s.setActiveMonitor);
  const monitorTransport = useMonitorTransportState(playheadTime, isPlaying);

  const tc = new Timecode({ fps: projectSettings?.frameRate || 24 });
  const aspectRatio = projectSettings ? projectSettings.width / projectSettings.height : 16 / 9;
  const viewingLabel = projectSettings
    ? `${projectSettings.width}×${projectSettings.height} · ${sequenceFps || projectSettings.frameRate || 24}fps`
    : '--';
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const activeAssetIdsRef = useRef<Set<string>>(new Set());
  const cachedFrameRef = useRef<HTMLCanvasElement | null>(null);
  const inFlightFrameRevisionRef = useRef<string | null>(null);
  const requestedFrameRevisionRef = useRef<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 640, h: 360 });
  const [sourceRevision, setSourceRevision] = useState(0);
  const desktopParityPlaybackActive = useDesktopParityMonitorPlayback({
    consumer: 'program-monitor',
    canvasRef,
    canvasSize,
  });

  // Calculate progress
  const progress = duration > 0 ? (playheadTime / duration) * 100 : 0;
  const inPos = inPoint !== null && duration > 0 ? (inPoint / duration) * 100 : null;
  const outPos = outPoint !== null && duration > 0 ? (outPoint / duration) * 100 : null;

  // ── Canvas sizing — maintain aspect ratio within container ────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: cw, height: ch } = entry.contentRect;
        if (cw <= 0 || ch <= 0) continue;

        const containerAR = cw / ch;
        let w: number, h: number;
        if (containerAR > aspectRatio) {
          h = Math.floor(ch);
          w = Math.floor(h * aspectRatio);
        } else {
          w = Math.floor(cw);
          h = Math.floor(w / aspectRatio);
        }
        setCanvasSize({ w, h });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [aspectRatio]);

  useEffect(() => {
    return videoSourceManager.subscribe(() => {
      setSourceRevision((revision) => revision + 1);
    });
  }, []);

  // ── Continuous RAF render loop ─────────────────────────────────────────
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
      }, 'program-monitor');

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
        effectQuality: 'preview',
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
        effectQuality: monitorTransport.effectQuality,
        useCache: monitorTransport.useCache,
        skipEffects: monitorTransport.skipEffects,
        skipOverlays: monitorTransport.skipOverlays,
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
          effectQuality: 'preview',
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
  }, [canvasSize, desktopParityPlaybackActive, monitorTransport.colorProcessing, monitorTransport.renderScale, monitorTransport.useCache]);

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
    const candidate = findTimelineMonitorMediaSource(tracks, playheadTime);
    if (!candidate) {
      releaseMonitorAudioOutput('program-monitor');
      return;
    }

    tryLoadClipSource(candidate.assetId, bins as any);
    const source = videoSourceManager.getSource(candidate.assetId);
    if (!source?.ready) {
      return;
    }

    syncMonitorAudioOutput(
      'program-monitor',
      source.element,
      candidate.sourceTime,
      isPlaying,
      sequenceFps,
    );
  }, [bins, isPlaying, playheadTime, sequenceFps, sourceRevision, tracks]);

  // ── Scrub bar ──────────────────────────────────────────────────────────
  const scrubToTime = useCallback((clientX: number, previewAudio: boolean) => {
    const bar = scrubRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = pct * duration;
    setActiveMonitor('record');
    setPlayhead(nextTime);

    if (!previewAudio || isPlaying) {
      return;
    }

    const state = useEditorStore.getState();
    const candidate = findTimelineMonitorMediaSource(state.tracks, nextTime);
    if (!candidate) {
      releaseMonitorAudioOutput('program-monitor');
      return;
    }

    tryLoadClipSource(candidate.assetId, state.bins as any);
    const source = videoSourceManager.getSource(candidate.assetId);
    if (!source?.ready) {
      return;
    }

    previewMonitorAudioOutput('program-monitor', source.element, candidate.sourceTime);
  }, [duration, isPlaying, setActiveMonitor, setPlayhead]);

  const scrubBindings = usePointerScrub({
    disabled: duration <= 0,
    onScrub: ({ clientX, phase }) => {
      scrubToTime(clientX, audioScrubEnabled && phase === 'end');
    },
  });

  useEffect(() => {
    return () => {
      releaseMonitorAudioOutput('program-monitor');
    };
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────
  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  return (
    <div className="composer-monitor" ref={containerRef} role="region" aria-label="Program Monitor">
      {/* Video canvas */}
      <div className="composer-canvas">
        {/* Visible canvas for composited output */}
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

        {/* Timecode overlay */}
        <div className="monitor-tc-overlay" role="status" aria-live="polite">
          {tc.secondsToTC(playheadTime)}
        </div>

        <div
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <DesktopAudioPreviewDiagnostics consumer="program-monitor" />
          <PlaybackFallbackDiagnostics consumer="program-monitor" />
        </div>

        <TrimStatusOverlay />

        {/* Controls overlay — top right */}
        <div className="composer-controls-overlay">
          <button className="composer-ctrl-btn" title="Toggle Fullscreen" aria-label="Toggle Fullscreen" onClick={handleFullscreen}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrub bar */}
      <div
        className="composer-scrubbar"
        ref={scrubRef}
        {...scrubBindings}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Playback position"
        tabIndex={0}
      >
        {inPos !== null && (
          <div className="composer-scrubbar-mark in" style={{ left: `${inPos}%` }} title={`In: ${tc.secondsToTC(inPoint!)}`} />
        )}
        {outPos !== null && (
          <div className="composer-scrubbar-mark out" style={{ left: `${outPos}%` }} title={`Out: ${tc.secondsToTC(outPoint!)}`} />
        )}
        {inPos !== null && outPos !== null && (
          <div className="composer-scrubbar-range" style={{ left: `${inPos}%`, width: `${outPos - inPos}%` }} />
        )}
        <div className="composer-scrubbar-fill" style={{ width: `${progress}%` }} />
        <div className="composer-scrubbar-head" style={{ left: `${progress}%` }} />
      </div>

      {/* Transport */}
      <div className="composer-transport">
        <button
          className="composer-play-btn"
          onClick={togglePlay}
          title="Play/Pause (Space)"
          aria-label="Play/Pause (Space)"
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

      {/* Status bar */}
      <div className="composer-status-bar">
        <span>{viewingLabel}</span>
        <span>{selectedClipIds.length} selected</span>
        {trimActive && (
          <span>Trim: {trimMode.toUpperCase()} {trimSelectionLabel} {trimCounterFrames > 0 ? '+' : ''}{trimCounterFrames}f</span>
        )}
      </div>
    </div>
  );
}
