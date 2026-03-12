import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { useTitleStore } from '../../store/title.store';
import { TrimStatusOverlay } from '../Editor/TrimStatusOverlay';
import { PlaybackFallbackDiagnostics } from '../Diagnostics/PlaybackFallbackDiagnostics';
import { buildPlaybackSnapshot } from '../../engine/PlaybackSnapshot';
import { renderPlaybackSnapshotFrame } from '../../engine/playbackSnapshotFrame';
import {
  findActiveClip,
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

// ─── Component ───────────────────────────────────────────────────────────────

export function RecordMonitor() {
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const editorIsPlaying = useEditorStore((s) => s.isPlaying);
  const editorTogglePlay = useEditorStore((s) => s.togglePlay);
  const duration = useEditorStore((s) => s.duration);
  const fps = useEditorStore((s) => s.sequenceSettings.fps);
  const inPoint = useEditorStore((s) => s.inPoint);
  const outPoint = useEditorStore((s) => s.outPoint);
  const tracks = useEditorStore((s) => s.tracks);
  const bins = useEditorStore((s) => s.bins);

  const { setActiveMonitor } = usePlayerStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const lastClipIdRef = useRef<string | null>(null);
  const dragListenersRef = useRef<{ onMove: (ev: MouseEvent) => void; onUp: () => void } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 480, h: 270 });
  const [sourceRevision, setSourceRevision] = useState(0);

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const { w, h } = canvasSize;
      canvas.width = w;
      canvas.height = h;

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

      // Sync video playback for the active clip
      const activeClip = snapshot.primaryVideoLayer?.clip ?? null;

      // Handle clip transitions: pause old clip, start new
      if (activeClip?.assetId !== lastClipIdRef.current) {
        if (lastClipIdRef.current) {
          pauseVideoSource(lastClipIdRef.current);
        }
        lastClipIdRef.current = activeClip?.assetId ?? null;
      }

      // Sync playback for the active clip
      if (activeClip) {
        syncVideoPlayback(activeClip, state.isPlaying, state.playheadTime, state.sequenceSettings.fps);
      }

      // Try loading unloaded clip sources
      if (activeClip?.assetId) {
        tryLoadClipSource(activeClip.assetId, state.bins as any);
      }

      renderPlaybackSnapshotFrame({
        snapshot,
        width: w,
        height: h,
        canvas,
        currentTitle: titleState.currentTitle,
        isTitleEditing: titleState.isEditing,
        colorProcessing: 'post',
        useCache: !state.isPlaying,
      });

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasSize]);

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
  }, [bins, editorIsPlaying, fps, playheadTime, sourceRevision, tracks]);

  useEffect(() => {
    return () => {
      releaseMonitorAudioOutput('record-monitor');
      if (dragListenersRef.current) {
        window.removeEventListener('mousemove', dragListenersRef.current.onMove);
        window.removeEventListener('mouseup', dragListenersRef.current.onUp);
        dragListenersRef.current = null;
      }
    };
  }, []);

  // Transport handlers
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

  const handleMatchFrame = useCallback(() => {
    matchFrameAtPlayhead();
  }, []);

  const handleFocus = useCallback(() => {
    setActiveMonitor('record');
  }, [setActiveMonitor]);

  const progress = duration > 0 ? (playheadTime / duration) * 100 : 0;
  const inPos = inPoint !== null && duration > 0 ? (inPoint / duration) * 100 : null;
  const outPos = outPoint !== null && duration > 0 ? (outPoint / duration) * 100 : null;
  const scrubToTime = useCallback((clientX: number, previewAudio: boolean) => {
    const bar = scrubRef.current;
    if (!bar || duration <= 0) {
      return;
    }

    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = pct * duration;
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
  }, [duration, editorIsPlaying]);

  const handleScrub = useCallback((e: React.MouseEvent) => {
    scrubToTime(e.clientX, true);
  }, [scrubToTime]);

  const handleScrubDrag = useCallback((e: React.MouseEvent) => {
    handleScrub(e);
    const bar = scrubRef.current;
    if (!bar) {
      return;
    }

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
  }, [handleScrub, scrubToTime]);

  const tc = timeToTimecode(playheadTime, fps);
  const isActive = usePlayerStore((s) => s.activeMonitor === 'record');
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);

  return (
    <div className={`monitor${isActive ? ' monitor-active' : ''}`} onClick={handleFocus} role="region" aria-label="Record Monitor">
      {/* Header */}
      <div className="monitor-header">
        <span className="monitor-label record" aria-hidden="true">RECORD</span>
        {trimActive && (
          <span className="monitor-trim-summary">
            {trimMode.toUpperCase()} {trimSelectionLabel} {trimCounterFrames > 0 ? '+' : ''}{trimCounterFrames}f
          </span>
        )}
        <PlaybackFallbackDiagnostics consumer="record-monitor" />
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
        <TrimStatusOverlay />
      </div>

      <div
        className="composer-scrubbar"
        ref={scrubRef}
        onMouseDown={handleScrubDrag}
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

      {/* Footer / Transport */}
      <div className="monitor-footer">
        {/* Match Frame */}
        <button
          className="transport-btn"
          onClick={handleMatchFrame}
          title="Match Frame (F)"
          style={{ fontSize: 10, fontWeight: 600 }}
        >
          F
        </button>

        {/* Transport controls */}
        <div className="transport-controls" role="group" aria-label="Record transport controls">
          <button className="transport-btn" onClick={handleGoToStart} title="Go to Start (Home)" aria-label="Go to start">
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
            {editorIsPlaying ? '\u23F8' : '\u25B6'}
          </button>
          <button className="transport-btn" onClick={handleNextFrame} title="Next Frame (Right)">
            &rsaquo;
          </button>
          <button className="transport-btn" onClick={handleFastForward} title="Fast Forward (L)">
            &raquo;
          </button>
          <button className="transport-btn" onClick={handleGoToEnd} title="Go to End (End)">
            &raquo;|
          </button>
        </div>

        {/* Timecode display */}
        <div className="timecode-display" style={{ marginLeft: 8, minWidth: 100 }} role="status" aria-live="polite" aria-label="Current timecode">
          {tc}
        </div>
      </div>
    </div>
  );
}
